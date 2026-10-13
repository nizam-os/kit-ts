import type { Kysely } from 'kysely';

import type { Page, QueryEvent } from '@nizam-os/kysely-keyset';

import type { DB, Harness } from './support/db.ts';

/**
 * Cursors bound to the tenant (SPEC 6.1, 14.4, ADR 0015): an
 * organization-scoped table where every query filters on `org_id` and
 * passes the same organization as the cursor context, the way a
 * multi-tenant API would. A cursor resumes inside the organization that
 * issued it and is rejected inside another before any query runs, even
 * though the sort, filter, and search are identical. Without a context it
 * crosses over and seeks with the other organization's values, which is
 * what the binding prevents. Runs through each binding on PGlite, and on
 * the server `KEYSET_PG_URL` names when set.
 */
import { eq } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDefineKeyset as createDrizzleDefineKeyset } from '@nizam-os/drizzle-keyset';
import { createDefineKeyset, InvalidCursorError } from '@nizam-os/kysely-keyset';

import { databases } from './support/db.ts';
import { SECRET } from './support/keysets.ts';

interface ProjectsTable {
  id: string;
  org_id: string;
  name: string;
  created_at: string | Date;
}

type TenantDB = DB & { projects: ProjectsTable };

const ORGS = ['acme', 'globex'] as const;
type Org = (typeof ORGS)[number];
const PER_ORG = 5;
const PAGE_SIZE = 2;

/** Five projects per organization with interleaved creation times. */
const PROJECTS: ReadonlyArray<ProjectsTable> = ORGS.flatMap((org, o) =>
  Array.from({ length: PER_ORG }, (_, i) => ({
    id: `00000000-0000-4000-8000-0000000${String(o)}${String(i).padStart(4, '0')}`,
    org_id: org,
    name: `${org} ${String(i)}`,
    created_at: new Date(
      Date.UTC(2026, 0, 1, 0, i * ORGS.length + o),
    ).toISOString(),
  })),
);

/** An organization's project ids, newest first: what `-createdAt` must produce. */
function expected(org: Org): Array<string> {
  return PROJECTS.filter((project) => project.org_id === org)
    .toSorted((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    )
    .map((project) => project.id);
}

const DEFAULTS = {
  cursor: { secret: SECRET },
  page: { default: PAGE_SIZE, max: 10 },
} as const;

const projects = createDefineKeyset<TenantDB>(DEFAULTS)({
  table: 'projects',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text' },
    createdAt: { column: 'created_at', type: 'timestamptz' },
  },
  sort: { default: ['-createdAt'] },
});

const projectsTable = pgTable('projects', {
  id: uuid('id').primaryKey(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

const drizzleProjects = createDrizzleDefineKeyset(
  { projects: projectsTable },
  DEFAULTS,
)({
  table: 'projects',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text' },
    createdAt: { column: 'createdAt', type: 'timestamptz' },
  },
  sort: { default: ['-createdAt'] },
});

interface Scope {
  /** Bind the cursors to the organization; an endpoint that forgets to does not. */
  readonly bound: boolean;
  readonly events?: Array<QueryEvent> | undefined;
}

/** One organization's rows, the scope every query of its API applies, through a binding. */
type Pager = (
  harness: Harness,
  org: Org,
  after: string | undefined,
  scope: Scope,
) => Promise<Page<{ id: string }>>;

function optionsOf(org: Org, scope: Scope) {
  return {
    context: scope.bound ? { org } : undefined,
    onQuery: (event: QueryEvent) => {
      scope.events?.push(event);
    },
  };
}

const PAGERS: ReadonlyArray<readonly [string, Pager]> = [
  [
    'Kysely',
    async (harness, org, after, scope) =>
      projects.paginate(
        harness.db
          .$extendTables<{ projects: ProjectsTable }>()
          .selectFrom('projects')
          .where('org_id', '=', org)
          .select('id'),
        { page: { after } },
        optionsOf(org, scope),
      ),
  ],
  [
    'Drizzle',
    async (harness, org, after, scope) =>
      drizzleProjects.paginate(
        harness.drizzle,
        { page: { after } },
        {
          ...optionsOf(org, scope),
          select: { id: projectsTable.id },
          where: eq(projectsTable.orgId, org),
        },
      ),
  ],
];

describe.each(databases())('%s: cursors bound to the tenant', (_name, open) => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await open();
    const db: Kysely<TenantDB> = harness.db.$extendTables<{
      projects: ProjectsTable;
    }>();
    await sql`create table projects (
      id uuid primary key,
      org_id text not null,
      name text not null,
      created_at timestamptz not null
    )`.execute(db);
    await db
      .insertInto('projects')
      .values([...PROJECTS])
      .execute();
  });
  afterAll(async () => {
    await harness.close();
  });

  describe.each(PAGERS)('through %s', (_binding, pager) => {
    /** One organization's view: its rows, and its id as the cursor context. */
    async function page(org: Org, after?: string, events?: Array<QueryEvent>) {
      return pager(harness, org, after, { bound: true, events });
    }

    it('walks every project of one organization with cursors bound to it', async () => {
      for (const org of ORGS) {
        const seen: Array<string> = [];
        let current = await page(org);
        seen.push(...current.rows.map((row) => row.id));
        while (current.next !== null) {
          current = await page(org, current.next);
          seen.push(...current.rows.map((row) => row.id));
        }
        expect(seen).toEqual(expected(org));
      }
    });

    it("rejects one organization's cursor inside another before any query runs", async () => {
      const acme = await page('acme');
      const events: Array<QueryEvent> = [];
      const error: unknown = await page(
        'globex',
        acme.next ?? '',
        events,
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(InvalidCursorError);
      expect(error).toMatchObject({ parameter: 'after', reason: 'context' });
      expect(events).toEqual([]);
    });

    it('fails closed when an endpoint forgets the context, or adds one later', async () => {
      const bound = await page('acme');
      await expect(
        pager(harness, 'acme', bound.next ?? '', { bound: false }),
      ).rejects.toMatchObject({ reason: 'context' });
      const unbound = await pager(harness, 'acme', undefined, {
        bound: false,
      });
      await expect(page('acme', unbound.next ?? '')).rejects.toMatchObject({
        reason: 'context',
      });
    });

    it("without a context, a cursor crosses over and seeks with another organization's values", async () => {
      const unbound = { bound: false };
      const acme = await pager(harness, 'acme', undefined, unbound);
      const crossed = await pager(harness, 'globex', acme.next ?? '', unbound);
      // Accepted: the globex page starts below acme's second project, so it
      // skips the globex projects created after it.
      const [, second] = expected('acme');
      const boundary = PROJECTS.find((project) => project.id === second);
      const globexOlder = expected('globex').filter((id) => {
        const project = PROJECTS.find((candidate) => candidate.id === id);
        return String(project?.created_at) < String(boundary?.created_at);
      });
      expect(crossed.rows.map((row) => row.id)).toEqual(
        globexOlder.slice(0, PAGE_SIZE),
      );
      expect(globexOlder.length).toBeLessThan(PER_ORG);
    });
  });
});
