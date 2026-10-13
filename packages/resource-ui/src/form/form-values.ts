/**
 * The values a form starts from (resource SPEC 20.3): on create, each
 * member's display default (SPEC 8), the value a read gives for it, or
 * blank without one, and on update, the record's value; either read as
 * the member's input edits it, by one set of readers.
 * @packageDocumentation
 */
import type { FieldMeta } from '@nizam-os/resource-core';

import type { FieldDescriptor } from '../fields/fields-of';
import type { FormOperation, FormRecord } from './form-types';
import type { ValueKind } from './value-kind';

import { isRecord, ownValue } from '../internal/object';
import { blankOf, valueKind } from './value-kind';

const CALLER = 'resourceForm';

/** A member the form holds: its descriptor, the kind of its value, and the value the form started from. */
export interface HeldMember {
  readonly descriptor: FieldDescriptor;
  readonly meta: FieldMeta;
  readonly kind: ValueKind;
  /** What the write compares the member's value to. */
  readonly start: unknown;
}

/** The scalar JSON values a record holds, as their texts: a string as it is, a number or a boolean by `String`. */
function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;
}

/** A scalar's text, `null` as blank. */
function textOf(value: unknown): string | undefined {
  return value === null ? '' : scalarText(value);
}

/** An array's elements as texts, `null` as `[]`. */
function elementsOf(value: unknown): ReadonlyArray<string> | undefined {
  if (value === null) {
    return Object.freeze([]);
  }
  const texts = Array.isArray(value)
    ? value.map((element: unknown) => scalarText(element))
    : [undefined];
  return texts.every((text) => text !== undefined)
    ? Object.freeze(texts)
    : undefined;
}

/** How the record's value of each kind becomes the value its input edits; `undefined` when it is no value of the kind. */
const READERS: Readonly<Record<ValueKind, (value: unknown) => unknown>> = {
  text: textOf,
  number: textOf,
  boolean: (value) =>
    value === null || typeof value === 'boolean' ? value : undefined,
  array: elementsOf,
  any: (value) => value,
};

/** A relationship's id: its linkage's or its included record's, blank when it is `null`. */
function idOf(name: string, value: unknown): string {
  if (value === null) {
    return '';
  }
  const id = isRecord(value) ? ownValue(value, 'id') : undefined;
  if (typeof id !== 'string') {
    throw new TypeError(
      `${CALLER}: the record's ${name} is neither linkage nor a record`,
    );
  }
  return id;
}

/** A member's display default as its input edits it; blank without one, for an expression, a codec's field, and a constant outside the read form (SPEC 8). */
function createStart(meta: FieldMeta, kind: ValueKind): unknown {
  const value = meta.default?.value;
  return value === undefined ? blankOf(kind) : READERS[kind](value);
}

function updateStart(
  meta: FieldMeta,
  kind: ValueKind,
  record: FormRecord,
): unknown {
  if (meta.access === 'write') {
    return blankOf(kind);
  }
  const value = ownValue(record, meta.name);
  if (value === undefined) {
    throw new TypeError(
      `${CALLER}: the record has no ${meta.name}, which the form holds`,
    );
  }
  if (meta.kind === 'relationship') {
    return idOf(meta.name, value);
  }
  const start = READERS[kind](value);
  if (start === undefined) {
    throw new TypeError(
      `${CALLER}: the record's ${meta.name} is not the value its type reads`,
    );
  }
  return start;
}

/** The member `descriptor` describes, started for `operation`, from `record` on update. */
export function heldMember(
  descriptor: FieldDescriptor,
  operation: FormOperation,
  record?: FormRecord,
): HeldMember {
  const { meta } = descriptor;
  const kind = valueKind(meta);
  const start =
    record === undefined
      ? createStart(meta, kind)
      : updateStart(meta, kind, record);
  return {
    descriptor: Object.freeze({
      ...descriptor,
      required: operation === 'create' && meta.required,
    }),
    meta,
    kind,
    start,
  };
}

/** The value `values` hold for `member`; a member they leave out stays where it started. */
export function valueIn(values: unknown, member: HeldMember): unknown {
  const name = member.descriptor.name;
  return isRecord(values) && Object.hasOwn(values, name)
    ? values[name]
    : member.start;
}
