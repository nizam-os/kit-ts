/**
 * The documents of the operations (SPEC 11.1, 13.1), as
 * `@nizam-os/jsonapi-core`'s builders write them and its parsers read them:
 * a resource document, with the includable targets' resource objects in
 * `included`; a list's page, with the Cursor Pagination profile's links
 * and meta; a relationship document of identifiers; and the request
 * documents of a create, an update, and a relationship's update. Top-level
 * `jsonapi`, `links`, and `meta` are open: a server adds its own.
 * @ref https://jsonapi.org/format/1.1/#document-top-level
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 * @ref https://github.com/nizam-os/kit/blob/main/docs/jsonapi/SPEC.md (sections 7 and 8)
 * @packageDocumentation
 */
import type { JsonSchema } from '@nizam-os/ban-core';

import type { DeclaredInternals } from '../declare/declared-resource';
import type { RequestSide } from './resource-schemas';

import { schemaRef } from './component-names';
import { LINK_SCHEMA } from './member-schemas';

const URIS: JsonSchema = {
  type: 'array',
  items: { type: 'string', format: 'uri' },
};

/** The members every document may carry beside its primary data. */
export const TOP_LEVEL: Readonly<Record<string, JsonSchema>> = {
  jsonapi: {
    type: 'object',
    properties: {
      version: { type: 'string' },
      ext: URIS,
      profile: URIS,
      meta: { type: 'object' },
    },
  },
  links: { type: 'object' },
  meta: { type: 'object' },
};

const NULLABLE_LINK: JsonSchema = { anyOf: [LINK_SCHEMA, { type: 'null' }] };

/** The profile's links: `prev` and `next` always, `null` at an end (jsonapi SPEC 8.2). */
const PAGE_LINKS: JsonSchema = {
  type: 'object',
  properties: {
    self: LINK_SCHEMA,
    first: LINK_SCHEMA,
    prev: NULLABLE_LINK,
    next: NULLABLE_LINK,
    last: NULLABLE_LINK,
  },
  required: ['prev', 'next'],
};

/** The profile's `meta.page` (jsonapi SPEC 8.3). */
const PAGE_META: JsonSchema = {
  type: 'object',
  properties: {
    page: {
      type: 'object',
      properties: {
        total: { type: 'integer', minimum: 0 },
        estimatedTotal: {
          type: 'object',
          properties: { bestGuess: { type: 'integer', minimum: 0 } },
          required: ['bestGuess'],
        },
        rangeTruncated: { const: true },
      },
    },
  },
};

/** `included`: the resource objects of the includable targets. */
function includedSchema(
  internals: DeclaredInternals,
): Readonly<Record<string, JsonSchema>> {
  const definition = internals.resource.resource;
  const types = [
    ...new Set(
      definition.query.include.map(
        (name) => definition.relationships[name]?.type,
      ),
    ),
  ]
    .filter((type) => type !== undefined)
    .map((type) => schemaRef(type, 'resource'));
  const [only, ...rest] = types;
  if (only === undefined) {
    return {};
  }
  return {
    included: {
      type: 'array',
      items: rest.length === 0 ? only : { anyOf: types },
    },
  };
}

function document(
  data: JsonSchema,
  members: Readonly<Record<string, JsonSchema>> = {},
): JsonSchema {
  return {
    type: 'object',
    properties: { ...TOP_LEVEL, data, ...members },
    required: ['data'],
  };
}

/** The document of a get, a create, and an update. */
export function resourceDocumentSchema(
  internals: DeclaredInternals,
): JsonSchema {
  return document(
    schemaRef(internals.resource.names.type, 'resource'),
    includedSchema(internals),
  );
}

/** A list's page: its items may carry `meta.page.cursor`, which the resource object's open `meta` holds. */
export function pageDocumentSchema(internals: DeclaredInternals): JsonSchema {
  const items = schemaRef(internals.resource.names.type, 'resource');
  const page = document(
    { type: 'array', items },
    {
      ...includedSchema(internals),
      links: PAGE_LINKS,
      meta: PAGE_META,
    },
  );
  return { ...page, required: ['data', 'links'] };
}

/** A to-one relationship's document: the target's identifier, or `null` where the foreign key may be null. */
export function relationshipDocumentSchema(
  target: string,
  nullable: boolean,
): JsonSchema {
  const identifier = schemaRef(target, 'identifier');
  return document(
    nullable ? { anyOf: [identifier, { type: 'null' }] } : identifier,
  );
}

/** The related resource's document: the target's resource object, or `null` where the foreign key may be null. */
export function relatedDocumentSchema(
  target: string,
  nullable: boolean,
): JsonSchema {
  const resource = schemaRef(target, 'resource');
  return document(
    nullable ? { anyOf: [resource, { type: 'null' }] } : resource,
  );
}

/** The request document of a create or an update. */
export function requestDocumentSchema(
  internals: DeclaredInternals,
  side: RequestSide,
): JsonSchema {
  return document(schemaRef(internals.resource.names.type, side));
}
