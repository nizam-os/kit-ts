/**
 * The control a member's filter takes (resource SPEC 20.2), read from its
 * metadata (SPEC 8) in the order of the SPEC's table: the first that holds
 * names it. The kind picks a control; the member's declared operators say
 * which conditions the control may write.
 * @packageDocumentation
 */
import type { FieldMeta } from '@nizam-os/resource-core';

/**
 * The control a filter of a member takes: `reference` the target's ids,
 * `options` a choice among the member's options, `values` an array's
 * elements, `boolean` yes or no, `number` and `date` a value or a range,
 * `text` a text box.
 */
export type FilterKind =
  | 'options'
  | 'boolean'
  | 'number'
  | 'date'
  | 'text'
  | 'values'
  | 'reference';

/** The wire types a number travels as (SPEC 5.1). */
const NUMBER_WIRES: ReadonlySet<string> = new Set(['integer', 'number']);

/** The formats of the numbers that travel as text, `int8` and `numeric`, since they exceed JavaScript's numbers (SPEC 5.1). */
const NUMBER_FORMATS: ReadonlySet<string> = new Set(['int64', 'decimal']);

/** The formats of `date`, `timestamp`, and `timestamptz` (SPEC 5.1). */
const DATE_FORMATS: ReadonlySet<string> = new Set([
  'date',
  'date-time',
  'date-time-local',
]);

/** The options of a member, or else of an array's elements; `null` when neither has any. */
export function optionValues(meta: FieldMeta): ReadonlyArray<string> | null {
  return meta.options ?? meta.items?.options ?? null;
}

function isFormat(meta: FieldMeta, formats: ReadonlySet<string>): boolean {
  return meta.format !== null && formats.has(meta.format);
}

/** The kind of control a filter of the member `meta` describes takes. */
export function filterKind(meta: FieldMeta): FilterKind {
  if (meta.kind === 'relationship') {
    return 'reference';
  }
  if (optionValues(meta) !== null) {
    return 'options';
  }
  if (meta.wire === 'array') {
    return 'values';
  }
  if (meta.wire === 'boolean') {
    return 'boolean';
  }
  if (NUMBER_WIRES.has(meta.wire) || isFormat(meta, NUMBER_FORMATS)) {
    return 'number';
  }
  return isFormat(meta, DATE_FORMATS) ? 'date' : 'text';
}
