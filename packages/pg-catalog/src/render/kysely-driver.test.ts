/**
 * The node-postgres type table (SPEC 9.2) held against node-postgres on a
 * server: a value of every insert alternative of every column of the types
 * schema goes in through the driver, and what comes back must have the
 * column's select type. The values the table keeps out of insert types are
 * shown to fail. Runs when `CATALOG_PG_URL` is set; CI runs it on
 * PostgreSQL 14 and 18. `kysely-pglite-driver.test.ts` holds the PGlite
 * table the same way.
 */
import type { CatalogColumn } from '@nizam-os/catalog-core';

import type { SqlSession } from '../target/session';
import type { OracleContext } from '../test-support/driver-oracle';
import type { DriverQuery } from '../test-support/kinds-oracle';
import type { MappingContext } from './kysely-mapping';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readCatalog } from '../extract/read-catalog';
import { replay } from '../replay';
import { openThrowawayDatabase } from '../target/server';
import {
  insertSql,
  kindsColumns,
  readFilled,
  runOracle,
} from '../test-support/kinds-oracle';
import { typesMigrations } from '../test-support/types-schema';
import { pascalCase } from './kysely-names';

const url = process.env['CATALOG_PG_URL'];
const INVALID_TEXT = '22P02';
const NOT_NULL = '23502';
const GENERATED_ALWAYS = '428C9';

describe.skipIf(url === undefined)(
  'the Kysely type table against node-postgres (SPEC 9.2)',
  () => {
    let session: SqlSession;
    let query: DriverQuery;
    let columns: ReadonlyMap<string, CatalogColumn>;
    let mapping: MappingContext;
    let oracle: OracleContext;

    beforeAll(async () => {
      session = await openThrowawayDatabase(url ?? '');
      query = async (sql, params) => session.query(sql, params);
      await replay(session, typesMigrations);
      const catalog = await readCatalog(session, ['public']);
      const [interval] = await session.query<{ value: unknown }>(
        "select '1 day 02:00:00'::interval as value",
      );
      columns = kindsColumns(catalog);
      const enums = Object.entries(catalog.enums);
      mapping = {
        catalog,
        enumNames: new Map(enums.map(([key]) => [key, pascalCase(key)])),
        overrides: new Map(),
        driver: 'node-postgres',
      };
      oracle = {
        labels: new Map(
          enums.map(([key, labels]) => [pascalCase(key), labels]),
        ),
        interval: interval?.value,
      };
    });

    afterAll(async () => {
      await session.close();
    });

    it('accepts a value of every insert alternative and returns a value of the select type', async () => {
      const run = await runOracle(query, columns, mapping, oracle);
      expect(run.failures).toEqual([]);
      // The two GeneratedAlways columns, the empty enum, and the domain from an unread schema.
      expect(run.unprobed).toEqual([
        'id',
        'nothing',
        'outside_score',
        'doubled',
      ]);
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

    it.each([
      ['spot', { x: 1, y: 2 }],
      ['ring', { x: 1, y: 2, radius: 3 }],
      ['spots', [{ x: 1, y: 2 }]],
      ['doc', 'plain'],
      ['docb', [1, 2]],
      ['docbs', ['plain']],
    ])(
      'rejects %s = %j, a value of its select type, so its insert type is text',
      async (column, value) => {
        await expect(
          session.query(insertSql(column), [value]),
        ).rejects.toMatchObject({ code: INVALID_TEXT });
      },
    );

    it.each(['id', 'doubled'])(
      'refuses a value for %s, so it is GeneratedAlways',
      async (column) => {
        await expect(
          session.query(insertSql(column), ['1']),
        ).rejects.toMatchObject({ code: GENERATED_ALWAYS });
      },
    );

    it('refuses null for required, whose domain is NOT NULL, yet reads null from it', async () => {
      expect(columns.get('required')?.nullable).toBe(true);
      await expect(
        session.query(insertSql('required'), [null]),
      ).rejects.toMatchObject({ code: NOT_NULL });
      // The empty scalar sub-select of the CREATE DOMAIN notes stores a null unchecked.
      const [row] = await session.query<{ value: unknown }>(
        insertSql('required').replace(
          '$1',
          '(select required from kinds where false)',
        ),
      );
      expect(row).toEqual({ value: null });
    });
  },
);
