import type { FieldInit, ScalarFieldType } from '@nizam-os/keyset-core';

import { describe, expect, it } from 'vitest';

import { checkScalar } from '@nizam-os/keyset-core';

import { compileSchema } from '../test-support/openapi-ajv';
import { filterSchema } from './filter-schemas';

/** Texts on both sides of each keyset type's form. */
const PROBES: ReadonlyArray<string> = [
  '',
  ' ',
  'a',
  'Ada',
  'true',
  'false',
  'TRUE',
  't',
  '0',
  '-1',
  '+7',
  '01',
  '1.5',
  '-.5',
  '5.',
  '.',
  '1e3',
  '-2.5E-3',
  '1e',
  'e3',
  '9223372036854775808',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-00000000000G',
  'ABCDEF00-0000-4000-8000-000000000001',
  '2024-02-29',
  '2023-02-29',
  '2024-13-01',
  '2024-2-29',
  '12:30',
  '12:30:45',
  '12:30:45.123456',
  '12:30:45.1234567',
  '24:00',
  '2024-02-29T12:30',
  '2024-02-29 12:30:45',
  '2024-02-29T12:30:45.123456Z',
  '2024-02-29T12:30:45+02',
  '2024-02-29T12:30:45+0230',
  '2024-02-29T12:30:45-02:30',
  '2024-02-29T12:30:45z',
  '2024-02-29t12:30',
  '2023-02-29T12:30',
  'calm',
  'busy',
  'Calm',
];

/** What JSON Schema leaves to the server: calendar days. */
const CALENDAR = new Set(['2023-02-29T12:30']);

const SCALARS: ReadonlyArray<Exclude<ScalarFieldType, 'enum'>> = [
  'text',
  'integer',
  'bigint',
  'decimal',
  'float',
  'boolean',
  'uuid',
  'date',
  'time',
  'timestamp',
  'timestamptz',
];

function verdicts(
  field: FieldInit,
  check: (text: string) => boolean,
): ReadonlyArray<string> {
  const validate = compileSchema(filterSchema(field, 'eq'));
  return PROBES.filter(
    (text) => validate(text) !== check(text) && !CALENDAR.has(text),
  );
}

describe('filterSchema', () => {
  it.each(SCALARS)(
    'accepts exactly the %s text keyset-core accepts',
    (type) => {
      const field = { column: 'c', type } as FieldInit;
      expect(verdicts(field, (text) => checkScalar(type, text).ok)).toEqual([]);
    },
  );

  it('accepts exactly an enum’s labels', () => {
    const field: FieldInit = {
      column: 'c',
      type: 'enum',
      values: ['calm', 'busy'],
    };
    expect(
      verdicts(field, (text) => checkScalar('enum', text, ['calm', 'busy']).ok),
    ).toEqual([]);
  });

  it.each([
    ['in', ['1', '2'], []],
    ['nin', ['1'], []],
    ['between', ['1', '2'], ['1']],
    ['isNull', 'true', 'yes'],
    ['gte', '1', ['1']],
  ] as const)('shapes the value of %s', (operator, accepted, refused) => {
    const validate = compileSchema(
      filterSchema({ column: 'c', type: 'integer' }, operator),
    );
    expect(validate(accepted)).toBe(true);
    expect(validate(refused)).toBe(false);
  });

  it('takes a list of elements for every operator of an array', () => {
    const tags: FieldInit = { column: 'c', type: 'array', of: 'text' };
    for (const operator of ['contains', 'containedBy', 'overlaps'] as const) {
      expect(compileSchema(filterSchema(tags, operator))(['a,b', 'c'])).toBe(
        true,
      );
      expect(compileSchema(filterSchema(tags, operator))('a')).toBe(false);
    }
  });
});
