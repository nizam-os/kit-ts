/**
 * A value's metadata (SPEC 8): the wire type and format of each row of
 * SPEC 5.1, the bounds folded from types, domains, and CHECKs, the fraction
 * digits of `timestamp(p)`, an array's elements, and the default
 * PostgreSQL applies, the column's or the nearest domain's above the first
 * array (captured on PostgreSQL 14.19 and 18.3: `d2 AS d1 DEFAULT 2` over
 * `d1 AS int DEFAULT 1` inserts 2, and a `d1[]` column inserts `NULL`).
 * @ref https://www.postgresql.org/docs/18/sql-createdomain.html
 */
import type { PublicColumn, Rule } from '@nizam-os/catalog-core';

import type { FieldLimits, FieldMeta } from './types';

import { describe, expect, it } from 'vitest';

import { specOf } from '../schema/value-form';
import {
  catalogOf,
  check,
  column,
  domain,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { valueMeta } from './value-meta';

const NONE: FieldLimits = {
  minLength: null,
  maxLength: null,
  minimum: null,
  exclusiveMinimum: null,
  maximum: null,
  exclusiveMaximum: null,
  multipleOf: null,
  patterns: [],
};

/** The bounds of an integer type, as the fold keeps them. */
const range = (minimum: string, maximum: string): FieldLimits => ({
  ...NONE,
  minimum,
  maximum,
});

const INT4 = range('-2147483648', '2147483647');

const of = (type: string, overrides: Partial<PublicColumn> = {}) =>
  column({ type, sqlType: type, ...overrides });

/** A domain's CHECK `<name>_check` with `rule`. */
const ruled = (name: string, rule: Rule) => ({
  [`${name}_check`]: { kind: 'check', rule } as const,
});

/** Every column of `columns` as a `readWrite` field. */
const writable = (columns: object) =>
  Object.fromEntries(
    Object.keys(columns).map((name) => [name, { access: 'readWrite' }]),
  );

/** One column per row of SPEC 5.1, as `[column, wire, format, limits]`. */
const ROWS: ReadonlyArray<
  readonly [PublicColumn, string, string | null, FieldLimits]
> = [
  [of('text'), 'string', null, NONE],
  [
    of('varchar', { maxLength: 10 }),
    'string',
    null,
    { ...NONE, maxLength: 10 },
  ],
  [of('bpchar', { maxLength: 3 }), 'string', null, { ...NONE, maxLength: 3 }],
  [of('extensions.citext'), 'string', null, NONE],
  [of('int2'), 'integer', 'int16', range('-32768', '32767')],
  [of('int4'), 'integer', 'int32', INT4],
  [
    of('int8'),
    'string',
    'int64',
    range('-9223372036854775808', '9223372036854775807'),
  ],
  [of('numeric'), 'string', 'decimal', NONE],
  [
    of('numeric', { precision: 6, scale: 2 }),
    'string',
    'decimal',
    {
      ...NONE,
      exclusiveMinimum: '-10000',
      exclusiveMaximum: '10000',
      multipleOf: '0.01',
    },
  ],
  [of('float4'), 'number', 'float', NONE],
  [of('float8'), 'number', 'double', NONE],
  [of('bool'), 'boolean', null, NONE],
  [of('uuid'), 'string', 'uuid', NONE],
  [of('date'), 'string', 'date', NONE],
  [of('timestamp'), 'string', 'date-time-local', NONE],
  [of('timestamptz'), 'string', 'date-time', NONE],
  [of('json'), 'any', null, NONE],
  [of('jsonb'), 'any', null, NONE],
  [of('mood', { typeKind: 'enum' }), 'string', null, NONE],
  [of('int4', { array: true }), 'array', null, NONE],
  [of('mood', { typeKind: 'enum', array: true }), 'array', null, NONE],
];

const LABELS = ['calm', 'tense'];

const SHAPE_COLUMNS = Object.fromEntries(
  ROWS.map(([record], index) => [`c${index}`, record]),
);
const ID = column({ type: 'uuid', sqlType: 'uuid', nullable: false });

const declareShapes = untypedDeclare({
  ...catalogOf({ shapes: table('shapes', { id: ID, ...SHAPE_COLUMNS }) }),
  enums: { mood: LABELS },
});

const Shapes = declareShapes('shapes', {
  operations: ['update'],
  fields: writable(SHAPE_COLUMNS),
});

describe('the wire type, format, and bounds of each wire form (SPEC 5.1)', () => {
  it.each(
    ROWS.map(([record, wire, format, limits], index) => [
      record.sqlType,
      index,
      wire,
      format,
      limits,
    ]),
  )('%s', (_type, index, wire, format, limits) => {
    const meta = Shapes.fields[`c${String(index)}`];
    expect(meta).toMatchObject({ wire, format, limits });
  });

  it("lists an enum's labels as options, a copy of the catalog's list", () => {
    const { options } = Shapes.fields['c18'] as FieldMeta;
    expect(options).toEqual(LABELS);
    expect(options).not.toBe(LABELS);
    expect(Object.isFrozen(options)).toBe(true);
  });

  it('gives a date-time six fraction digits without a precision, and nothing else any', () => {
    const digits = Object.values(Shapes.fields).map(
      (meta) => meta.fractionDigits,
    );
    expect(digits.filter((value) => value !== null)).toEqual([6, 6]);
  });

  it("describes an array by its elements, an enum's labels included", () => {
    expect(Shapes.fields['c19']).toMatchObject({
      options: null,
      items: {
        wire: 'integer',
        format: 'int32',
        fractionDigits: null,
        limits: INT4,
        options: null,
      },
    });
    expect(Shapes.fields['c20']?.items).toMatchObject({
      wire: 'string',
      options: LABELS,
    });
  });
});

const EVENT_COLUMNS = {
  rank: of('rank', { typeKind: 'domain' }),
  plain: of('plain_rank', { typeKind: 'domain' }),
  lowest: of('base_rank', { typeKind: 'domain', default: { literal: '5' } }),
  ranks: of('rank', { typeKind: 'domain', array: true }),
  seats: of('int4', { default: { literal: null } }),
  at: of('timestamptz', { precision: 3 }),
  local: of('stamp', { typeKind: 'domain' }),
  ats: of('timestamp', { array: true, precision: 2 }),
  labels: of('label', { typeKind: 'domain', array: true }),
  code: of('code', { typeKind: 'domain' }),
};

const declareEvents = untypedDeclare(
  catalogOf(
    {
      events: table(
        'events',
        { id: ID, ...EVENT_COLUMNS },
        {
          events_seats_check: check('seats', {
            kind: 'range',
            min: { value: '0', inclusive: false },
            max: { value: '500', inclusive: true },
          }),
          events_code_check: check('code', {
            kind: 'pattern',
            source: '^[A-Z]',
            flags: 'su',
          }),
        },
      ),
    },
    {
      base_rank: domain('base_rank', {
        type: 'int4',
        default: { literal: '1' },
      }),
      rank: domain('rank', {
        type: 'base_rank',
        typeKind: 'domain',
        default: { literal: '2' },
        constraints: ruled('rank', {
          kind: 'range',
          min: { value: '1', inclusive: true },
          max: null,
        }),
      }),
      plain_rank: domain('plain_rank', { type: 'rank', typeKind: 'domain' }),
      stamp: domain('stamp', { type: 'timestamp', precision: 0 }),
      label: domain('label', {
        constraints: ruled('label', { kind: 'enum', values: ['a', 'b'] }),
      }),
      code: domain('code', {
        type: 'varchar',
        maxLength: 8,
        constraints: ruled('code', {
          kind: 'pattern',
          source: '^[A-Z0-9]+$',
          flags: 'su',
        }),
      }),
    },
  ),
);

const Events = declareEvents('events', {
  operations: ['create'],
  fields: writable(EVENT_COLUMNS),
});

const meta = (name: string): FieldMeta => Events.fields[name] as FieldMeta;

describe('folds, fraction digits, elements, and defaults (SPEC 6.1, 6.3, 8)', () => {
  it('keeps the tightest bound per keyword from the type, the domains, and the CHECKs', () => {
    expect(meta('rank').limits).toEqual({ ...INT4, minimum: '1' });
    expect(meta('seats').limits).toEqual({
      ...NONE,
      exclusiveMinimum: '0',
      maximum: '500',
    });
  });

  it("keeps every pattern, the domain's and the column's", () => {
    expect(meta('code').limits).toEqual({
      ...NONE,
      maxLength: 8,
      patterns: ['^[A-Z0-9]+$', '^[A-Z]'],
    });
  });

  it("takes fraction digits from the column, a domain, and an array's elements", () => {
    expect(meta('at').fractionDigits).toBe(3);
    expect(meta('local').fractionDigits).toBe(0);
    expect(meta('ats')).toMatchObject({
      fractionDigits: null,
      items: { format: 'date-time-local', fractionDigits: 2 },
    });
  });

  it("gives an array's elements the rules of their domains", () => {
    expect(meta('ranks').items).toEqual({
      wire: 'integer',
      format: 'int32',
      fractionDigits: null,
      limits: { ...INT4, minimum: '1' },
      options: null,
    });
    expect(meta('labels').items?.options).toEqual(['a', 'b']);
  });

  it("gives the default PostgreSQL applies: the column's, else the nearest domain's above the first array", () => {
    expect(meta('rank').default).toEqual({ literal: '2', value: 2 });
    expect(meta('plain').default).toEqual({ literal: '2', value: 2 });
    expect(meta('lowest').default).toEqual({ literal: '5', value: 5 });
    expect(meta('ranks').default).toBeNull();
    expect(meta('seats').default).toEqual({ literal: null });
    expect(meta('code').default).toBeNull();
  });
});

describe('an array element (SPEC 5.1)', () => {
  it('is never an array, a JSON value, or a codec value, which levelOf never builds', () => {
    const element = specOf({ kind: 'json', type: 'json' });
    expect(() => valueMeta(specOf({ kind: 'array', element }))).toThrow(
      new TypeError('an array element cannot be a json value'),
    );
  });
});
