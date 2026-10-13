/**
 * The items of an error raised by an operation (SPEC 9.5, 12.4): one per
 * public member, each pointing at it under the operation's resource object.
 * The base is an RFC 6901 pointer the caller passes, `/data` for a single
 * request and the operation's own `data` inside Atomic Operations, because
 * `@nizam-os/jsonapi-core`'s operation processor keeps an item's pointer
 * when it has one (ADR 0007). A field is under `attributes`, a relationship
 * under `relationships`, and the resource id is `id`.
 * @ref https://www.rfc-editor.org/rfc/rfc6901#section-3
 * @ref https://jsonapi.org/format/1.1/#error-objects
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/ban-core';

import type { ResourceNames } from '../names/types';

/** `~` followed by anything but `0` or `1` is not a pointer (RFC 6901 section 3). */
const BAD_ESCAPE = /~(?![01])/u;

/** The reference tokens of an RFC 6901 pointer, unescaped, or `undefined` when `pointer` is not one. */
export function pointerTokens(
  pointer: string,
): ReadonlyArray<string> | undefined {
  if (pointer === '') {
    return [];
  }
  if (!pointer.startsWith('/') || BAD_ESCAPE.test(pointer)) {
    return undefined;
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/** Where a public member sits in a resource object, or `undefined` for a name the resource does not have. */
export function memberTokens(
  names: ResourceNames,
  member: string,
): ReadonlyArray<string> | undefined {
  if (names.fields.has(member)) {
    return ['attributes', member];
  }
  if (names.relationships.has(member)) {
    return ['relationships', member];
  }
  return member === 'id' ? ['id'] : undefined;
}

/** One item per member, each with `detail`, or `undefined` when there is no member to point at. */
export function memberItems(
  base: ReadonlyArray<string>,
  paths: ReadonlyArray<ReadonlyArray<string>>,
  detail: string,
): ReadonlyArray<ErrorItem> | undefined {
  return paths.length === 0
    ? undefined
    : paths.map((path) => ({ detail, path: [...base, ...path] }));
}
