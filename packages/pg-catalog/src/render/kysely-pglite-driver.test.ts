/**
 * The PGlite type table (SPEC 9.2, ADR 0013) held against PGlite's own
 * `query()`, as Kysely's `PGliteDialect` calls it: a value of every insert
 * alternative of every column of the types schema goes in, and what comes
 * back must have the column's select type. The values the table keeps out
 * of insert types are shown to fail or to be stored as something else, and
 * an array of a type created after startup stays text until
 * `refreshArrayTypes()`. CI also runs it on PGlite 0.5.0, the peer range's
 * floor.
 * @ref https://pglite.dev/docs/api#refresharraytypes
 */
import type { CatalogColumn } from '@nizam-os/catalog-core';

import type { SqlSession } from '../target/session';
import type { OracleContext } from '../test-support/driver-oracle';
import type { DriverQuery } from '../test-support/kinds-oracle';
import type { MappingContext } from './kysely-mapping';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readCatalog } from '../extract/read-catalog';
import { replay } from '../replay';
import {
  insertSql,
  kindsColumns,
  readFilled,
  runOracle,
} from '../test-support/kinds-oracle';
import { typesMigrations } from '../test-support/types-schema';
import { pascalCase } from './kysely-names';

const INVALID_TEXT = '22P02';
/** Class 22, data exception: a `Date` sent as `toString()` fails as 22007 in UTC, 22023 elsewhere. */
const DATA_EXCEPTION = /^22/u;
const MOMENT = new Date('2026-01-02T03:04:05Z');

function sessionOver(db: PGlite): SqlSession {
  return {
    exec: async (sql) => {
      await db.exec(sql);
    },
    query: async <TRow extends Record<string, unknown>>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ) => (await db.query<TRow>(sql, [...params])).rows,
    close: async () => {
      await db.close();
    },
  };
}

describe('the Kysely type table against PGlite (SPEC 9.2, ADR 0013)', () => {
  let db: PGlite;
  let query: DriverQuery;
  let columns: ReadonlyMap<string, CatalogColumn>;
  let mapping: MappingContext;
  let oracle: OracleContext;

  beforeAll(async () => {
    db = await PGlite.create();
    const session = sessionOver(db);
    query = async (sql, params) => session.query(sql, params);
    await replay(session, typesMigrations);
    const catalog = await readCatalog(session, ['public']);
    // The migrations created types after startup, as an application's do.
    await db.refreshArrayTypes();
    columns = kindsColumns(catalog);
    const enums = Object.entries(catalog.enums);
    mapping = {
      catalog,
      enumNames: new Map(enums.map(([key]) => [key, pascalCase(key)])),
      overrides: new Map(),
      driver: 'pglite',
    };
    oracle = {
      labels: new Map(enums.map(([key, labels]) => [pascalCase(key), labels])),
      interval: undefined,
    };
  });

  afterAll(async () => {
    await db.close();
  });

  it('accepts a value of every insert alternative and returns a value of the select type', async () => {
    const run = await runOracle(query, columns, mapping, oracle);
    expect(run.failures).toEqual([]);
    // The two GeneratedAlways columns, the empty enum, and the domain from an unread schema.
    expect(run.unprobed).toEqual(['id', 'nothing', 'outside_score', 'doubled']);
  });

  it('fills the defaults and generated columns on insert, with values of their select types', async () => {
    const row = await readFilled(query, columns, mapping, oracle);
    expect(row.filled).toEqual([
      'id',
      'regular',
      'required',
      'defaulted',
      'by_default',
      'doubled',
      'with_default',
    ]);
    expect(row.failures).toEqual([]);
  });

  it('returns int8 as a number within ±(2^53 - 1) and as a bigint beyond', async () => {
    const [row] = await query(
      'select 9007199254740991::int8 as safe, 9007199254740992::int8 as beyond, (-9007199254740992)::int8 as below',
    );
    expect(row).toEqual({
      safe: 9_007_199_254_740_991,
      beyond: 9_007_199_254_740_992n,
      below: -9_007_199_254_740_992n,
    });
  });

  it.each([
    ['docb', 'plain', INVALID_TEXT],
    ['list', [7], INVALID_TEXT],
    ['payload', { a: [1, 2] }, INVALID_TEXT],
    ['instant', MOMENT, DATA_EXCEPTION],
    ['moments', [MOMENT], DATA_EXCEPTION],
  ])(
    'rejects %s = %o, which PGlite sends as text PostgreSQL refuses',
    async (column, value, code) => {
      await expect(query(insertSql(column), [value])).rejects.toMatchObject({
        code,
      });
    },
  );

  it('refuses text for bytea in its serializer, so its insert type is Uint8Array', async () => {
    await expect(query(insertSql('raw'), ['\\x0102'])).rejects.toThrow(Error);
  });

  it('stores a Uint8Array sent for a domain over bytea as the text of its bytes, so the domain takes text', async () => {
    const [row] = await query(insertSql('chunk'), [Uint8Array.from([1, 2])]);
    expect(row).toEqual({ value: new TextEncoder().encode('1,2') });
  });

  it('types the parameter of a comparison with a domain column as the base type, so values of the select type work there', async () => {
    await query(insertSql('instant'), ['2026-01-02 03:04:05+00']);
    await query(insertSql('chunk'), ['\\x0102']);
    const [row] = await query(
      'select count(*) filter (where instant = $1)::int4 as instants, count(*) filter (where chunk = $2)::int4 as chunks from kinds',
      [MOMENT, Uint8Array.from([1, 2])],
    );
    expect(row?.['instants']).toBeGreaterThan(0);
    expect(row?.['chunks']).toBeGreaterThan(0);
  });
});

describe('arrays of a type created after PGlite started (ADR 0013)', () => {
  it('come back as text, and refuse a JavaScript array, until refreshArrayTypes()', async () => {
    const db = await PGlite.create();
    try {
      await db.exec(
        "create type mood as enum ('happy', 'sad'); create table moods (value mood[]);",
      );
      const insert = 'insert into moods values ($1) returning value';
      await expect(db.query(insert, [['happy']])).rejects.toMatchObject({
        code: INVALID_TEXT,
      });
      expect((await db.query(insert, ['{happy}'])).rows).toEqual([
        { value: '{happy}' },
      ]);
      await db.refreshArrayTypes();
      expect((await db.query(insert, [['happy', 'sad']])).rows).toEqual([
        { value: ['happy', 'sad'] },
      ]);
    } finally {
      await db.close();
    }
  });
});
