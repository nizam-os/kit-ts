/**
 * The CamelCasePlugin conversions on names that reach every branch. The
 * expected values are Kysely 0.29.6's own; `@nizam-os/pg-catalog`'s
 * `key-names.test.ts` runs these functions against the plugin itself over
 * every short string, since a core imports no query builder.
 */
import type { CamelCaseOptions } from './camel-case';

import { describe, expect, it } from 'vitest';

import { toCamelCase, toSnakeCase } from './camel-case';

type Case = readonly [
  input: string,
  options: CamelCaseOptions,
  expected: string,
];

const CAMEL: ReadonlyArray<Case> = [
  ['', {}, ''],
  ['created_at', {}, 'createdAt'],
  ['a__b', {}, 'aB'],
  ['_tmp', {}, '_Tmp'],
  ['trailing_', {}, 'trailing'],
  ['Mixed Case', {}, 'Mixed Case'],
  ['straße_name', {}, 'straßeName'],
  ['FIRST_NAME', {}, 'FIRSTNAME'],
  ['FIRST_NAME', { upperCase: true }, 'firstName'],
  ['created_at', { upperCase: true }, 'createdAt'],
];

const SNAKE: ReadonlyArray<Case> = [
  ['', {}, ''],
  ['createdAt', {}, 'created_at'],
  ['HTTPStatus', {}, 'httpstatus'],
  ['FIRST_NAME', {}, 'first__name'],
  ['Mixed Case', {}, 'mixed _case'],
  ['createdAt', { upperCase: true }, 'CREATED_AT'],
  ['straße_name', { upperCase: true }, 'STRASSE_NAME'],
  ['user2fa', {}, 'user2fa'],
  ['user2fa', { underscoreBeforeDigits: true }, 'user_2fa'],
  ['address_line_1', { underscoreBeforeDigits: true }, 'address_line_1'],
  ['HTTPStatus', { underscoreBetweenUppercaseLetters: true }, 'h_t_t_p_status'],
];

describe('toCamelCase', () => {
  it.each(CAMEL)('%j with %j is %j', (input, options, expected) => {
    expect(toCamelCase(input, options)).toBe(expected);
  });

  it('uses the default options when given none', () => {
    expect(toCamelCase('organization_id')).toBe('organizationId');
  });
});

describe('toSnakeCase', () => {
  it.each(SNAKE)('%j with %j is %j', (input, options, expected) => {
    expect(toSnakeCase(input, options)).toBe(expected);
  });

  it('uses the default options when given none', () => {
    expect(toSnakeCase('organizationId')).toBe('organization_id');
  });
});
