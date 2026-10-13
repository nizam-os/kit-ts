/**
 * The PGlite Kysely types in an application (SPEC 9.2, 13.1, ADR 0013):
 * the contacts application on PGlite through Kysely's `PGliteDialect`, with
 * `db-pglite.ts`, the types `renderKyselyTypes` writes with
 * `driver: 'pglite'`, as its `DB`. The typecheck script compiles this file,
 * so the query results must have the types written here; at runtime, every
 * value PGlite reads back from every column must have the declared select
 * type.
 * @ref https://pglite.dev/docs/orm-support#kysely
 */
import type { PGlite } from '@electric-sql/pglite';
import type { Insertable, Selectable } from 'kysely';

import type {
  ContactKind,
  DB,
  JsonValue,
} from './fixtures/contacts/expected/db-pglite.ts';

import { readFile } from 'node:fs/promises';

import { Kysely, PGliteDialect } from 'kysely';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';

import { parseCatalogModule, renderKyselyTypes } from '@nizam-os/pg-catalog';

import { EXPECTED_CATALOG, EXPECTED_PGLITE_TYPES } from './support/contacts';
import { readDeclaredTypes } from './support/declared-types';
import { asTenant, readEveryColumn } from './support/kysely-app';
import { openMigratedPglite } from './support/live-database';

const PAYLOAD = { name: 'Ada Lovelace', tags: ['mathematics', 'engines'] };

/** One row in every table, written through the generated insert types; returns the tenant. */
async function seed(db: Kysely<DB>): Promise<number | bigint> {
  const organization = await db
    .insertInto('organizations')
    .values({ name: 'Analytical Engines', slug: 'analytical', country: 'GB' })
    .returning('id')
    .executeTakeFirstOrThrow();
  await asTenant(db, organization.id, async (trx) => {
    const contact = await trx
      .insertInto('contacts')
      .values({
        organization_id: organization.id,
        kind: 'person',
        name: 'Ada Lovelace',
        nickname: 'Ada',
        email: 'ada@example.com',
        website: 'https://ada.example.com',
        priority: 1,
        discount: 12.5,
        tags: ['mathematics', 'engines'],
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('contact_phones')
      .values({
        contact_id: contact.id,
        position: 0,
        number: '+44 20 7946 0000',
      })
      .execute();
    await trx
      .insertInto('meetings')
      .values({
        organization_id: organization.id,
        contact_id: contact.id,
        room: 'Babbage',
        during: '[2026-02-03 10:00:00+00,2026-02-03 11:00:00+00)',
        notes: 'Bernoulli numbers',
      })
      .execute();
    const activity = await trx
      .insertInto('activities')
      .values({
        contact_id: contact.id,
        occurred_on: '2026-02-03',
        summary: 'Kick-off',
      })
      .returning(['id', 'occurred_on'])
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('activity_attachments')
      .values({
        activity_id: activity.id,
        occurred_on: activity.occurred_on,
        file_name: 'notes.pdf',
      })
      .execute();
    // PGlite sends a JSON value with JSON.stringify: no JSON.stringify of our own.
    await trx
      .insertInto('audit.changes')
      .values({
        table_name: 'contacts',
        operation: 'insert',
        row_id: contact.id,
        payload: PAYLOAD,
      })
      .execute();
  });
  return organization.id;
}

it('db-pglite.ts is what renderKyselyTypes writes with the PGlite driver', async () => {
  const catalog = parseCatalogModule(await readFile(EXPECTED_CATALOG, 'utf8'));
  expect(renderKyselyTypes(catalog, { driver: 'pglite' })).toBe(
    await readFile(EXPECTED_PGLITE_TYPES, 'utf8'),
  );
  // int8 comes back as a number, or a bigint beyond 2^53 - 1; jsonb goes in as any JSON value.
  expectTypeOf<Selectable<DB['contacts']>['organization_id']>().toEqualTypeOf<
    number | bigint
  >();
  expectTypeOf<{ name: string }>().toExtend<
    Insertable<DB['audit.changes']>['payload']
  >();
});

describe("the PGlite Kysely types through Kysely's PGliteDialect", () => {
  let pglite: PGlite;
  let db: Kysely<DB>;
  let tenant: number | bigint;

  beforeAll(async () => {
    pglite = await openMigratedPglite();
    db = new Kysely<DB>({ dialect: new PGliteDialect({ pglite }) });
    tenant = await seed(db);
  });

  afterAll(async () => {
    // Destroying the dialect closes the PGlite instance.
    await db.destroy();
  });

  it('types a joined query the way PGlite returns its values', async () => {
    const row = await asTenant(db, tenant, async (trx) =>
      trx
        .selectFrom('contacts')
        .innerJoin(
          'organizations',
          'organizations.id',
          'contacts.organization_id',
        )
        .select([
          'contacts.id',
          'contacts.kind',
          'contacts.tags',
          'contacts.discount',
          'contacts.created_at',
          'organizations.id as organization',
          'organizations.seats',
        ])
        .executeTakeFirstOrThrow(),
    );
    expectTypeOf(row).toEqualTypeOf<{
      id: string;
      kind: ContactKind;
      tags: Array<string>;
      discount: string | null;
      created_at: Date;
      organization: number | bigint;
      seats: number;
    }>();
    expect(row).toMatchObject({
      kind: 'person',
      tags: ['mathematics', 'engines'],
      discount: '12.50',
      organization: tenant,
      seats: 5,
    });
    expect(typeof row.organization).toBe('number');
    expect(row.created_at).toBeInstanceOf(Date);
  });

  it('reads back the JSON value it wrote as an object', async () => {
    const change = await db
      .selectFrom('audit.changes')
      .select(['operation', 'payload'])
      .executeTakeFirstOrThrow();
    expectTypeOf(change.payload).toEqualTypeOf<JsonValue>();
    expect(change).toEqual({ operation: 'insert', payload: PAYLOAD });
  });

  it('reads a value of the declared select type from every column of every table', async () => {
    const declared = readDeclaredTypes(
      await readFile(EXPECTED_PGLITE_TYPES, 'utf8'),
    );
    const failures = await asTenant(db, tenant, async (trx) =>
      readEveryColumn(trx, declared),
    );
    expect(failures).toEqual([]);
    expect([...declared.tables.keys()]).toHaveLength(7);
  });
});
