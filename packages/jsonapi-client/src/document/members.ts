/**
 * The members of a document a client keeps as sent (SPEC 15.6, 15.7),
 * each held to the shape JSON:API gives it so that its type is true:
 * links, the `jsonapi` object, relationship objects, and resource
 * identifiers. A link or a member of another shape is left out; a
 * resource identifier without a string `type` and `id` breaks the
 * protocol and throws `TypeError`.
 * @ref https://jsonapi.org/format/1.1/#document-links
 * @ref https://jsonapi.org/format/1.1/#document-links-link-object
 * @ref https://jsonapi.org/format/1.1/#document-jsonapi-object
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-relationships
 * @ref https://jsonapi.org/format/1.1/#document-resource-identifier-objects
 * @packageDocumentation
 */
import type {
  JsonApiObject,
  Link,
  LinkObject,
  Links,
  Relationship,
  ResourceIdentifier,
  ResourceLinkage,
} from '@nizam-os/jsonapi-core';

import type { JsonRecord } from '../internal/object';

import { defineMember, isRecord, ownMember } from '../internal/object';

const NOT_AN_IDENTIFIER =
  'deserialize: a resource identifier has no string type and id';

/** `{ [key]: value }` when `value` is a string, else nothing to spread. */
function stringMember<TKey extends string>(
  object: JsonRecord,
  key: TKey,
): { readonly [K in TKey]?: string } {
  const value = ownMember(object, key);
  const member: { [K in TKey]?: string } = {};
  if (typeof value === 'string') {
    member[key] = value;
  }
  return member;
}

function stringList(value: unknown): ReadonlyArray<string> | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function metaMember(object: JsonRecord): { readonly meta?: JsonRecord } {
  const meta = ownMember(object, 'meta');
  return isRecord(meta) ? { meta } : {};
}

function linkObjectOf(object: JsonRecord): LinkObject | undefined {
  const href = ownMember(object, 'href');
  if (typeof href !== 'string') {
    return undefined;
  }
  const describedby = linkOf(ownMember(object, 'describedby'));
  const hreflang = ownMember(object, 'hreflang');
  const languages =
    typeof hreflang === 'string' ? hreflang : stringList(hreflang);
  return {
    href,
    ...stringMember(object, 'rel'),
    ...stringMember(object, 'title'),
    ...stringMember(object, 'type'),
    ...(describedby === undefined || describedby === null
      ? {}
      : { describedby }),
    ...(languages === undefined ? {} : { hreflang: languages }),
    ...metaMember(object),
  };
}

/** A link: a string, `null`, or a link object with a string `href`; `undefined` otherwise. */
export function linkOf(value: unknown): Link | undefined {
  if (value === null || typeof value === 'string') {
    return value;
  }
  return isRecord(value) ? linkObjectOf(value) : undefined;
}

export function linksOf(object: JsonRecord): Links {
  const links = {};
  for (const [name, value] of Object.entries(object)) {
    const link = linkOf(value);
    if (link !== undefined) {
      defineMember(links, name, link);
    }
  }
  return links;
}

export function jsonApiObjectOf(object: JsonRecord): JsonApiObject {
  const ext = stringList(ownMember(object, 'ext'));
  const profile = stringList(ownMember(object, 'profile'));
  return {
    ...stringMember(object, 'version'),
    ...(ext === undefined ? {} : { ext }),
    ...(profile === undefined ? {} : { profile }),
    ...metaMember(object),
  };
}

/** A resource identifier object, its `meta` kept; `undefined` without a string `type` and `id`. */
export function identifierObjectOf(
  value: unknown,
): ResourceIdentifier | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const type = ownMember(value, 'type');
  const id = ownMember(value, 'id');
  return typeof type === 'string' && typeof id === 'string'
    ? { type, id, ...metaMember(value) }
    : undefined;
}

/** A resource identifier object, its `meta` kept; throws `TypeError` without a string `type` and `id`. */
export function resourceIdentifierOf(value: unknown): ResourceIdentifier {
  const identifier = identifierObjectOf(value);
  if (identifier === undefined) {
    throw new TypeError(NOT_AN_IDENTIFIER);
  }
  return identifier;
}

function resourceLinkageOf(data: unknown): ResourceLinkage {
  if (data === null) {
    return null;
  }
  return Array.isArray(data)
    ? data.map((item) => resourceIdentifierOf(item))
    : resourceIdentifierOf(data);
}

/** A relationship object: its `links`, its linkage as `data`, and its `meta`. */
export function relationshipObjectOf(object: JsonRecord): Relationship {
  const links = ownMember(object, 'links');
  return {
    ...(isRecord(links) ? { links: linksOf(links) } : {}),
    ...(Object.hasOwn(object, 'data')
      ? { data: resourceLinkageOf(object['data']) }
      : {}),
    ...metaMember(object),
  };
}
