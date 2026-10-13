/**
 * The request of the Atomic Operations endpoint (SPEC 13.1): an operations
 * document of at most the cap the resources' definitions share, each
 * operation one a resource takes, as the processor reads it (jsonapi SPEC
 * 11.2, 11.4): an `add` of a resource object with an optional `lid`, by
 * collection `href` or none, since a `ref` always names a resource; a
 * resource's `update` and `remove` by `ref`, by `id` or by the `lid` of an
 * earlier `add`, or by `href`; and an `update` of each relationship the
 * resource updates, with the target's linkage. An `href` is a string the
 * schema cannot tell apart by type, so the operations are `anyOf`.
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 * @ref https://github.com/nizam-os/kit-ts/blob/main/docs/jsonapi/SPEC.md (sections 11.2 and 11.4)
 * @packageDocumentation
 */
import type { JsonSchema } from '@nizam-os/ban-core';

import type { DeclaredInternals } from '../declare/declared-resource';

import { schemaRef } from './component-names';
import { TOP_LEVEL } from './documents';
import { LINK_SCHEMA, linkageSchema } from './member-schemas';
import { idSchema } from './resource-schemas';

/** The extension's member that holds the operations. */
const OPERATIONS = 'atomic:operations';
const META: JsonSchema = { type: 'object' };

/** Whether the resource declares `operation`. */
export function declares(
  internals: DeclaredInternals,
  operation: string,
): boolean {
  return internals.resource.declaration.operations.some(
    (declared) => declared === operation,
  );
}

/** A `ref` to the resource, by `id`, or by `lid` where `lids` holds its type, naming `relationship` when given. */
function refSchema(
  internals: DeclaredInternals,
  lids: ReadonlySet<string>,
  relationship?: string,
): JsonSchema {
  const { type } = internals.resource.names;
  const named =
    relationship === undefined ? {} : { relationship: { const: relationship } };
  const by = (member: string, schema: JsonSchema): JsonSchema => ({
    type: 'object',
    properties: { type: { const: type }, [member]: schema, ...named },
    required: ['type', member, ...Object.keys(named)],
    additionalProperties: false,
  });
  const byId = by('id', idSchema(internals));
  return lids.has(type)
    ? { oneOf: [byId, by('lid', { type: 'string' })] }
    : byId;
}

/**
 * One closed variant of an operation: `op`, the members `target` names
 * its target by, `data` when it carries one, and `meta`. A variant per
 * target member keeps `ref` and `href` apart without a `not`, which a
 * strict validator such as Ajv's refuses to read beside `required`.
 */
function variant(
  op: string,
  target: Readonly<Record<string, JsonSchema>>,
  data?: JsonSchema,
): JsonSchema {
  const carried = data === undefined ? {} : { data };
  return {
    type: 'object',
    properties: { op: { const: op }, ...target, ...carried, meta: META },
    required: ['op', ...Object.keys(target), ...Object.keys(carried)],
    additionalProperties: false,
  };
}

/** An `update` of each relationship the resource updates, `readWrite` with `update` declared, by `ref` or by its link. */
function relationshipUpdates(
  internals: DeclaredInternals,
  lids: ReadonlySet<string>,
): ReadonlyArray<JsonSchema> {
  return internals.specs.relationships
    .filter((spec) => spec.access === 'readWrite')
    .flatMap((spec) => {
      const target = spec.target().names.type;
      const data = linkageSchema(target, spec.nullable, lids.has(target));
      return [
        variant('update', { ref: refSchema(internals, lids, spec.name) }, data),
        variant('update', { href: LINK_SCHEMA }, data),
      ];
    });
}

/** The operations the resource takes. */
function operationsOf(
  internals: DeclaredInternals,
  lids: ReadonlySet<string>,
): ReadonlyArray<JsonSchema> {
  const { type } = internals.resource.names;
  const updates = declares(internals, 'update');
  const added = schemaRef(type, 'atomic-add');
  const updated = schemaRef(type, 'atomic-update');
  return [
    ...(declares(internals, 'create')
      ? [
          variant('add', {}, added),
          variant('add', { href: LINK_SCHEMA }, added),
        ]
      : []),
    ...(updates
      ? [
          variant('update', { ref: refSchema(internals, lids) }, updated),
          variant('update', { href: LINK_SCHEMA }, updated),
          variant('update', {}, updated),
        ]
      : []),
    ...(declares(internals, 'remove')
      ? [
          variant('remove', { ref: refSchema(internals, lids) }),
          variant('remove', { href: LINK_SCHEMA }),
        ]
      : []),
    ...(updates ? relationshipUpdates(internals, lids) : []),
  ];
}

/** `schemas` without repeats, such as the `remove` by `href` every removable resource has, in order. */
function distinct(schemas: ReadonlyArray<JsonSchema>): Array<JsonSchema> {
  const seen = new Set<string>();
  return schemas.filter((schema) => {
    const key = JSON.stringify(schema);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * The cap on one request that the definitions of `listed` share, their
 * `atomic.max` (jsonapi SPEC 5.1), which the processor enforces; a
 * `TypeError` when they differ, as the processor throws.
 */
function sharedCap(listed: ReadonlyArray<DeclaredInternals>): number {
  const caps = [
    ...new Set(
      listed.map((internals) => internals.resource.resource.atomic.max),
    ),
  ];
  const [cap] = caps;
  if (cap === undefined || caps.length > 1) {
    throw new TypeError(
      `openapi: the resources' definitions have different atomic.max (${caps.join(', ')}); one endpoint takes one cap`,
    );
  }
  return cap;
}

/** The operations document: at most the cap the definitions share, and the top-level members it allows. */
export function requestDocumentSchema(
  listed: ReadonlyArray<DeclaredInternals>,
  lids: ReadonlySet<string>,
): JsonSchema {
  return {
    type: 'object',
    properties: {
      [OPERATIONS]: {
        type: 'array',
        minItems: 1,
        maxItems: sharedCap(listed),
        items: {
          anyOf: distinct(
            listed.flatMap((internals) => operationsOf(internals, lids)),
          ),
        },
      },
      ...TOP_LEVEL,
    },
    required: [OPERATIONS],
    patternProperties: { '^@': {} },
    additionalProperties: false,
  };
}
