/**
 * The linkage schemas of a resource (SPEC 6.2): the object schemas of its
 * relationships, keyed by public name, each member a resource identifier
 * object `{ type, id }` with the target's type as a literal and the id in
 * the id form of the foreign-key column (`id-schema.ts`), or `null` when
 * the column is effectively nullable. The object is what
 * `@nizam-os/jsonapi-core` parses a document's `relationships` into: each
 * relationship's `data`. An identifier's other members, such as `meta`,
 * are stripped. A relationship enters a validator as its id, or `null`
 * (SPEC 7.2), so a validator never reads a target's declaration.
 * @ref https://jsonapi.org/format/1.1/#document-resource-identifier-objects
 * @packageDocumentation
 */
import type { MultiColumnCheck } from './multi-column';
import type { ObjectMember, ObjectSchemas } from './object-schemas';
import type { RelationshipSpec } from './relationship-specs';

import { z } from 'zod/v4';

import { isRecord, ownValue } from '../internal/object';
import { idSchema } from './id-schema';
import { objectSchemas } from './object-schemas';
import { withValidators } from './value-schema';

/** What a validator receives for a parsed linkage: its id, or `null`. */
export function linkageId(value: unknown): unknown {
  return isRecord(value) ? ownValue(value, 'id') : value;
}

/** Whether every member of a CHECK is a relationship. */
export function overRelationships(check: MultiColumnCheck): boolean {
  return check.members.every((member) => member.kind === 'relationship');
}

function linkageValue(spec: RelationshipSpec, validators: boolean): z.ZodType {
  const identifier = z.object({
    type: z.literal(spec.target().names.type),
    id: idSchema(spec.value, `${spec.references}.${spec.column}`),
  });
  const value = spec.nullable ? identifier.nullable() : identifier;
  return validators
    ? withValidators(value, spec.value.validators, linkageId)
    : value;
}

/** A relationship as a member of the linkage objects. */
function relationshipMember(spec: RelationshipSpec): ObjectMember {
  return {
    name: spec.name,
    access: spec.access,
    required: spec.required,
    value: (validators) => linkageValue(spec, validators),
  };
}

/** The read, create, and update schemas of the relationships; reading them reads every target. */
export function linkageSchemas(
  relationships: ReadonlyArray<RelationshipSpec>,
  checks: ReadonlyArray<MultiColumnCheck>,
): ObjectSchemas {
  return objectSchemas(
    relationships.map((relationship) => relationshipMember(relationship)),
    checks.filter((check) => overRelationships(check)),
    (member) => ({ path: [member.name], read: linkageId }),
  );
}
