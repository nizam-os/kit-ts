/**
 * A deep page inside a tie, or past a nullable first key, reads about a
 * page per seek branch (keyset ADR 0020). On a PostgreSQL server, 10 000
 * members joined at the same time, a quarter have no nickname, and each
 * sort has an index in its own order. Halfway down `-joined`, the page
 * bounds the key inside the tie; after a nickname, it bounds the
 * nicknames and reads the nulls through a branch of their own; after a
 * null, it bounds the key among the nulls. Each page holds the rows an
 * offset over the same order holds, through Kysely and through Drizzle.
 * Runs only when `KEYSET_PG_URL` names a server: only a server's planner
 * shows the plan production runs.
 * @ref https://www.postgresql.org/docs/current/indexes-ordering.html
 * @ref https://www.postgresql.org/docs/current/using-explain.html
 */
import type { QueryEvent } from '@nizam-os/kysely-keyset';

import type { PlanNode } from './support/explain.ts';

import { drizzle } from 'drizzle-orm/node-postgres';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDefineKeyset as createDrizzleDefineKeyset } from '@nizam-os/drizzle-keyset';
import { createDefineKeyset } from '@nizam-os/kysely-keyset';

import { explainPage, scansOf } from './support/explain.ts';
import { SECRET } from './support/keysets.ts';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Pool } = pg` for ESM
const { Pool } = pg;

const URL = process.env['KEYSET_PG_URL'];
const ROWS = 10_000;
/** The page whose plan is read. */
const SIZE = 100;
/** The pages walked to reach a cursor deep in the list. */
const STRIDE = 1000;
/** Halfway down the list: inside the tie, or among the nicknames. */
const HALFWAY = 5;
/** Past the 7 500 nicknames: among the nulls. */
const AMONG_NULLS = 8;
/** A page and the row that tells whether another follows: what a seek branch reads at most. */
const LIMIT = SIZE + 1;
const INDEX_SCAN = /^Index (?:Only )?Scan$/u;
/**
 * The indexes that bound the key inside the tie: the sort's, or the key's
 * own, which the planner may take since every row joined at once.
 */
const TIE_INDEX = /^members_(?:joined_id|pkey)$/u;
const JOINED_ORDER = 'joined desc, id';
const NICKNAME_ORDER = 'nickname desc nulls last, id';

interface MembersDB {
  members: { id: number; joined: Date; nickname: string | null };
}

const FIELDS = {
  id: { column: 'id', type: 'integer' },
  joined: { column: 'joined', type: 'timestamptz' },
  nickname: { column: 'nickname', type: 'text', nullable: true },
} as const;

const membersTable = pgTable('members', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  joined: timestamp('joined', { withTimezone: true }).notNull(),
  nickname: text('nickname'),
});

const kyselyMembers = createDefineKeyset<MembersDB>({
  cursor: { secret: SECRET },
})({ table: 'members', key: ['id'], fields: FIELDS, page: { max: STRIDE } });
const drizzleMembers = createDrizzleDefineKeyset(
  { members: membersTable },
  { cursor: { secret: SECRET } },
)({ table: 'members', key: ['id'], fields: FIELDS, page: { max: STRIDE } });

type Request = Parameters<typeof kyselyMembers.paginate>[1];

/** A page of member ids through one binding, its queries reported to `onQuery`. */
type Pager = (
  request: Request,
  onQuery?: (event: QueryEvent) => void,
) => Promise<{ ids: Array<number>; next: string | null }>;

/** An index scan of `index`, or of an index `index` matches, whose index condition matches `condition`. */
function indexScan(index: string | RegExp, condition: RegExp): unknown {
  return expect.objectContaining({
    'Node Type': expect.stringMatching(INDEX_SCAN),
    'Index Name':
      typeof index === 'string' ? index : expect.stringMatching(index),
    'Index Cond': expect.stringMatching(condition),
  });
}

describe.skipIf(URL === undefined)(
  'PostgreSQL server: a deep page inside a tie or past a nullable first key reads a page per seek branch',
  () => {
    const schema = `keyset_ties_${Date.now().toString(36)}`;
    let pool: pg.Pool;
    let db: Kysely<MembersDB>;

    beforeAll(async () => {
      const admin = new Pool({ connectionString: URL, max: 1 });
      await admin.query(`create schema ${schema}`);
      await admin.end();
      pool = new Pool({
        connectionString: URL,
        max: 2,
        options: `-c search_path=${schema}`,
      });
      await pool.query(`
        create table members (
          id int4 generated always as identity primary key,
          joined timestamptz not null,
          nickname text
        );
        insert into members (joined, nickname)
          select timestamptz '2025-01-01 00:00:00+00',
            case when n % 4 = 0 then null else md5(n::text) end
          from generate_series(1, ${String(ROWS)}) as n;
        create index members_joined_id on members (joined desc, id);
        create index members_nickname_id on members (nickname desc nulls last, id);
        analyze members;`);
      db = new Kysely<MembersDB>({ dialect: new PostgresDialect({ pool }) });
    });
    afterAll(async () => {
      await pool.query(`drop schema ${schema} cascade`);
      await db.destroy();
    });

    const bindings: ReadonlyArray<{ name: string; page: Pager }> = [
      {
        name: 'Kysely',
        page: async (request, onQuery) => {
          const page = await kyselyMembers.paginate(
            db.selectFrom('members').select('id'),
            request,
            { onQuery },
          );
          return { ids: page.rows.map((row) => row.id), next: page.next };
        },
      },
      {
        name: 'Drizzle',
        page: async (request, onQuery) => {
          const page = await drizzleMembers.paginate(
            drizzle({ client: pool }),
            request,
            { onQuery, select: { id: membersTable.id } },
          );
          return { ids: page.rows.map((row) => row.id), next: page.next };
        },
      },
    ];

    /** The ids `order` puts after the first `offset` rows: the page a cursor there gives. */
    async function offsetPage(
      order: string,
      offset: number,
    ): Promise<Array<number>> {
      const { rows } = await pool.query<{ id: number }>(
        `select id from members order by ${order} limit $1 offset $2`,
        [SIZE, offset],
      );
      return rows.map((row) => row.id);
    }

    describe.each(bindings)('$name', ({ page }) => {
      /** The cursor on the last row of the first `depth` pages of `sort`. */
      async function cursorAt(
        sort: Request['sort'],
        depth: number,
      ): Promise<string> {
        let after: string | undefined;
        for (let walked = 0; walked < depth; walked += 1) {
          after =
            (await page({ sort, page: { size: STRIDE, after } })).next ??
            undefined;
        }
        if (after === undefined) {
          throw new Error('the list ended early');
        }
        return after;
      }

      /** The page `request` asks for, and its plan as EXPLAIN ANALYZE runs it. */
      async function explained(
        request: Request,
      ): Promise<{ ids: Array<number>; plan: PlanNode }> {
        const events: Array<QueryEvent> = [];
        const { ids } = await page(request, (event) => {
          events.push(event);
        });
        return { ids, plan: await explainPage(pool, events) };
      }

      it('inside the tie, after a cursor: the key bounded at the cursor, a page read', async () => {
        const after = await cursorAt(['-joined'], HALFWAY);
        const { ids, plan } = await explained({
          sort: ['-joined'],
          page: { size: SIZE, after },
        });
        const { scans, read } = scansOf(plan);
        expect(scans).toEqual([
          indexScan('members_joined_id', /^\(joined < '/u),
          indexScan(TIE_INDEX, /\(id > \d+\)\)?$/u),
        ]);
        expect(read).toBeLessThanOrEqual(LIMIT);
        expect(ids).toEqual(await offsetPage(JOINED_ORDER, HALFWAY * STRIDE));
      });

      it('inside the tie, before a cursor: the key bounded at the cursor, a page read', async () => {
        const before = await cursorAt(['-joined'], HALFWAY);
        const { ids, plan } = await explained({
          sort: ['-joined'],
          page: { size: SIZE, before },
        });
        const { scans, read } = scansOf(plan);
        expect(scans).toEqual([
          indexScan('members_joined_id', /^\(joined > '/u),
          indexScan(TIE_INDEX, /\(id < \d+\)\)?$/u),
        ]);
        expect(read).toBeLessThanOrEqual(LIMIT);
        expect(ids).toEqual(
          await offsetPage(JOINED_ORDER, HALFWAY * STRIDE - 1 - SIZE),
        );
      });

      it('after a nickname: the nicknames bounded at the cursor, the nulls read through their own branch', async () => {
        const after = await cursorAt(['-nickname'], HALFWAY);
        const { ids, plan } = await explained({
          sort: ['-nickname'],
          page: { size: SIZE, after },
        });
        const { scans, read } = scansOf(plan);
        expect(scans).toEqual([
          indexScan('members_nickname_id', /^\(nickname < '/u),
          indexScan('members_nickname_id', /^\(nickname IS NULL\)$/u),
          indexScan(
            'members_nickname_id',
            /^\(\(nickname = '.+\) AND \(id > \d+\)\)$/u,
          ),
        ]);
        expect(read).toBeLessThanOrEqual(2 * LIMIT);
        expect(ids).toEqual(await offsetPage(NICKNAME_ORDER, HALFWAY * STRIDE));
      });

      it('after a null: one branch, the key bounded among the nulls', async () => {
        const after = await cursorAt(['-nickname'], AMONG_NULLS);
        const { ids, plan } = await explained({
          sort: ['-nickname'],
          page: { size: SIZE, after },
        });
        const { scans, read } = scansOf(plan);
        expect(scans).toEqual([
          indexScan(
            'members_nickname_id',
            /^\(\(nickname IS NULL\) AND \(id > \d+\)\)$/u,
          ),
        ]);
        expect(read).toBeLessThanOrEqual(LIMIT);
        expect(ids).toEqual(
          await offsetPage(NICKNAME_ORDER, AMONG_NULLS * STRIDE),
        );
      });

      it('walks -nickname through every row in the order an offset gives', async () => {
        const seen: Array<number> = [];
        let after: string | undefined;
        do {
          const next = await page({
            sort: ['-nickname'],
            page: { size: STRIDE, after },
          });
          seen.push(...next.ids);
          after = next.next ?? undefined;
        } while (after !== undefined);
        const { rows } = await pool.query<{ id: number }>(
          `select id from members order by ${NICKNAME_ORDER}`,
        );
        expect(seen).toEqual(rows.map((row) => row.id));
      });
    });
  },
);
