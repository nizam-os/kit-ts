import type { PublicCatalog, PublicColumn } from '@nizam-os/catalog-core';

import type { TestDatabase } from '../test-support/database';

import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';

import { contractFixture } from '@nizam-os/resource-core/testing';

import { contractDatabase } from '../test-support/database';
import { castType, columnOf, tableName, tableOf, typed } from './sql';

const { catalog, resources } = contractFixture;
const tasks = tableOf(catalog, resources.tasks);

const database: TestDatabase = contractDatabase();

afterAll(async () => {
  await database.close();
});

function column(type: string, array = false): PublicColumn {
  return { ...columnOf(tasks, 'title'), type, array };
}

const DOMAIN = {
  type: 'int4',
  typeKind: 'base',
  array: false,
  sqlType: 'integer',
  maxLength: null,
  precision: 32,
  scale: 0,
  nullable: true,
  default: null,
  constraints: {},
} as const;
const withDomains: PublicCatalog = {
  ...catalog,
  domains: {
    'billing.cents': { ...DOMAIN, schema: 'billing', name: 'cents' },
    'a.b': { ...DOMAIN, schema: 'public', name: 'a.b' },
  },
};

describe('names', () => {
  it('finds a table and its columns by own member only', () => {
    expect(tasks.name).toBe('tasks');
    expect(() => tableOf({ ...catalog, tables: {} }, resources.tasks)).toThrow(
      new Error('tasks: the catalog has no table tasks'),
    );
    expect(() => columnOf(tasks, 'toString')).toThrow(
      new Error('tasks has no column toString'),
    );
  });

  it('writes a table as "schema"."name", doubling quotes', () => {
    expect(tableName(tasks).compile(database.db).sql).toBe('"public"."tasks"');
    expect(
      tableName({ ...tasks, schema: 'odd"schema', name: 'a.b' }).compile(
        database.db,
      ).sql,
    ).toBe('"odd""schema"."a.b"');
  });

  it.each([
    ['a base type', catalog, column('int8'), '"int8"'],
    ['an array', catalog, column('text', true), '"text"[]'],
    [
      'an enum of the default schema',
      catalog,
      column('task_priority'),
      '"task_priority"',
    ],
    [
      'a type of another schema',
      catalog,
      column('extensions.citext'),
      '"extensions"."citext"',
    ],
    [
      'a domain, by its own schema and name',
      withDomains,
      column('billing.cents', true),
      '"billing"."cents"[]',
    ],
    [
      'a dotted domain name of the default schema',
      withDomains,
      column('a.b'),
      '"public"."a.b"',
    ],
  ])('casts to %s', (_case, from, of, expected) => {
    expect(castType(from, of).compile(database.db).sql).toBe(expected);
  });

  it('sends a parameter as text and casts it to the type', async () => {
    const tags = columnOf(tasks, 'tags');
    const compiled = typed(catalog, tags, '{a,"b c"}').compile(database.db);
    expect(compiled.sql).toBe('$1::text::"text"[]');
    expect(compiled.parameters).toEqual(['{a,"b c"}']);
    const { rows } = await sql<{ third: string; length: number }>`select
      (${typed(catalog, tags, '{a,"b c"}')})[2] as "third",
      array_length(${typed(catalog, tags, '{a,"b c"}')}, 1) as "length"`.execute(
      database.db,
    );
    expect(rows).toEqual([{ third: 'b c', length: 2 }]);
  });
});
