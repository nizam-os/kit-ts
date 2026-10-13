/**
 * The camelCase Kysely types in an application (SPEC 9.2, 13.1): the
 * contacts application with Kysely's CamelCasePlugin and `db-camel.ts`, the
 * types `renderKyselyTypes` writes with `camelCase: true`. It writes every
 * table and queries through the camelCase keys, which the plugin turns back
 * into the database's names, and every row it reads back has the declared
 * keys and select types. Runs on PGlite behind a socket server, and on the
 * server `CATALOG_PG_URL` names.
 * @ref https://kysely.dev/docs/plugins#camel-case-plugin
 */
import type { Insertable } from 'kysely';

import type {
  ContactKind,
  DB,
  JsonValue,
} from './fixtures/contacts/expected/db-camel.ts';
import type { LiveDatabase } from './support/live-database';

import { readFile } from 'node:fs/promises';

import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';

import { parseCatalogModule, renderKyselyTypes } from '@nizam-os/pg-catalog';

import { EXPECTED_CAMEL_TYPES, EXPECTED_CATALOG } from './support/contacts';
import { readDeclaredTypes } from './support/declared-types';
import { asTenant, readEveryColumn } from './support/kysely-app';
import { liveDatabases } from './support/live-database';

const PAYLOAD = { display_name: 'Ada Lovelace', tags: ['mathematics'] };

/** One row in every table, written through the camelCase insert types; returns the tenant. */
async function seed(db: Kysely<DB>): Promise<string> {
  const organization = await db
    .insertInto('organizations')
    .values({ name: 'Difference Engines', slug: 'difference', country: 'GB' })
    .returning('id')
    .executeTakeFirstOrThrow();
  await asTenant(db, organization.id, async (trx) => {
    const contact = await trx
      .insertInto('contacts')
      .values({
        organizationId: organization.id,
        kind: 'person',
        name: 'Ada Lovelace',
        nickname: 'Ada',
        email: 'ada@example.com',
        website: 'https://ada.example.com',
        priority: 1,
        discount: '12.5',
        tags: ['mathematics'],
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('contactPhones')
      .values({
        contactId: contact.id,
        position: 0,
        number: '+44 20 7946 0000',
      })
      .execute();
    await trx
      .insertInto('meetings')
      .values({
        organizationId: organization.id,
        contactId: contact.id,
        room: 'Babbage',
        during: '[2026-02-03 10:00:00+00,2026-02-03 11:00:00+00)',
        notes: 'Bernoulli numbers',
      })
      .execute();
    const activity = await trx
      .insertInto('activities')
      .values({
        contactId: contact.id,
        occurredOn: '2026-02-03',
        summary: 'Kick-off',
      })
      .returning(['id', 'occurredOn'])
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('activityAttachments')
      .values({
        activityId: activity.id,
        occurredOn: activity.occurredOn,
        fileName: 'notes.pdf',
      })
      .execute();
    await trx
      .insertInto('audit.changes')
      .values({
        tableName: 'contacts',
        operation: 'insert',
        rowId: contact.id,
        payload: JSON.stringify(PAYLOAD),
      })
      .execute();
  });
  return organization.id;
}

it('db-camel.ts is what renderKyselyTypes writes with camelCase', async () => {
  const catalog = parseCatalogModule(await readFile(EXPECTED_CATALOG, 'utf8'));
  expect(renderKyselyTypes(catalog, { camelCase: true })).toBe(
    await readFile(EXPECTED_CAMEL_TYPES, 'utf8'),
  );
  expectTypeOf<Insertable<DB['contacts']>>().toHaveProperty('organizationId');
  expectTypeOf<Insertable<DB['contacts']>>().not.toHaveProperty(
    'organization_id',
  );
});

for (const [name, open] of liveDatabases()) {
  describe(`the camelCase Kysely types on ${name}`, () => {
    let live: LiveDatabase;
    let db: Kysely<DB>;
    let tenant: string;

    /** The application's Kysely instance, with the plugin configured as given. */
    function connect(plugin: CamelCasePlugin): Kysely<DB> {
      return new Kysely<DB>({
        dialect: new PostgresDialect({ pool: live.pool }),
        plugins: [plugin],
      });
    }

    /** The audit change the seed wrote, read through the plugin configured as given. */
    async function readChange(
      plugin: CamelCasePlugin,
    ): Promise<{ tableName: string; payload: JsonValue }> {
      return connect(plugin)
        .selectFrom('audit.changes')
        .select(['tableName', 'payload'])
        .executeTakeFirstOrThrow();
    }

    beforeAll(async () => {
      live = await open();
      db = connect(new CamelCasePlugin());
      tenant = await seed(db);
    });

    afterAll(async () => {
      await live.close();
    });

    it('types a joined query with the keys the plugin returns', async () => {
      const row = await asTenant(db, tenant, async (trx) =>
        trx
          .selectFrom('contacts')
          .innerJoin(
            'organizations',
            'organizations.id',
            'contacts.organizationId',
          )
          .select([
            'contacts.kind',
            'contacts.createdAt',
            'organizations.id as organization',
            'organizations.seats',
          ])
          .executeTakeFirstOrThrow(),
      );
      expectTypeOf(row).toEqualTypeOf<{
        kind: ContactKind;
        createdAt: Date;
        organization: string;
        seats: number;
      }>();
      expect(row).toMatchObject({
        kind: 'person',
        organization: tenant,
        seats: 5,
      });
      expect(row.createdAt).toBeInstanceOf(Date);
    });

    it('camelCases the keys inside jsonb unless maintainNestedObjectKeys is set', async () => {
      expect(await readChange(new CamelCasePlugin())).toEqual({
        tableName: 'contacts',
        payload: { displayName: 'Ada Lovelace', tags: ['mathematics'] },
      });
      expect(
        await readChange(
          new CamelCasePlugin({ maintainNestedObjectKeys: true }),
        ),
      ).toEqual({ tableName: 'contacts', payload: PAYLOAD });
    });

    it('reads a value of the declared select type from every column, by the camelCase keys', async () => {
      const declared = readDeclaredTypes(
        await readFile(EXPECTED_CAMEL_TYPES, 'utf8'),
      );
      const failures = await asTenant(db, tenant, async (trx) =>
        readEveryColumn(trx, declared),
      );
      expect(failures).toEqual([]);
      expect([...declared.tables.keys()]).toEqual([
        'activities',
        'activityAttachments',
        'audit.changes',
        'contactPhones',
        'contacts',
        'meetings',
        'organizations',
      ]);
    });
  });
}
