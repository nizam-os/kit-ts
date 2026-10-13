/**
 * The error codes of the contacts application (resource SPEC 9), through
 * the built package. Every resource's codes match the reviewed snapshot.
 * Every code is one PostgreSQL raises: the statement `support/violations.ts`
 * holds for it is refused with the SQLSTATE of the code's kind, naming the
 * constraint, the NOT NULL column, or the domain the code stands for, on
 * PGlite and on the server `RESOURCE_PG_URL` names. A table's constraint
 * names the table; a domain's CHECK names the domain in `dataType` and no
 * table or column (resource SPEC 9.5), and `constraintError` gives each
 * refusal its code's error, with an item per member and the driver's
 * error as the cause. A remove's refusal, which names the referencing
 * table, is `CONFLICT`. `errorCatalog`
 * assembles the four resources into one `@nizam-os/ban-core` catalog, and
 * JavaScript callers get its registry checks as a `TypeError`.
 * @ref https://www.postgresql.org/docs/18/errcodes-appendix.html
 */
import type { DeclaredResource, ErrorEntry } from '@nizam-os/resource-core';

import type { OracleDatabase } from './support/oracle-database.ts';
import type { Violation } from './support/violations.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBan } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';
import { ERROR_CATALOG } from '@nizam-os/jsonapi-core';
import { errorCatalog } from '@nizam-os/resource-core';
import { constraintError } from '@nizam-os/resource-core/server';

import { publicCatalog } from './fixtures/contacts/public-catalog.ts';
import { Contacts } from './resources/contacts.ts';
import { Meetings } from './resources/meetings.ts';
import { Notes } from './resources/notes.ts';
import { Organizations } from './resources/organizations.ts';
import { CONTACTS_SCHEMA, liveDatabases } from './support/oracle-database.ts';
import { declareUntyped, typeErrorOf } from './support/untyped.ts';
import { SEED, VIOLATIONS } from './support/violations.ts';

const RESOURCES = [Organizations, Contacts, Meetings, Notes] as const;

/** `server_version_num` of PostgreSQL 18.0, the first major that raises 23001 for ON DELETE RESTRICT. */
const POSTGRES_18 = 180_000;
/** The columns of a table referencing a contact, by what the reference does when the contact is removed. */
const REFERRERS: Readonly<Record<string, string>> = {
  'ON DELETE RESTRICT':
    'contact_id uuid not null references contacts (id) on delete restrict',
  'ON DELETE SET NULL against a CHECK':
    'contact_id uuid references contacts (id) on delete set null, label text, check (contact_id is not null or label is not null)',
};

/** The SQLSTATE PostgreSQL raises for a violation of each kind. */
const SQLSTATES: Readonly<Record<ErrorEntry['kind'], string>> = {
  check: '23514',
  notNull: '23502',
  unique: '23505',
  primaryKey: '23505',
  exclusion: '23P01',
  foreignKey: '23503',
};

/** `errorCatalog` as JavaScript calls it: no type checks the list. */
function untypedCatalog(resources: unknown): unknown {
  return Reflect.apply(errorCatalog, undefined, [resources]);
}

/** The fields of a PostgreSQL error both drivers expose. */
interface Refusal {
  readonly code?: string;
  readonly constraint?: string;
  readonly table?: string;
  readonly column?: string;
  readonly dataType?: string;
}

/** What PostgreSQL refuses `sql` with, after `setup`, in a transaction it rolls back. */
async function refusalOf(
  database: OracleDatabase,
  sql: string,
  setup: ReadonlyArray<string> = [],
): Promise<Refusal> {
  await database.query('begin');
  try {
    for (const statement of setup) {
      await database.query(statement);
    }
    await database.query(sql);
  } catch (error) {
    return error as Refusal;
  } finally {
    await database.query('rollback');
  }
  throw new Error(`PostgreSQL accepted ${sql}`);
}

/**
 * The code a refusal stands for. A NOT NULL violation names its column and
 * table, never a constraint, so its rule key is the NOT NULL key (SPEC
 * 3.5); a domain CHECK names the domain and the constraint but no table,
 * and the contacts definer gives no domain code, so the code is the
 * constraint's name upper-cased (SPEC 3.6); any other names its constraint.
 */
function codeOf(
  resource: DeclaredResource,
  refusal: Refusal,
): string | undefined {
  if (refusal.code === SQLSTATES.notNull) {
    return resource.names.rules.get(
      `${String(refusal.table)}_${String(refusal.column)}_not_null`,
    );
  }
  if (refusal.table === undefined) {
    return refusal.constraint?.toUpperCase();
  }
  return resource.names.rules.get(String(refusal.constraint));
}

/** The JSON Pointer tokens of a member under `/data`, as `constraintError` puts its items (SPEC 9.5). */
function pathOf(
  resource: DeclaredResource,
  member: string,
): ReadonlyArray<string> {
  if (member === 'id') {
    return ['data', 'id'];
  }
  return resource.names.relationships.has(member)
    ? ['data', 'relationships', member]
    : ['data', 'attributes', member];
}

/** The domain CHECK a refusal without a table names: `dataType` is the domain. */
function domainCheckOf(refusal: Refusal): unknown {
  const domains: Readonly<
    Record<string, { readonly constraints: Readonly<Record<string, unknown>> }>
  > = publicCatalog.domains;
  return Object.hasOwn(domains, String(refusal.dataType))
    ? domains[String(refusal.dataType)]?.constraints[String(refusal.constraint)]
    : undefined;
}

/** JSON with each list of fields on one line, as the formatter keeps it. */
function snapshotText(value: unknown): string {
  const text = JSON.stringify(value, null, 2).replaceAll(
    /\[\n\s+([^[\]{}]*?)\n\s+\]/gu,
    (_list, items: string) => `[${items.split(/,\n\s+/u).join(', ')}]`,
  );
  return `${text}\n`;
}

describe('the derived codes', () => {
  it('match the reviewed snapshot', async () => {
    const record = Object.fromEntries(
      RESOURCES.map((resource) => [resource.table, resource.errors]),
    );
    await expect(snapshotText(record)).toMatchFileSnapshot(
      'snapshots/errors.json',
    );
  });

  it.each(RESOURCES.map((resource) => [resource.table, resource] as const))(
    'of %s each have one violation, in order',
    (_table, resource) => {
      const codes = VIOLATIONS.filter(
        (violation) => violation.resource === resource,
      ).map(({ code }) => code);
      expect(codes).toEqual(Object.keys(resource.errors));
    },
  );
});

for (const [name, open] of liveDatabases(CONTACTS_SCHEMA)) {
  describe(`what ${name} refuses`, () => {
    let database: OracleDatabase;

    beforeAll(async () => {
      database = await open();
      for (const sql of SEED) {
        await database.query(sql);
      }
    });

    afterAll(async () => {
      await database.close();
    });

    it.each(VIOLATIONS.map((violation) => [violation.code, violation]))(
      '%s',
      async (_code, { resource, code, sql }: Violation) => {
        const refusal = await refusalOf(database, sql);
        const entry = resource.errors[code];
        expect(entry).toBeDefined();
        expect(refusal.code).toBe(
          entry === undefined ? undefined : SQLSTATES[entry.kind],
        );
        expect(codeOf(resource, refusal)).toBe(code);
        const error = constraintError(refusal, {
          resource,
          operation: 'create',
        });
        expect(error?.code).toBe(code);
        expect(error?.status).toBe(entry?.status);
        expect(error?.cause).toBe(refusal);
        expect(error?.errors?.map((item) => item.path) ?? []).toEqual(
          entry?.fields.map((member) => pathOf(resource, member)),
        );
        if (entry?.kind === 'notNull') {
          expect(refusal.constraint).toBeUndefined();
        }
        if (resource.names.codes.has(code)) {
          expect(refusal.table).toBe(resource.table);
        } else {
          expect([refusal.table, refusal.column]).toEqual([
            undefined,
            undefined,
          ]);
          expect(domainCheckOf(refusal)).toBeDefined();
        }
      },
    );

    it.each(Object.entries(REFERRERS))(
      'the remove of a contact a row references %s, which is CONFLICT',
      async (_action, columns) => {
        const [row] = await database.query(
          "select current_setting('server_version_num')::int as version",
        );
        const restrict =
          Number(row?.['version']) >= POSTGRES_18 ? '23001' : '23503';
        const refusal = await refusalOf(
          database,
          "delete from contacts where name = 'Pinned'",
          [
            "insert into contacts (organization_id, name) values (1, 'Pinned')",
            `create table contact_pins (${columns})`,
            "insert into contact_pins (contact_id) select id from contacts where name = 'Pinned'",
          ],
        );
        expect(refusal).toMatchObject({
          code: columns.includes('restrict') ? restrict : '23514',
          table: 'contact_pins',
        });
        expect(
          constraintError(refusal, { resource: Contacts, operation: 'remove' }),
        ).toMatchObject({ status: 409, code: 'CONFLICT', cause: refusal });
      },
    );
  });
}

describe('errorCatalog over the four resources', () => {
  const appErrors = {
    SEAT_LIMIT: { status: 402, title: 'Seat Limit' },
  } as const;

  it('assembles one catalog that renders JSON:API errors', () => {
    const ban = createBan({
      format: jsonApi(),
      id: () => 'e1',
      errors: { ...ERROR_CATALOG, ...errorCatalog(RESOURCES, appErrors) },
    });
    const detail = 'Another record already has this value.';
    const rendered = ban.render(ban.CONTACT_EMAIL_TAKEN({ detail }));
    expect(rendered.status).toBe(409);
    expect(rendered.body).toStrictEqual({
      errors: [
        {
          id: 'e1',
          status: '409',
          code: 'CONTACT_EMAIL_TAKEN',
          title: 'Conflict',
          detail,
        },
      ],
    });
    expect(ban.render(ban.error('MEETING_ROOM_DOUBLE_BOOKED')).status).toBe(
      409,
    );
    expect(ban.render(ban.error('NOTES_AUTHOR_FKEY')).status).toBe(404);
    expect(ban.render(ban.error('QUOTA_EXCEEDED')).status).toBe(403);
  });

  it('refuses at runtime what the registry checks refuse', () => {
    const Memos = declareUntyped('notes', {
      as: 'memos',
      operations: ['get', 'create'],
      fields: {
        type: { access: 'immutable', as: 'kind' },
        body: { access: 'readWrite' },
      },
      rules: { notes_body_check: { code: 'CONTACTS_NAME_CHECK' } },
    });
    expect(typeErrorOf(() => untypedCatalog([...RESOURCES, Memos]))).toBe(
      'errorCatalog: code CONTACTS_NAME_CHECK is derived by contacts from contacts.contacts_name_check and by memos from notes.notes_body_check, so all but one need a code',
    );
    expect(typeErrorOf(() => untypedCatalog([Contacts]))).toBe(
      'errorCatalog: relationship contacts.organization targets organizations, which is not listed',
    );
  });
});
