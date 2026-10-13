import type { Catalog } from '@nizam-os/catalog-core';

import type { SqlSession } from '../target/session';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { replay } from '../replay';
import { openThrowawayDatabase } from '../target/server';
import { useSession } from '../target/session';
import { readReplayed, replayedPglite } from '../test-support/replayed';
import {
  portableMigrations,
  postgres18Migrations,
} from '../test-support/schema';
import { VERSION_QUERY } from './queries';
import { readCatalog } from './read-catalog';

const SCHEMAS = ['public', 'audit'];
let session: SqlSession;
let catalog: Catalog;

beforeAll(async () => {
  session = await replayedPglite([
    ...portableMigrations,
    ...postgres18Migrations,
  ]);
  catalog = await readCatalog(session, SCHEMAS);
});

afterAll(async () => {
  await session.close();
});

describe('readCatalog: the catalog (SPEC 2.2, 7.2)', () => {
  it('writes the format, the configured schemas, and the extensions installed into them, sorted', () => {
    expect(catalog.format).toBe(3);
    expect(catalog.schemas).toEqual(['public', 'audit']);
    expect(catalog.extensions).toEqual([
      'btree_gist',
      'cube',
      'earthdistance',
      'pg_trgm',
    ]);
  });

  it('keys enums by reference name, with labels in declaration order', () => {
    expect(catalog.enums).toEqual({
      'audit.action': ['insert', 'update', 'delete'],
      contact_kind: ['person', 'company'],
      empty_enum: [],
    });
    expect(Object.keys(catalog.enums)).toEqual([
      'audit.action',
      'contact_kind',
      'empty_enum',
    ]);
  });

  it('models ordinary and partitioned tables, never partitions, views, or sequences', () => {
    expect(Object.keys(catalog.tables)).toEqual([
      'audit.events',
      'contacts',
      'measurements',
      'modern',
      'organizations',
      'reading_notes',
      'readings',
    ]);
  });

  it('writes the top-level members in the order of SPEC 2.2', () => {
    expect(Object.keys(catalog)).toEqual([
      'format',
      'schemas',
      'extensions',
      'enums',
      'domains',
      'tables',
    ]);
  });
});

describe('readCatalog: reading (SPEC 2.1, 7.1)', () => {
  it('reads the same catalog twice from one session', async () => {
    expect(await readCatalog(session, SCHEMAS)).toEqual(catalog);
  });

  it('uses the first configured schema as the default schema', async () => {
    const flipped = await readCatalog(session, ['audit', 'public']);
    expect(Object.keys(flipped.tables)).toEqual([
      'events',
      'public.contacts',
      'public.measurements',
      'public.modern',
      'public.organizations',
      'public.reading_notes',
      'public.readings',
    ]);
    expect(flipped.tables['events']?.columns['action']?.type).toBe('action');
    expect(
      flipped.tables['events']?.constraints['events_contact_fk'],
    ).toMatchObject({
      references: { table: 'public.contacts' },
      // The deparsed text depends on search_path, which holds both schemas either way.
      definition:
        'FOREIGN KEY (contact_id) REFERENCES contacts(id) ON UPDATE RESTRICT ON DELETE SET NULL NOT VALID',
    });
    expect(Object.keys(flipped.enums)).toEqual([
      'action',
      'public.contact_kind',
      'public.empty_enum',
    ]);
  });

  it('reads only the configured schemas, and a schema that does not exist as empty', async () => {
    const publicOnly = await readCatalog(session, ['public']);
    expect(Object.keys(publicOnly.tables)).not.toContain('audit.events');
    expect(Object.keys(publicOnly.enums)).toEqual([
      'contact_kind',
      'empty_enum',
    ]);
    expect(await readCatalog(session, ['missing'])).toEqual({
      format: 3,
      schemas: ['missing'],
      extensions: [],
      enums: {},
      domains: {},
      tables: {},
    });
  });

  it('pins the session settings and search_path again before reading, whatever the migrations left', async () => {
    const changed = await readReplayed(
      [
        ...portableMigrations,
        {
          name: 'V9__session.sql',
          sql: "set search_path = pg_catalog; set TimeZone = 'Asia/Tokyo';",
        },
      ],
      SCHEMAS,
    );
    // Under Asia/Tokyo the default would print as 19:00:00+09, and without the
    // schemas on search_path the enum would print as public.contact_kind.
    expect(
      changed.tables['audit.events']?.columns['happened_at']?.default,
    ).toEqual({
      expression: "'2024-01-01 10:00:00+00'::timestamp with time zone",
      literal: '2024-01-01 10:00:00+00',
    });
    expect(
      changed.tables['contacts']?.columns['kind']?.default?.expression,
    ).toBe("'person'::contact_kind");
  });

  it('needs at least one schema', async () => {
    await expect(readCatalog(session, [])).rejects.toThrow(
      new TypeError('readCatalog needs at least one schema'),
    );
  });

  it('fails with unsupported_server below PostgreSQL 14', async () => {
    const postgres13: SqlSession = {
      ...session,
      query: async (
        sql: string,
        params?: ReadonlyArray<unknown>,
      ): Promise<any> =>
        sql === VERSION_QUERY
          ? [{ version: 130_012 }]
          : session.query(sql, params),
    };
    await expect(readCatalog(postgres13, SCHEMAS)).rejects.toThrow(
      expect.objectContaining({
        code: 'unsupported_server',
        message:
          '@nizam-os/pg-catalog needs PostgreSQL 14 or later; the server is PostgreSQL 13',
      }),
    );
  });
});

describe('readCatalog: keys (SPEC 2.1)', () => {
  let keys: SqlSession;

  beforeAll(async () => {
    keys = await replayedPglite([
      {
        name: 'V1__keys.sql',
        sql: `create schema proto_table; create table proto_table."__proto__" (id int);
create schema proto_column; create table proto_column.t ("__proto__" int);
create schema proto_enum; create type proto_enum."__proto__" as enum ('a');
create schema a; create table a.b (id int);
create schema dup; create table dup."a.b" (id int);`,
      },
    ]);
  });

  afterAll(async () => {
    await keys.close();
  });

  it.each([
    [
      'proto_table',
      'the table "__proto__" cannot be a key of the generated catalog; rename it',
    ],
    [
      'proto_column',
      'the column "__proto__" of table t cannot be a key of the generated catalog; rename it',
    ],
    [
      'proto_enum',
      'the enum "__proto__" cannot be a key of the generated catalog; rename it',
    ],
  ])(
    'fails with unsafe_name for a key named __proto__ (schema %s)',
    async (schema, message) => {
      await expect(readCatalog(keys, [schema])).rejects.toThrow(
        expect.objectContaining({ code: 'unsafe_name', message }),
      );
    },
  );

  it('fails with duplicate_key when a table "a.b" in the default schema meets table b of schema a', async () => {
    await expect(readCatalog(keys, ['dup', 'a'])).rejects.toThrow(
      expect.objectContaining({
        code: 'duplicate_key',
        message: 'two objects map to the table key "a.b"',
      }),
    );
  });
});

describe.skipIf(process.env['CATALOG_PG_URL'] === undefined)(
  'readCatalog on a PostgreSQL server',
  () => {
    it('reads byte-identical catalogs from the server and from PGlite (PostgreSQL 18)', async () => {
      const url = process.env['CATALOG_PG_URL'] ?? '';
      const server = await useSession(
        await openThrowawayDatabase(url),
        async (database) => {
          await replay(database, portableMigrations);
          return readCatalog(database, SCHEMAS);
        },
      );
      const pglite = await readReplayed(portableMigrations, SCHEMAS);
      expect(JSON.stringify(server, null, 2)).toBe(
        JSON.stringify(pglite, null, 2),
      );
    });
  },
);
