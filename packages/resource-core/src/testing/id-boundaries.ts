/**
 * The boundary fixtures of a relationship's id (SPEC 3.4): the key's value
 * fixtures as id text, with the spellings each key type reads but the id
 * form refuses, so every id has one spelling.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

import type { ValueSpec } from '../schema/value-form';
import type { BoundaryFixture } from './fixture';

import { distinct, fixture } from './fixture';
import { valueFixtures } from './value-boundaries';

const NUMBER_SPELLINGS: ReadonlyArray<BoundaryFixture> = [
  fixture('-0', 'negative zero'),
  fixture('+1', 'a plus sign'),
  fixture('01', 'a leading zero'),
  fixture('1.0', 'a fraction zero'),
  fixture('1e3', 'an exponent'),
  fixture('1e-07', 'a padded exponent'),
  fixture(' 1', 'a leading space'),
  fixture('', 'the empty string'),
];

const BOOLEAN_IDS: ReadonlyArray<BoundaryFixture> = [
  fixture('true', 'true'),
  fixture('false', 'false'),
  fixture('t', 'the letter t'),
  fixture('TRUE', 'upper case'),
  fixture('1', 'one'),
];

/** The value fixtures that are already id text, or numbers written as text. */
function asIds(
  fixtures: ReadonlyArray<BoundaryFixture>,
): ReadonlyArray<BoundaryFixture> {
  return fixtures.flatMap(({ value, label }) => {
    if (typeof value === 'string') {
      return [fixture(value, label)];
    }
    return typeof value === 'number' ? [fixture(String(value), label)] : [];
  });
}

/** The fixtures of an id whose key has `spec`; none for a key without an id form. */
export function idFixtures(
  spec: ValueSpec,
  catalog: PublicCatalog,
): ReadonlyArray<BoundaryFixture> {
  const { form } = spec;
  if (form.kind === 'boolean') {
    return BOOLEAN_IDS;
  }
  if (form.kind === 'json' || form.kind === 'array' || form.kind === 'codec') {
    return [];
  }
  const values = asIds(valueFixtures(spec, catalog));
  return distinct(
    form.kind === 'number' ? [...values, ...NUMBER_SPELLINGS] : values,
  );
}
