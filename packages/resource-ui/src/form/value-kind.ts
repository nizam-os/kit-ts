/**
 * What a member's input edits (resource SPEC 20.3): the kind of its form
 * value, read from its wire type (SPEC 5.1), and the kind's blank, the
 * value of an input left empty. An array has no blank: `[]` is a value.
 * @packageDocumentation
 */
import type { FieldMeta } from '@nizam-os/resource-core';

/**
 * `text`: a string wire or a relationship's id, as typed; `number`: an
 * `integer` or `number` wire, as the text a number input edits; `boolean`:
 * `true`, `false`, or `null` until it is set; `array`: a list of its
 * elements' texts; `any`: a JSON value or a codec's, as it is.
 */
export type ValueKind = 'text' | 'number' | 'boolean' | 'array' | 'any';

const KINDS: Readonly<Record<FieldMeta['wire'], ValueKind>> = {
  string: 'text',
  integer: 'number',
  number: 'number',
  boolean: 'boolean',
  array: 'array',
  any: 'any',
};

/** The kind of the member `meta` describes; a relationship's value is its target's id. */
export function valueKind(meta: FieldMeta): ValueKind {
  return meta.kind === 'relationship' ? 'text' : KINDS[meta.wire];
}

/** The blank of each kind but `array`. */
const BLANKS: Readonly<Record<Exclude<ValueKind, 'array'>, unknown>> = {
  text: '',
  number: '',
  boolean: null,
  any: undefined,
};

/** The value an empty input of `kind` holds; an array starts empty instead. */
export function blankOf(kind: ValueKind): unknown {
  return kind === 'array' ? Object.freeze([]) : BLANKS[kind];
}

/** Whether `value` is the blank of `kind`; an array is never blank. */
export function isBlank(kind: ValueKind, value: unknown): boolean {
  return kind !== 'array' && Object.is(value, BLANKS[kind]);
}
