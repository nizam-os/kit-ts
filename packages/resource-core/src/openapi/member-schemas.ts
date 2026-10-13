/**
 * The schema of each member of a resource object (SPEC 3.1, 6.2, 13.1): a
 * field's value as the document of one side carries it, a relationship's
 * relationship object, `readOnly` on a `read` field and `writeOnly` on a
 * `write` field, the declared description, and the declared example, which
 * the field's schema accepts (SPEC 8). A codec's value is its schema read
 * on the side of the document: its input in a request, its output in a
 * response (SPEC 7.1).
 * @ref https://spec.openapis.org/oas/v3.1.2.html#fixed-fields-20 (readOnly, writeOnly)
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-relationships
 * @packageDocumentation
 */
import type { JsonSchema } from '@nizam-os/ban-core';

import type { Access } from '../declare/types';
import type { FieldMeta } from '../meta/types';
import type { MemberSpec } from '../schema/field-spec';

import { schemaRef } from './component-names';
import { codecSchema, withNull, wireSchema } from './value-schema';

/** The document a member travels in: a response, or the request of a create or an update. */
export type DocumentSide = 'response' | 'create' | 'update';

/** The accesses each side carries (SPEC 3.1). */
const CARRIED: Readonly<Record<DocumentSide, ReadonlySet<Access>>> = {
  response: new Set(['read', 'readWrite', 'immutable']),
  create: new Set(['readWrite', 'immutable', 'write']),
  update: new Set(['readWrite', 'write']),
};

/** A link a server builds: a URI-reference, possibly root-relative (JSON:API "Links"). */
export const LINK_SCHEMA: JsonSchema = Object.freeze({
  type: 'string',
  format: 'uri-reference',
});

/** Whether a document of `side` carries a member of `access`. */
export function carries(side: DocumentSide, access: Access): boolean {
  return CARRIED[side].has(access);
}

/** The keywords that describe a member without constraining it. */
function annotations(meta: FieldMeta, side: DocumentSide): JsonSchema {
  return {
    ...(meta.description === null ? {} : { description: meta.description }),
    ...(meta.example === undefined ? {} : { examples: [meta.example] }),
    ...(side === 'response' && meta.access === 'read'
      ? { readOnly: true }
      : {}),
    ...(side !== 'response' && meta.access === 'write'
      ? { writeOnly: true }
      : {}),
  };
}

/** A field's value on `side`: its codec's schema, else its wire form's, with `null` where it may be null. */
export function fieldSchema(
  meta: FieldMeta,
  spec: MemberSpec,
  side: DocumentSide,
): JsonSchema {
  const { form } = spec.value;
  const value =
    form.kind === 'codec'
      ? codecSchema(form.codec.schema, side === 'response' ? 'output' : 'input')
      : wireSchema(meta);
  return {
    ...(meta.nullable ? withNull(value) : value),
    ...annotations(meta, side),
  };
}

/**
 * A relationship's linkage: the target's identifier, its local identifier
 * where `local` is set, and `null` where the foreign key may be null.
 */
export function linkageSchema(
  target: string,
  nullable: boolean,
  local: boolean,
): JsonSchema {
  const identifiers = [
    schemaRef(target, 'identifier'),
    ...(local ? [schemaRef(target, 'local')] : []),
    ...(nullable ? [{ type: 'null' }] : []),
  ];
  const [only] = identifiers;
  return identifiers.length === 1 && only !== undefined
    ? only
    : { anyOf: identifiers };
}

/**
 * A relationship object: its linkage in `data`, the target's identifier
 * or `null` where the foreign key may be null, or the target's local
 * identifier where `local` is set, and in a response the relationship's
 * links when the definition builds them.
 */
export function relationshipSchema(
  meta: FieldMeta,
  target: string,
  side: DocumentSide,
  links: boolean,
  local = false,
): JsonSchema {
  const data = linkageSchema(target, meta.nullable, local);
  const responseMembers =
    side === 'response'
      ? {
          ...(links
            ? {
                links: {
                  type: 'object',
                  properties: { self: LINK_SCHEMA, related: LINK_SCHEMA },
                },
              }
            : {}),
          meta: { type: 'object' },
        }
      : {};
  return {
    type: 'object',
    properties: { data, ...responseMembers },
    required: ['data'],
    ...annotations(meta, side),
  };
}
