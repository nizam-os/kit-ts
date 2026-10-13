/**
 * Value specs of the base types for the OpenAPI tests (SPEC 13.1), built
 * the way `declareResource` builds them, with a catalog that holds their
 * one enum. Not published with the package.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

import type { Bound } from '../schema/limits';
import type { TypeRecord, ValueSpec } from '../schema/value-form';

import {
  NO_LIMITS,
  withLength,
  withPattern,
  withRange,
} from '../schema/limits';
import { baseSpec, specOf } from '../schema/value-form';

/** A catalog with the enum `mood` the specs below name. */
export const MOOD_CATALOG: PublicCatalog = {
  format: 3,
  enums: { mood: ['calm', 'busy'] },
  domains: {},
  tables: {},
};

/** The spec of a base type with its modifiers, as the catalog records it. */
function base(
  record: Partial<TypeRecord> & Pick<TypeRecord, 'type'>,
): ValueSpec {
  const spec = baseSpec({
    typeKind: 'base',
    array: false,
    maxLength: null,
    precision: null,
    scale: null,
    ...record,
  });
  if (spec === undefined) {
    throw new Error(`no wire form for ${record.type}`);
  }
  return spec;
}

/** The spec of an array of `element`. */
function arrayOf(element: ValueSpec): ValueSpec {
  return specOf({ kind: 'array', element });
}

/** The enum `mood`. */
const MOOD: ValueSpec = {
  ...specOf({ kind: 'enum', type: 'mood' }),
  options: ['calm', 'busy'],
};

/** `spec` within a CHECK's range, folded into its type's bounds. */
function within(
  spec: ValueSpec,
  min: Bound | null,
  max: Bound | null,
): ValueSpec {
  return { ...spec, limits: withRange(spec.limits, { min, max }) };
}

const TEXT = base({ type: 'text' });
const INT4 = base({ type: 'int4' });
const INT8 = base({ type: 'int8' });
const MONEY = base({ type: 'numeric', precision: 5, scale: 2 });

/** Values of every wire form, with rules and arrays, labelled for test names. */
export const VALUE_SPECS: ReadonlyArray<readonly [string, ValueSpec]> = [
  ['text', TEXT],
  ['varchar(3)', base({ type: 'varchar', maxLength: 3 })],
  ['bpchar(2)', base({ type: 'bpchar', maxLength: 2 })],
  ['extensions.citext', base({ type: 'extensions.citext' })],
  ['int2', base({ type: 'int2' })],
  ['int4', INT4],
  ['int8', INT8],
  ['numeric', base({ type: 'numeric' })],
  ['numeric(5,2)', MONEY],
  ['numeric(5,0)', base({ type: 'numeric', precision: 5, scale: 0 })],
  ['numeric(3,-2)', base({ type: 'numeric', precision: 3, scale: -2 })],
  ['numeric(2,4)', base({ type: 'numeric', precision: 2, scale: 4 })],
  ['float4', base({ type: 'float4' })],
  ['float8', base({ type: 'float8' })],
  ['bool', base({ type: 'bool' })],
  ['uuid', base({ type: 'uuid' })],
  ['date', base({ type: 'date' })],
  ['timestamp', base({ type: 'timestamp' })],
  ['timestamp(0)', base({ type: 'timestamp', precision: 0 })],
  ['timestamptz', base({ type: 'timestamptz' })],
  ['timestamptz(3)', base({ type: 'timestamptz', precision: 3 })],
  ['json', base({ type: 'json' })],
  ['jsonb', base({ type: 'jsonb' })],
  ['mood', MOOD],
  [
    'text with rules',
    {
      ...TEXT,
      limits: withPattern(
        withPattern(withLength(NO_LIMITS, { min: 2, max: 5 }), '^a.c'),
        '[0-9]$',
      ),
    },
  ],
  ['text with an enum rule', { ...TEXT, options: ['on', 'off'] }],
  [
    'int4 within 0 and 10',
    within(
      INT4,
      { value: '0', inclusive: false },
      { value: '10', inclusive: true },
    ),
  ],
  ['int8 above zero', within(INT8, { value: '0', inclusive: false }, null)],
  [
    'numeric(5,2) within 0 and 500',
    within(
      MONEY,
      { value: '0', inclusive: true },
      { value: '500', inclusive: true },
    ),
  ],
  [
    'numeric(6,2) within -1000 and 1000',
    within(
      base({ type: 'numeric', precision: 6, scale: 2 }),
      { value: '-1000', inclusive: true },
      { value: '1000', inclusive: true },
    ),
  ],
  ['text[]', arrayOf(TEXT)],
  ['numeric(5,2)[]', arrayOf(MONEY)],
  ['timestamptz(0)[]', arrayOf(base({ type: 'timestamptz', precision: 0 }))],
];

/** Key columns of every id form, labelled for test names. */
export const KEY_SPECS: ReadonlyArray<readonly [string, ValueSpec]> = [
  ['an int2 key', base({ type: 'int2' })],
  ['an int4 key', INT4],
  ['an int8 key', INT8],
  ['a numeric(5,0) key', base({ type: 'numeric', precision: 5, scale: 0 })],
  ['a float4 key', base({ type: 'float4' })],
  ['a float8 key', base({ type: 'float8' })],
  ['a bool key', base({ type: 'bool' })],
  ['a uuid key', base({ type: 'uuid' })],
  ['a text key', TEXT],
  ['a date key', base({ type: 'date' })],
  ['a timestamptz key', base({ type: 'timestamptz' })],
  ['an enum key', MOOD],
];

/** The spec labelled `label` in `specs`. */
export function named(
  specs: ReadonlyArray<readonly [string, ValueSpec]>,
  label: string,
): ValueSpec {
  const found = specs.find(([name]) => name === label);
  if (found === undefined) {
    throw new Error(`no spec named ${label}`);
  }
  return found[1];
}
