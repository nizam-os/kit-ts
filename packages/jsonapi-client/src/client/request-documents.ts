/**
 * The documents a write sends (SPEC 15.4, 17.1): a resource object for
 * `create` and `update`, and linkage for the relationship calls. An id
 * becomes an identifier of the relationship's declared type; an identifier
 * object gives its `type` and `id` and nothing else, so a record passed as
 * one sends only what identifies it, and a local identifier, which an
 * operation may name, gives its `type` and `lid`. Members left `undefined`
 * are left out when the document is written as JSON, so an attribute a
 * create leaves out keeps the server's default.
 * @ref https://jsonapi.org/format/1.1/#crud-creating
 * @ref https://jsonapi.org/format/1.1/#crud-updating
 * @ref https://jsonapi.org/format/1.1/#crud-updating-relationships
 * @ref https://jsonapi.org/format/1.1/#document-resource-identifier-objects
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-identification ("a client MAY include a lid member")
 * @packageDocumentation
 */
import type {
  AnyResource,
  ClientRelationship,
  RelationshipDefinition,
  ResourceIdentifier,
} from '@nizam-os/jsonapi-core';

import type { Identifier } from '../document/types';
import type { LinkageValue, LocalIdentifier } from './write-types';

import { defineMember } from '../internal/object';

/** A relationship's value in a write, typed wide, local identifiers included. */
export type AnyLinkageInput = LinkageValue<ClientRelationship, true>;

/** A write's members, typed wide. */
export interface WriteInput {
  readonly id?: string | undefined;
  readonly attributes?: unknown;
  readonly relationships?:
    | Readonly<Record<string, AnyLinkageInput | undefined>>
    | undefined;
}

/** What identifies the resource object a write sends: a create's client `id` or `lid`, an update's `id`. */
export interface ResourceIdentity {
  readonly id?: string | undefined;
  readonly lid?: string | undefined;
}

/** A document a write sends. */
export interface RequestDocument {
  readonly data: unknown;
}

/** An identifier a write sends. */
type SentIdentifier = ResourceIdentifier | LocalIdentifier;

/** The linkage a write sends: `null`, one identifier, or a list of them. */
export type SentLinkage = SentIdentifier | null | ReadonlyArray<SentIdentifier>;

function identifierOf(
  type: string,
  value: string | Identifier | LocalIdentifier,
): SentIdentifier {
  if (typeof value === 'string') {
    return { type, id: value };
  }
  // A record passed as an identifier has an `id`, whatever its fields are named; a local identifier has none.
  return 'id' in value
    ? { type: value.type, id: value.id }
    : { type: value.type, lid: value.lid };
}

function isList(
  value: AnyLinkageInput,
): value is ReadonlyArray<string | Identifier | LocalIdentifier> {
  return Array.isArray(value);
}

/** The relationship `name` declares; throws `TypeError` naming it when there is none. */
export function relationshipOf(
  definition: AnyResource,
  call: string,
  name: string,
): RelationshipDefinition {
  const relationship = Object.hasOwn(definition.relationships, name)
    ? definition.relationships[name]
    : undefined;
  if (relationship === undefined) {
    throw new TypeError(
      `${definition.type} ${call}: ${definition.type} has no relationship "${name}"`,
    );
  }
  return relationship;
}

/** The linkage a write's value names: `null`, one identifier, or a list of them. */
export function linkageOf(
  relationship: RelationshipDefinition,
  value: AnyLinkageInput,
): SentLinkage {
  if (value === null) {
    return null;
  }
  return isList(value)
    ? value.map((item) => identifierOf(relationship.type, item))
    : identifierOf(relationship.type, value);
}

function relationshipsOf(
  definition: AnyResource,
  call: string,
  relationships: Readonly<Record<string, AnyLinkageInput | undefined>>,
): object {
  const members = {};
  for (const [name, value] of Object.entries(relationships)) {
    if (value !== undefined) {
      defineMember(members, name, {
        data: linkageOf(relationshipOf(definition, call, name), value),
      });
    }
  }
  return members;
}

/**
 * `{ data: { type, id?, lid?, attributes?, relationships? } }`: `id` is
 * the client's for a create, the path's for an update, and `lid` an
 * operation's create's.
 */
export function resourceDocument(
  definition: AnyResource,
  call: 'create' | 'update',
  input: WriteInput,
  identity: ResourceIdentity = {},
): RequestDocument {
  return {
    data: {
      type: definition.type,
      ...(identity.id === undefined ? {} : { id: identity.id }),
      ...(identity.lid === undefined ? {} : { lid: identity.lid }),
      ...(input.attributes === undefined
        ? {}
        : { attributes: input.attributes }),
      ...(input.relationships === undefined
        ? {}
        : {
            relationships: relationshipsOf(
              definition,
              call,
              input.relationships,
            ),
          }),
    },
  };
}
