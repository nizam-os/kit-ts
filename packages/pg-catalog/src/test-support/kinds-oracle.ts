/**
 * What the driver oracles of the Kysely type tables share (SPEC 9.2): an
 * insert into the types schema's `kinds` table that returns the stored
 * value, and the run of a value of every insert alternative of every
 * column through the driver under test, each value read back checked
 * against the column's select type.
 */
import type { Catalog, CatalogColumn } from '@nizam-os/catalog-core';

import type { MappingContext } from '../render/kysely-mapping';
import type { OracleContext } from './driver-oracle';

import { inspect } from 'node:util';

import { mapType } from '../render/kysely-mapping';
import { samples, satisfies } from './driver-oracle';

/** Runs one statement through the driver under test and returns its rows. */
export type DriverQuery = (
  sql: string,
  params?: ReadonlyArray<unknown>,
) => Promise<ReadonlyArray<Record<string, unknown>>>;

/** The NOT NULL columns without a default, with a value each. */
const REQUIRED: ReadonlyArray<readonly [string, string]> = [
  ['regular', '1'],
  ['required', "'r'"],
];

function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** An insert of `$1` into `column` that fills the required columns and returns the stored value. */
export function insertSql(column: string): string {
  const fixed = REQUIRED.filter(([name]) => name !== column);
  const names = [...fixed.map(([name]) => name), quote(column)].join(', ');
  const values = [...fixed.map(([, value]) => value), '$1'].join(', ');
  return `insert into kinds (${names}) values (${values}) returning ${quote(column)} as value`;
}

/** The columns of the types schema's `kinds` table, by name. */
export function kindsColumns(
  catalog: Catalog,
): ReadonlyMap<string, CatalogColumn> {
  const kinds = catalog.tables['kinds'];
  if (kinds === undefined) {
    throw new Error('the types schema has no kinds table');
  }
  return new Map(Object.entries(kinds.columns));
}

/** What went wrong sending `value` into `column`, if anything. */
async function probe(
  query: DriverQuery,
  column: string,
  value: unknown,
  select: string,
  oracle: OracleContext,
): Promise<ReadonlyArray<string>> {
  let returned: unknown;
  try {
    const [row] = await query(insertSql(column), [value]);
    returned = row?.['value'];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [`${column} rejected ${inspect(value)}: ${reason}`];
  }
  return satisfies(returned, select, oracle)
    ? []
    : [`${column} returned ${inspect(returned)}, not ${select}`];
}

/** What a run of every insert alternative found, and the columns it sent nothing to. */
export interface OracleRun {
  readonly failures: ReadonlyArray<string>;
  readonly unprobed: ReadonlyArray<string>;
}

/**
 * Sends a value of every insert alternative of every column that takes
 * values, and reports each refusal, each value read back without the
 * select type, and each column whose update type differs from its insert
 * type.
 */
export async function runOracle(
  query: DriverQuery,
  columns: ReadonlyMap<string, CatalogColumn>,
  mapping: MappingContext,
  oracle: OracleContext,
): Promise<OracleRun> {
  const failures: Array<string> = [];
  const probed = new Set<string>();
  for (const [name, column] of columns) {
    const types = mapType(column, mapping);
    if (types.update.text !== types.insert.text) {
      failures.push(
        `${name}: update ${types.update.text}, insert ${types.insert.text}`,
      );
    }
    if (column.identity === 'always' || column.generated !== null) {
      continue;
    }
    for (const value of samples(types.insert.text, column, oracle)) {
      probed.add(name);
      failures.push(
        ...(await probe(query, name, value, types.select.text, oracle)),
      );
    }
  }
  const unprobed = [...columns.keys()].filter((name) => !probed.has(name));
  return { failures, unprobed };
}

/** The columns a row with only the required columns has filled, and the values without their select type. */
export interface FilledRow {
  readonly filled: ReadonlyArray<string>;
  readonly failures: ReadonlyArray<string>;
}

/** Inserts a row with only the required columns and reads back what PostgreSQL filled. */
export async function readFilled(
  query: DriverQuery,
  columns: ReadonlyMap<string, CatalogColumn>,
  mapping: MappingContext,
  oracle: OracleContext,
): Promise<FilledRow> {
  const [row = {}] = await query(
    "insert into kinds (regular, required) values (1, 'r') returning *",
  );
  const filled = Object.entries(row).filter(([, value]) => value !== null);
  const failures = filled.flatMap(([name, value]) => {
    const column = columns.get(name);
    const select =
      column === undefined ? 'never' : mapType(column, mapping).select.text;
    return satisfies(value, select, oracle)
      ? []
      : [`${name}: ${inspect(value)}`];
  });
  return { filled: filled.map(([name]) => name), failures };
}
