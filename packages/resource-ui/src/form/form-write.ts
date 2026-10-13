/**
 * The write a form's values make (resource SPEC 20.3, steps 1 to 3): each
 * member whose value differs from its start, and on create each member a
 * create must carry, in its wire form (SPEC 5.1), fields under
 * `attributes` and relationships under `relationships`, each part present
 * when it holds a member. A blank is `null`, which a member that is not
 * nullable refuses as `required` (ADR 0016); every member the person left
 * alone is absent, so the database's default applies on create and the
 * stored value stays on update (ADR 0004).
 * @ref https://www.rfc-editor.org/rfc/rfc8259#section-6
 * @packageDocumentation
 */
import type { ItemMeta } from '@nizam-os/resource-core';

import type { FormOperation } from './form-types';
import type { HeldMember } from './form-values';

import { partOf } from './form-plan';
import { valueIn } from './form-values';
import { isBlank } from './value-kind';

/** A write as the client's `create` and `update` take it (jsonapi SPEC 15.4). */
export interface FormWrite {
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly relationships?: Readonly<Record<string, unknown>>;
}

/** RFC 8259 section 6: the grammar of a JSON number. */
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;

/** A number input's text as the number it spells when that is a finite JSON number; as it is otherwise, which the validator refuses with `type`. */
function numberOf(value: unknown): unknown {
  if (typeof value !== 'string' || !JSON_NUMBER.test(value)) {
    return value;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

const BOOLEAN_TEXTS: ReadonlyMap<unknown, boolean> = new Map([
  ['true', true],
  ['false', false],
]);

/** An array element's text in its wire form, by the array's `items`. */
function elementOf(items: ItemMeta, value: unknown): unknown {
  if (items.wire === 'integer' || items.wire === 'number') {
    return numberOf(value);
  }
  return items.wire === 'boolean' ? (BOOLEAN_TEXTS.get(value) ?? value) : value;
}

/** The wire form of a member's value: a blank as `null`, a relationship's id as its identifier. */
function wireOf(member: HeldMember, value: unknown): unknown {
  const { meta, kind } = member;
  if (isBlank(kind, value)) {
    return null;
  }
  if (meta.kind === 'relationship') {
    return { type: meta.target, id: value };
  }
  if (kind === 'number') {
    return numberOf(value);
  }
  const { items } = meta;
  return kind === 'array' && items !== null && Array.isArray(value)
    ? value.map((element: unknown) => elementOf(items, element))
    : value;
}

/** Whether `value` differs from where the member started: arrays element by element, all else by `Object.is`. */
function changed(member: HeldMember, value: unknown): boolean {
  const { start } = member;
  if (Array.isArray(start) && Array.isArray(value)) {
    return (
      start.length !== value.length ||
      start.some((element, index) => !Object.is(element, value[index]))
    );
  }
  return !Object.is(start, value);
}

/** The write `values` make for `members` on `operation`, unvalidated. */
export function writeOf(
  operation: FormOperation,
  members: ReadonlyArray<HeldMember>,
  values: unknown,
): FormWrite {
  const parts: Record<
    'attributes' | 'relationships',
    Record<string, unknown>
  > = { attributes: {}, relationships: {} };
  for (const member of members) {
    const value = valueIn(values, member);
    if (
      changed(member, value) ||
      (operation === 'create' && member.meta.required)
    ) {
      parts[partOf(member.meta)][member.meta.name] = wireOf(member, value);
    }
  }
  const { attributes, relationships } = parts;
  return {
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(Object.keys(relationships).length > 0 ? { relationships } : {}),
  };
}

/** `write` as the write validator reads it: each missing part as `{}`, as jsonapi-core's parser gives it. */
export function validatorInput(write: FormWrite): {
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly relationships: Readonly<Record<string, unknown>>;
} {
  return {
    attributes: write.attributes ?? {},
    relationships: write.relationships ?? {},
  };
}
