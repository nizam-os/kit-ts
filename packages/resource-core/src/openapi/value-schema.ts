/**
 * The JSON Schema of a value (SPEC 5.1, 8, 13.1), read from its metadata:
 * the wire form's type and format, the folded limits as keywords, the
 * options as `enum`, an array's elements as `items`, and `null` where the
 * value may be `null`. A codec's value is described by its own schema,
 * through Zod's `toJSONSchema`. The schema admits every value the Zod
 * schema accepts and may admit more, never less: what JSON Schema cannot
 * state compactly stays with the server, which the error responses
 * document: U+0000 and unpaired surrogates, a `real`'s range, an `int8` or
 * `numeric` bound finer than its digit count, a negative zero, a
 * date-time's range and leap second, a validator, a codec's refinements.
 * @ref https://spec.openapis.org/oas/v3.1.1.html#data-types
 * @ref https://json-schema.org/draft/2020-12/json-schema-validation
 * @ref https://zod.dev/json-schema
 * @packageDocumentation
 */
import type { $ZodType } from 'zod/v4/core';

import type { JsonSchema } from '@nizam-os/ban-core';

import type { FieldLimits, ItemMeta, WireType } from '../meta/types';

import { toJSONSchema } from 'zod/v4/core';

import { formPattern } from './form-pattern';
import { dotAllSource } from './pattern';

/** What a value's schema is read from: an element's metadata, or a whole value's with its elements. */
export interface ValueDescription {
  readonly wire: WireType;
  readonly format: string | null;
  readonly fractionDigits: number | null;
  readonly limits: FieldLimits;
  readonly options: ReadonlyArray<string> | null;
  readonly items?: ItemMeta | null | undefined;
}

/** Which side of the wire a codec's value is read on (SPEC 7.1). */
export type CodecSide = 'input' | 'output';

/**
 * The formats the registry defines for numbers alone: an `int2`, `int4`,
 * or float id travels as text (SPEC 3.4), which its pattern describes.
 * @ref https://spec.openapis.org/registry/format/int32.html
 * @ref https://spec.openapis.org/registry/format/float.html
 */
const NUMBER_FORMATS: ReadonlySet<string> = new Set([
  'int16',
  'int32',
  'float',
  'double',
]);

/** One `pattern`, or each under `allOf`, since a schema holds one `pattern` (SPEC 8). */
function patternKeywords(patterns: ReadonlyArray<string>): JsonSchema {
  const [only, ...rest] = patterns;
  if (only === undefined) {
    return {};
  }
  return rest.length === 0
    ? { pattern: only }
    : { allOf: patterns.map((pattern) => ({ pattern })) };
}

function stringSchema(value: ValueDescription): JsonSchema {
  const { format, limits } = value;
  const form = formPattern(value);
  const patterns = [
    ...(form === null ? [] : [form]),
    ...limits.patterns.map((source) => dotAllSource(source)),
  ];
  return {
    type: 'string',
    ...(format === null || NUMBER_FORMATS.has(format) ? {} : { format }),
    ...(limits.minLength === null ? {} : { minLength: limits.minLength }),
    ...(limits.maxLength === null ? {} : { maxLength: limits.maxLength }),
    ...patternKeywords(patterns),
  };
}

/** A decimal bound as a JSON number, when it is one: `Number` is the conversion PostgreSQL applies to the constant (SPEC 5.3). */
function bound(keyword: string, text: string | null): JsonSchema {
  const number = text === null ? Number.NaN : Number(text);
  return Number.isFinite(number) ? { [keyword]: number } : {};
}

function numberSchema(value: ValueDescription): JsonSchema {
  const { limits } = value;
  return {
    type: value.wire,
    ...(value.format === null ? {} : { format: value.format }),
    ...bound('minimum', limits.minimum),
    ...bound('exclusiveMinimum', limits.exclusiveMinimum),
    ...bound('maximum', limits.maximum),
    ...bound('exclusiveMaximum', limits.exclusiveMaximum),
  };
}

function arraySchema(value: ValueDescription): JsonSchema {
  const { items } = value;
  return {
    type: 'array',
    ...(items === null || items === undefined
      ? {}
      : { items: wireSchema({ ...items, items: null }) }),
  };
}

const SCHEMAS: Readonly<
  Record<WireType, (value: ValueDescription) => JsonSchema>
> = {
  string: (value) => ({
    ...stringSchema(value),
    ...(value.options === null ? {} : { enum: [...value.options] }),
  }),
  integer: numberSchema,
  number: numberSchema,
  boolean: () => ({ type: 'boolean' }),
  array: arraySchema,
  any: () => ({}),
};

/** The schema of a value with a wire form, without `null`. */
export function wireSchema(value: ValueDescription): JsonSchema {
  return SCHEMAS[value.wire](value);
}

/**
 * A codec's schema as JSON Schema, from `io` of its Zod schema. A schema
 * JSON Schema cannot hold becomes `{}`, which admits every value. The
 * `$schema` member is dropped: the document's dialect applies.
 */
export function codecSchema(schema: $ZodType, side: CodecSide): JsonSchema {
  const { $schema: _dialect, ...converted } = toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: side,
    unrepresentable: 'any',
  }) as JsonSchema;
  return converted;
}

function isArray(value: unknown): value is ReadonlyArray<unknown> {
  return Array.isArray(value);
}

/** `schema` admitting `null` too: in its `type` list and its `enum` when it has a single type, else under `anyOf`. */
export function withNull(schema: JsonSchema): JsonSchema {
  if (Object.keys(schema).length === 0) {
    return schema;
  }
  const { type } = schema;
  if (typeof type !== 'string') {
    return { anyOf: [schema, { type: 'null' }] };
  }
  const { enum: options } = schema;
  return {
    ...schema,
    type: [type, 'null'],
    ...(isArray(options) ? { enum: [...options, null] } : {}),
  };
}
