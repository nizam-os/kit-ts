/**
 * The Kysely types file with `driver: 'pglite'` (SPEC 9.2, ADR 0013):
 * members of the types schema's table as replayed by PostgreSQL, and the
 * helpers the PGlite table names. `kysely-pglite-driver.test.ts` holds the
 * same table against PGlite.
 */
import type { Catalog } from '@nizam-os/catalog-core';

import { beforeAll, describe, expect, it } from 'vitest';

import { readReplayed } from '../test-support/replayed';
import { typesMigrations } from '../test-support/types-schema';
import { FILE_HEADER } from './catalog-module';
import { renderKyselyTypes } from './kysely-types';

const MEMBER = /^ {2}(.+?): (.+);$/u;

/** The members of `KindsTable`, as name to type text. */
function kinds(text: string): ReadonlyMap<string, string> {
  const start = text.indexOf('export interface KindsTable {\n');
  const body = text.slice(start, text.indexOf('\n}', start)).split('\n');
  return new Map(
    body.slice(1).map((line): [string, string] => {
      const [, member = '', type = ''] = MEMBER.exec(line) ?? [];
      return [member, type];
    }),
  );
}

let catalog: Catalog;
let pglite = '';

beforeAll(async () => {
  catalog = await readReplayed(typesMigrations, ['public']);
  pglite = renderKyselyTypes(catalog, { driver: 'pglite' });
});

describe('renderKyselyTypes with the PGlite driver', () => {
  it.each([
    ['id', 'GeneratedAlways<number | bigint>'],
    [
      'big',
      'ColumnType<number | bigint | null, string | number | bigint | null, string | number | bigint | null>',
    ],
    ['raw', 'Uint8Array | null'],
    [
      'docb',
      'ColumnType<JsonValue | null, JsonParameter | null, JsonParameter | null>',
    ],
    ['span', 'string | null'],
    ['spot', 'string | null'],
    [
      'feelings',
      'ColumnType<Array<Mood> | null, Array<Mood> | string | null, Array<Mood> | string | null>',
    ],
    [
      'positives',
      'ColumnType<Array<string> | null, Array<number> | string | null, Array<number> | string | null>',
    ],
    ['list', 'ColumnType<Array<number> | null, string | null, string | null>'],
    ['instant', 'ColumnType<Date | null, string | null, string | null>'],
    ['chunk', 'ColumnType<Uint8Array | null, string | null, string | null>'],
    ['payload', 'ColumnType<JsonValue | null, string | null, string | null>'],
    [
      'amounts',
      'ColumnType<Array<string> | null, Array<string | number> | string | null, Array<string | number> | string | null>',
    ],
    [
      'docbs',
      'ColumnType<Array<JsonValue> | null, Array<JsonParameter> | string | null, Array<JsonParameter> | string | null>',
    ],
    ['by_default', 'Generated<number>'],
  ])('%s is %s', (member, type) => {
    expect(kinds(pglite).get(member)).toBe(type);
  });

  it('declares JsonValue and JsonParameter, and none of the helpers PGlite never returns', () => {
    const start = pglite.indexOf('export type JsonValue =');
    expect(pglite.slice(start, pglite.indexOf('export type Mood', start))).toBe(
      [
        'export type JsonValue =',
        '  | string',
        '  | number',
        '  | boolean',
        '  | null',
        '  | Array<JsonValue>',
        '  | { [key: string]: JsonValue };',
        '',
        '/** JSON text as a string, or any other JSON value, which PGlite sends with JSON.stringify. */',
        'export type JsonParameter =',
        '  | string',
        '  | number',
        '  | boolean',
        '  | Array<JsonValue>',
        '  | { [key: string]: JsonValue };',
        '',
        'export type EmptyMood = never;\n',
      ].join('\n'),
    );
    expect(pglite.startsWith(`${FILE_HEADER}\n`)).toBe(true);
    for (const helper of ['PostgresInterval', 'Point', 'Circle']) {
      expect(pglite).not.toContain(`export interface ${helper}`);
    }
  });

  it('defaults to node-postgres, whose table names no JsonParameter', () => {
    const text = renderKyselyTypes(catalog);
    expect(text).toBe(renderKyselyTypes(catalog, { driver: 'node-postgres' }));
    expect(text).not.toContain('JsonParameter');
  });
});
