/**
 * An update action's values held to the declaration (resource SPEC 21.2,
 * 21.4): `{ attributes?, relationships? }` as the client's `update` takes
 * them (jsonapi SPEC 15.4), each member one the update writes (SPEC 9.4)
 * under the part its kind names, and the write they send passing
 * `write.update` (SPEC 6.2), which reads each relationship as the
 * identifiers the client sends for it. The values are the same for every
 * record, so they are checked once, when the model is made. A CHECK across
 * members runs only when the values carry every member it reads; the
 * database judges the others at the write (SPEC 6.2, 9.5).
 * @packageDocumentation
 */
import type { UpdateInput } from '@nizam-os/jsonapi-client';
import type { AnyResource } from '@nizam-os/jsonapi-core';
import type { FieldMeta } from '@nizam-os/resource-core';

import type { ActionResource } from './action-types';

import { partOf } from '../form/form-plan';
import { isRecord, ownValue } from '../internal/object';

/** The access of the members an update writes (SPEC 3.1). */
const WRITTEN: ReadonlySet<string> = new Set(['readWrite', 'write']);

const PARTS: ReadonlySet<string> = new Set(['attributes', 'relationships']);

type Part = 'attributes' | 'relationships';

/** An update's values as the model holds them: each part given, frozen, as the client's `update` takes them. */
export type HeldValues = UpdateInput<AnyResource>;

/** Where the values sit, for the messages: the function and the action. */
interface ValuesAt {
  readonly caller: string;
  readonly at: string;
}

/**
 * The identifier the client sends for a relationship given as an id or an
 * identifier object, the object's `type` and `id` alone (jsonapi SPEC
 * 15.4); anything else as it is, `null` and a list among them, for the
 * validator to judge. Every declared relationship is to-one (SPEC 11.1).
 */
function identifierOf(target: string | null, value: unknown): unknown {
  if (typeof value === 'string') {
    return { type: target, id: value };
  }
  if (!isRecord(value) || !('id' in value)) {
    return value;
  }
  const { type, id } = value;
  return { type, id };
}

/** The members `values` holds under `part`, each one the update writes; `[]` for a part left out. */
function membersOf(
  where: ValuesAt,
  resource: ActionResource,
  part: Part,
  values: unknown,
): ReadonlyArray<readonly [FieldMeta, unknown]> {
  if (values === undefined) {
    return [];
  }
  if (!isRecord(values)) {
    throw new TypeError(
      `${where.caller}: ${where.at}.${part} must be an object`,
    );
  }
  return Object.entries(values).map(([name, value]) => {
    const meta = ownValue(resource.fields, name);
    if (
      meta === undefined ||
      partOf(meta) !== part ||
      !WRITTEN.has(meta.access)
    ) {
      throw new TypeError(
        `${where.caller}: ${where.at}.${part}.${name} is not a member the update of ${resource.names.type} writes`,
      );
    }
    return [meta, value] as const;
  });
}

/** A part as the model holds it: its members by public name, frozen. */
function heldPart(
  members: ReadonlyArray<readonly [FieldMeta, unknown]>,
): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(members.map(([meta, value]) => [meta.name, value])),
  );
}

/** Throws unless `resource`'s update validator accepts the write the members send. */
function checkValidated(
  where: ValuesAt,
  resource: ActionResource,
  attributes: ReadonlyArray<readonly [FieldMeta, unknown]>,
  relationships: ReadonlyArray<readonly [FieldMeta, unknown]>,
): void {
  const { issues } = resource.write.update['~standard'].validate({
    attributes: Object.fromEntries(
      attributes.map(([meta, value]) => [meta.name, value]),
    ),
    relationships: Object.fromEntries(
      relationships.map(([meta, value]) => [
        meta.name,
        identifierOf(meta.target, value),
      ]),
    ),
  });
  if (issues !== undefined) {
    const paths = new Set(issues.map((issue) => issue.path.join('.')));
    throw new TypeError(
      `${where.caller}: ${where.at} does not pass the update's validator at ${[...paths].join(', ')}`,
    );
  }
}

/**
 * `update`, the values of the action `where` names, checked against
 * `resource` and frozen. Throws `TypeError` naming the member for values
 * that are not an object of the two parts, a member the update does not
 * write, values that set no member, and values the update's validator
 * refuses, naming each issue's path.
 */
export function heldValues(
  where: ValuesAt,
  resource: ActionResource,
  update: unknown,
): HeldValues {
  if (!isRecord(update)) {
    throw new TypeError(`${where.caller}: ${where.at} must be an object`);
  }
  for (const key of Object.keys(update)) {
    if (!PARTS.has(key)) {
      throw new TypeError(
        `${where.caller}: ${where.at}.${key} is neither attributes nor relationships`,
      );
    }
  }
  const { attributes, relationships } = update;
  const attributeMembers = membersOf(where, resource, 'attributes', attributes);
  const relationshipMembers = membersOf(
    where,
    resource,
    'relationships',
    relationships,
  );
  // A member whose value is `undefined` is one the client leaves out (jsonapi SPEC 15.4).
  if (
    ![...attributeMembers, ...relationshipMembers].some(
      ([, value]) => value !== undefined,
    )
  ) {
    throw new TypeError(`${where.caller}: ${where.at} sets no member`);
  }
  checkValidated(where, resource, attributeMembers, relationshipMembers);
  const held = {
    ...(attributes === undefined
      ? {}
      : { attributes: heldPart(attributeMembers) }),
    ...(relationships === undefined
      ? {}
      : { relationships: heldPart(relationshipMembers) }),
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the update's validator accepted each relationship's value as the identifiers identifierOf makes of it, which it makes only of an id or an object with one, the client's linkage input
  return Object.freeze(held) as HeldValues;
}
