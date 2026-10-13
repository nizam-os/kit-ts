/**
 * A value's base (SPEC 5.1, 7.1): the wire form of a base type with the
 * bounds its modifiers set (`varchar(n)`, the integer ranges,
 * `numeric(p, s)`, the fraction digits of `timestamp(p)`), or a codec's
 * schema, and the spec every level of a column's type is described with.
 * @packageDocumentation
 */
import type { PublicColumn, PublicDomain } from '@nizam-os/catalog-core';

import type { Codec, Validator } from '../codecs/types';
import type { Limits } from './limits';

import { INTEGER_RANGES, SECOND_FRACTION_DIGITS } from '../wire/bounds';
import { powerOfTen } from '../wire/decimal';
import { isWireType } from '../wire/types';
import { NO_LIMITS, withLength, withMultipleOf, withRange } from './limits';

/** The base types of SPEC 5.1 grouped by the JSON value they travel as. */
type TextType = 'text' | 'varchar' | 'citext';
type NumberType = 'int2' | 'int4' | 'float4' | 'float8';
type DecimalType = 'int8' | 'numeric';
type StringType = 'uuid' | 'date';
type DateTimeType = 'timestamp' | 'timestamptz';
type JsonType = 'json' | 'jsonb';

/** A value's base: a wire form (SPEC 5.1) or a codec's schema (SPEC 7.1). */
export type ValueForm =
  | { readonly kind: 'text'; readonly type: TextType }
  | {
      readonly kind: 'text';
      readonly type: 'bpchar';
      /** n of `bpchar(n)`, the length PostgreSQL pads a value to; `null` without one. */
      readonly length: number | null;
    }
  | { readonly kind: 'number'; readonly type: NumberType }
  | { readonly kind: 'decimal'; readonly type: DecimalType }
  | { readonly kind: 'string'; readonly type: StringType }
  | {
      readonly kind: 'string';
      readonly type: DateTimeType;
      /** The fraction digits of a second the column keeps: p of `timestamp(p)`, six without one. */
      readonly fractionDigits: number;
    }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'json'; readonly type: JsonType }
  | { readonly kind: 'enum'; readonly type: string }
  | { readonly kind: 'array'; readonly element: ValueSpec }
  | { readonly kind: 'codec'; readonly name: string; readonly codec: Codec };

/** The CHECK a validator stands for: a table's, or a domain's. */
interface ValidatorCheck {
  /** The domain's reference name, or `null` for a table's CHECK. */
  readonly domain: string | null;
  readonly constraint: string;
}

/** A validator a value runs through, the code its issues carry (SPEC 6.4), and the CHECK it stands for. */
export interface ValidatorUse {
  readonly name: string;
  readonly validator: Validator;
  readonly code: string;
  readonly check: ValidatorCheck;
}

/** A value's base, its folded limits, its options, and its validators. */
export interface ValueSpec {
  readonly form: ValueForm;
  readonly limits: Limits;
  /** Enum labels or an `enum` rule's values, in order; `null` when any value of the form goes. */
  readonly options: ReadonlyArray<string> | null;
  readonly validators: ReadonlyArray<ValidatorUse>;
}

/** The members of a column or a domain that describe its type. */
export type TypeRecord = Pick<
  PublicColumn | PublicDomain,
  'type' | 'typeKind' | 'array' | 'maxLength' | 'precision' | 'scale'
>;

const FORMS: ReadonlyMap<string, ValueForm> = new Map<string, ValueForm>([
  ['text', { kind: 'text', type: 'text' }],
  ['varchar', { kind: 'text', type: 'varchar' }],
  ['citext', { kind: 'text', type: 'citext' }],
  ['int2', { kind: 'number', type: 'int2' }],
  ['int4', { kind: 'number', type: 'int4' }],
  ['float4', { kind: 'number', type: 'float4' }],
  ['float8', { kind: 'number', type: 'float8' }],
  ['int8', { kind: 'decimal', type: 'int8' }],
  ['numeric', { kind: 'decimal', type: 'numeric' }],
  ['uuid', { kind: 'string', type: 'uuid' }],
  ['date', { kind: 'string', type: 'date' }],
  ['json', { kind: 'json', type: 'json' }],
  ['jsonb', { kind: 'json', type: 'jsonb' }],
  ['bool', { kind: 'boolean' }],
]);

const QUALIFIED_CITEXT = /\.citext$/u;

/** A spec with nothing but its form. */
export function specOf(form: ValueForm): ValueSpec {
  return { form, limits: NO_LIMITS, options: null, validators: [] };
}

function integerLimits(type: 'int2' | 'int4' | 'int8'): Limits {
  const { min, max } = INTEGER_RANGES[type];
  return withRange(NO_LIMITS, {
    min: { value: min, inclusive: true },
    max: { value: max, inclusive: true },
  });
}

/** `numeric(p, s)`: an absolute value below `10^(p - s)`, in steps of `10^-s` (PostgreSQL 15 allows a negative scale). */
function numericLimits(precision: number, scale: number): Limits {
  const bound = powerOfTen(precision - scale);
  return withMultipleOf(
    withRange(NO_LIMITS, {
      min: { value: `-${bound}`, inclusive: false },
      max: { value: bound, inclusive: false },
    }),
    powerOfTen(-scale),
  );
}

/** The bounds a base type and its modifiers put on a value. */
function typeLimits(form: ValueForm, record: TypeRecord): Limits {
  if (form.kind === 'text') {
    return record.maxLength === null
      ? NO_LIMITS
      : withLength(NO_LIMITS, { min: null, max: record.maxLength });
  }
  if (
    form.kind === 'number' &&
    form.type !== 'float4' &&
    form.type !== 'float8'
  ) {
    return integerLimits(form.type);
  }
  if (form.kind === 'decimal') {
    if (form.type === 'int8') {
      return integerLimits('int8');
    }
    return record.precision === null
      ? NO_LIMITS
      : numericLimits(record.precision, record.scale ?? 0);
  }
  return NO_LIMITS;
}

/**
 * The form of a wire type. A date-time keeps the record's precision, which
 * PostgreSQL caps at six digits ("precision reduced to maximum allowed"),
 * and a `bpchar` the length it pads to.
 * @ref https://www.postgresql.org/docs/18/datatype-datetime.html
 * @ref https://www.postgresql.org/docs/18/datatype-character.html
 */
function formOf(type: string, record: TypeRecord): ValueForm | undefined {
  if (type === 'bpchar') {
    return { kind: 'text', type, length: record.maxLength };
  }
  if (type === 'timestamp' || type === 'timestamptz') {
    const digits = record.precision ?? SECOND_FRACTION_DIGITS;
    return {
      kind: 'string',
      type,
      fractionDigits: Math.min(digits, SECOND_FRACTION_DIGITS),
    };
  }
  return FORMS.get(type);
}

/** The spec of a base type, or `undefined` for a type without a wire form. */
export function baseSpec(record: TypeRecord): ValueSpec | undefined {
  const type = QUALIFIED_CITEXT.test(record.type) ? 'citext' : record.type;
  const form = isWireType(type) ? formOf(type, record) : undefined;
  return form === undefined
    ? undefined
    : { ...specOf(form), limits: typeLimits(form, record) };
}
