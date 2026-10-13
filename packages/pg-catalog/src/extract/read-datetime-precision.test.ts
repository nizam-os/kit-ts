/**
 * The precision of the datetime types read from a real catalog (SPEC 2.4,
 * 7.3): PostgreSQL rounds a value to the fraction digits of `timestamp(p)`
 * (`'9999-12-31 23:59:59.999999'::timestamp(3)` is
 * `10000-01-01 00:00:00`), so a consumer must see `p`.
 */
import type { Catalog, CatalogColumn } from '@nizam-os/catalog-core';

import { beforeAll, describe, expect, it } from 'vitest';

import { readReplayed } from '../test-support/replayed';

let catalog: Catalog;

beforeAll(async () => {
  catalog = await readReplayed(
    [
      {
        name: 'V1__times.sql',
        sql: `create domain stamp as timestamp(3);
create table times (
  plain timestamp,
  zero timestamp(0),
  milli timestamp(3),
  full_digits timestamp(6),
  zoned timestamptz(2),
  clock time(4),
  zoned_clock timetz(1),
  span interval second(2),
  stamped stamp,
  stamps timestamp(3)[]
);`,
      },
    ],
    ['public'],
  );
});

function precisionOf(column: string): CatalogColumn['precision'] {
  const found = catalog.tables['times']?.columns[column];
  if (found === undefined) {
    throw new Error(`times has no column ${column}`);
  }
  return found.precision;
}

describe('readCatalog: the precision of datetime types (SPEC 7.3)', () => {
  it.each([
    ['plain', null],
    ['zero', 0],
    ['milli', 3],
    ['full_digits', 6],
    ['zoned', 2],
    ['clock', 4],
    ['zoned_clock', 1],
    ['span', null],
    ['stamped', null],
    ['stamps', 3],
  ])('reads %s with precision %s', (column, precision) => {
    expect(precisionOf(column)).toBe(precision);
  });

  it('gives a domain the precision of its base type', () => {
    expect(catalog.domains['stamp']).toMatchObject({
      type: 'timestamp',
      sqlType: 'timestamp(3) without time zone',
      precision: 3,
      scale: null,
    });
  });
});
