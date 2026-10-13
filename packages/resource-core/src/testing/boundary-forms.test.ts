/**
 * The boundary fixtures `boundary-fixtures.test.ts` leaves out (SPEC 15.3):
 * `uuid`, `date`, `bool`, and `json` fields, float bounds at zero and below
 * one, an integer column with a fractional bound, a length rule with a
 * minimum of zero, and the ids of every key type that can carry one. The
 * list of a member with a limit must straddle the member's own schema,
 * accepted on one side of each limit and refused on the other; `bool` and
 * `json` have no limit inside their JSON type.
 */
import type {
  PublicCheckConstraint,
  PublicColumn,
  PublicConstraint,
  Rule,
} from '@nizam-os/catalog-core';

import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { boundaryFixtures } from './boundary-fixtures';
import { FLOAT4_MIN, nextDouble } from './float-steps';

const KEY = { nullable: false, default: { literal: null } };
const KEY_TYPES: Readonly<Record<string, Partial<PublicColumn>>> = {
  uuid: { type: 'uuid', sqlType: 'uuid' },
  int8: { type: 'int8', sqlType: 'bigint' },
  text: { type: 'text', sqlType: 'text' },
  bool: { type: 'bool', sqlType: 'boolean' },
  date: { type: 'date', sqlType: 'date' },
  instant: { type: 'timestamptz', sqlType: 'timestamp with time zone' },
  double: { type: 'float8', sqlType: 'double precision' },
  mood: { type: 'mood', typeKind: 'enum', sqlType: 'mood' },
};
const keyNames = Object.keys(KEY_TYPES);

const check = (name: string, rule: Rule): PublicCheckConstraint => ({
  kind: 'check',
  columns: [name],
  rule,
  enforced: true,
});
const above = (value: string, inclusive: boolean): Rule => ({
  kind: 'range',
  min: { value, inclusive },
  max: null,
});
const reference = (name: string): PublicConstraint => ({
  kind: 'foreignKey',
  columns: [`by_${name}_id`],
  references: { table: `by_${name}`, columns: ['id'] },
  enforced: true,
});

const declare = untypedDeclare({
  ...catalogOf({
    ...Object.fromEntries(
      keyNames.map((name) => [
        `by_${name}`,
        table(`by_${name}`, { id: column({ ...KEY_TYPES[name], ...KEY }) }),
      ]),
    ),
    forms: table(
      'forms',
      {
        id: column({ type: 'uuid', sqlType: 'uuid', ...KEY }),
        token: column({ type: 'uuid', sqlType: 'uuid' }),
        day: column({ type: 'date', sqlType: 'date' }),
        active: column({ type: 'bool', sqlType: 'boolean' }),
        doc: column({ type: 'json', sqlType: 'json' }),
        weight: column({ type: 'float8', sqlType: 'double precision' }),
        ratio: column({ type: 'float4', sqlType: 'real' }),
        score: column({ type: 'float8', sqlType: 'double precision' }),
        rank: column({ type: 'int4', sqlType: 'integer' }),
        code: column(),
        ...Object.fromEntries(
          keyNames.map((name) => [`by_${name}_id`, column(KEY_TYPES[name])]),
        ),
      },
      {
        forms_weight_check: check('weight', above('0', false)),
        forms_ratio_check: check('ratio', above('0', true)),
        forms_score_check: check('score', {
          kind: 'range',
          min: null,
          max: { value: '1.5', inclusive: true },
        }),
        forms_rank_check: check('rank', above('2.5', false)),
        forms_code_check: check('code', { kind: 'length', min: 0, max: 3 }),
        ...Object.fromEntries(
          keyNames.map((name) => [`forms_by_${name}_id_fkey`, reference(name)]),
        ),
      },
    ),
  }),
  enums: { mood: ['calm', 'wild'] },
});
const targets = Object.fromEntries(
  keyNames.map((name) => [
    name,
    declare(`by_${name}`, { operations: ['get'], fields: {} }),
  ]),
);
const LIMITED = ['token', 'day', 'weight', 'ratio', 'score', 'rank', 'code'];
const UNLIMITED = ['active', 'doc'];
const FIELDS = [...LIMITED, ...UNLIMITED];
const Forms = declare('forms', {
  operations: ['update'],
  fields: Object.fromEntries(
    FIELDS.map((name) => [name, { access: 'readWrite' }]),
  ),
  relationships: Object.fromEntries(
    keyNames.map((name) => [
      `by_${name}_id`,
      { target: () => targets[name], access: 'readWrite' },
    ]),
  ),
});

const { fields, relationships } = boundaryFixtures(Forms);
const attributes = Forms.schema.update.shape;
const linkages = Forms.linkage.update.shape;

/** Each fixture of a field with the verdict of the field's own schema. */
function fieldVerdicts(
  name: string,
): ReadonlyArray<readonly [unknown, boolean]> {
  const schema = attributes[name];
  if (schema === undefined) {
    throw new Error(`no field ${name}`);
  }
  return (fields[name] ?? []).map(({ value }) => [
    value,
    schema.safeParse(value).success,
  ]);
}

/** Each id fixture of a relationship with the verdict of its linkage schema. */
function idVerdicts(key: string): ReadonlyArray<readonly [unknown, boolean]> {
  const name = `by${key[0]?.toUpperCase() ?? ''}${key.slice(1)}`;
  const schema = linkages[name];
  if (schema === undefined) {
    throw new Error(`no relationship ${name}`);
  }
  return (relationships[name] ?? []).map(({ value }) => [
    value,
    schema.safeParse({ type: `by_${key}`, id: value }).success,
  ]);
}

const accepted = (verdicts: ReadonlyArray<readonly [unknown, boolean]>) =>
  verdicts.filter(([, ok]) => ok).map(([value]) => value);
const refused = (verdicts: ReadonlyArray<readonly [unknown, boolean]>) =>
  verdicts.filter(([, ok]) => !ok).map(([value]) => value);
const labels = (name: string) => (fields[name] ?? []).map(({ label }) => label);

/** A field, values its schema must accept, and values it must refuse. */
const LIMIT_ROWS: ReadonlyArray<
  readonly [field: string, accepts: Array<unknown>, refuses: Array<unknown>]
> = [
  [
    'token',
    ['A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11'],
    ['{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}'],
  ],
  [
    'day',
    ['0001-01-01', '9999-12-31', '2024-02-29'],
    ['0000-01-01', '10000-01-01', '2100-02-29', 'infinity'],
  ],
  ['weight', [Number.MIN_VALUE], [0, -Number.MIN_VALUE]],
  ['ratio', [0, FLOAT4_MIN], [-FLOAT4_MIN, Number.MIN_VALUE]],
  ['score', [1.5, nextDouble(1.5, -1)], [nextDouble(1.5, 1)]],
  ['rank', [3], [2]],
  ['code', ['', 'aaa'], ['aaaa']],
];

describe('boundaryFixtures over the remaining forms (SPEC 15.3)', () => {
  it.each(LIMITED)('straddles %s', (name) => {
    const verdicts = fieldVerdicts(name);
    expect([
      accepted(verdicts).length > 0,
      refused(verdicts).length > 0,
    ]).toEqual([true, true]);
  });

  it.each(LIMIT_ROWS)(
    'probes each limit of %s from both sides',
    (name, yes, no) => {
      const verdicts = fieldVerdicts(name);
      expect(accepted(verdicts)).toEqual(expect.arrayContaining(yes));
      expect(refused(verdicts)).toEqual(expect.arrayContaining(no));
    },
  );

  it.each(UNLIMITED)(
    'accepts every fixture of %s, which has no limit inside its JSON type',
    (name) => {
      expect(refused(fieldVerdicts(name))).toEqual([]);
    },
  );

  it('labels a fractional integer bound by the integers around it, and skips a minimum of zero', () => {
    expect(labels('rank')).toEqual(
      expect.arrayContaining([
        'lower bound 2.5, rounded down',
        'lower bound 2.5, rounded up',
      ]),
    );
    expect(
      labels('code').filter((label) => label.startsWith('minLength')),
    ).toEqual([]);
  });

  it.each(keyNames)(
    'gives %s keys ids that straddle the linkage schema',
    (key) => {
      const verdicts = idVerdicts(key);
      expect([
        accepted(verdicts).length > 0,
        refused(verdicts).length > 0,
      ]).toEqual([true, true]);
    },
  );

  it('spells a boolean id only as true or false', () => {
    const verdicts = idVerdicts('bool');
    expect(accepted(verdicts)).toEqual(['true', 'false']);
    expect(refused(verdicts)).toEqual(['t', 'TRUE', '1']);
  });

  it("refuses every other spelling of a float key, whose id is JavaScript's own text", () => {
    const verdicts = idVerdicts('double');
    expect(refused(verdicts)).toEqual(
      expect.arrayContaining([
        '-0',
        '+1',
        '01',
        '1.0',
        '1e3',
        '1e-07',
        ' 1',
        '',
      ]),
    );
    expect(accepted(verdicts)).toEqual(
      expect.arrayContaining(['0', '1e-7', String(Number.MAX_VALUE)]),
    );
  });

  it('carries string keys in their own form', () => {
    expect(accepted(idVerdicts('int8'))).toContain('9223372036854775807');
    expect(refused(idVerdicts('int8'))).toEqual(
      expect.arrayContaining(['9223372036854775808', '-0', '+1']),
    );
    expect(accepted(idVerdicts('uuid'))).toContain(
      'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11',
    );
    expect(refused(idVerdicts('mood'))).toEqual(
      expect.arrayContaining(['CALM', 'calm ']),
    );
  });
});
