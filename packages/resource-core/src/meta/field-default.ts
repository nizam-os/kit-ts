/**
 * A member's default as its metadata describes it (SPEC 8): the constant's
 * text, as the catalog holds it, and its read form, read as SPEC 5.4 reads
 * PostgreSQL's text by the type the member's value spec ends in. The
 * catalog extracts in a UTC session with ISO dates (catalog SPEC 7.1), the
 * settings the read forms assume, so a date-time constant reads as a
 * stored one does. A codec's field has no
 * read form here: only its storage codec reads its text.
 * @packageDocumentation
 */
import type { PublicColumnDefault } from '@nizam-os/catalog-core';

import type { ValueSpec } from '../schema/value-form';
import type { ColumnType } from '../wire/column-type';
import type { FieldDefault } from './types';

import { deepFreeze } from '../internal/object';
import { readForm, UNREPRESENTABLE } from '../wire/read-form';

/**
 * The column type a value spec reads by, an array's by its element's; a
 * codec's value has none, and neither does an array of arrays, which a
 * value spec never holds, since an array's levels share one element type.
 */
function typeOf(spec: ValueSpec): ColumnType | undefined {
  const { form } = spec;
  const scalar = form.kind === 'array' ? form.element.form : form;
  if (scalar.kind === 'codec' || scalar.kind === 'array') {
    return undefined;
  }
  return {
    base: scalar.kind === 'boolean' ? 'bool' : scalar.type,
    enum: scalar.kind === 'enum',
    array: form.kind === 'array',
  };
}

/** The read form of `literal`, or `undefined` when the type has none or the literal is outside it. */
function valueOf(literal: string | null, spec: ValueSpec): unknown {
  const type = typeOf(spec);
  const value =
    literal === null || type === undefined
      ? UNREPRESENTABLE
      : readForm(literal, type);
  return value === UNREPRESENTABLE ? undefined : value;
}

/** A key's value as its id's text (SPEC 3.4): a number or a boolean by `String`, a string as it is. */
function idText(value: unknown): unknown {
  return typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : value;
}

/**
 * The default of a member whose value `spec` describes, frozen, with a
 * relationship's value as its id's text (SPEC 3.4); `null` without one.
 */
export function fieldDefault(
  applied: PublicColumnDefault | null,
  spec: ValueSpec,
  relationship: boolean,
): FieldDefault | null {
  if (applied === null) {
    return null;
  }
  const value = valueOf(applied.literal, spec);
  return Object.freeze({
    literal: applied.literal,
    value: relationship ? idText(value) : deepFreeze(value),
  });
}
