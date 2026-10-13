/**
 * The URLs the calls reach (SPEC 15.4): a definition's paths
 * (`resourcePaths`, SPEC 5.4) on the transport's origin. An id fills the
 * path's `{id}` percent-encoded, as the links convention encodes it. An
 * empty id, `.`, and `..` are refused: the URL parser drops a dot segment,
 * percent-encoded or not, and an empty segment names the collection, so
 * the request would reach another path with the transport's headers.
 * @ref https://url.spec.whatwg.org/#single-dot-path-segment
 * @ref https://www.rfc-editor.org/rfc/rfc3986#section-5.2.4 (remove_dot_segments)
 * @packageDocumentation
 */
import type { AnyResource, ResourcePaths } from '@nizam-os/jsonapi-core';

import type { TransportState } from '../transport/transport';

import { relationshipOf } from './request-documents';

/** What every call of one resource reads. */
export interface CallContext {
  readonly definition: AnyResource;
  readonly paths: ResourcePaths;
  readonly state: TransportState;
}

const ID_TEMPLATE = '{id}';

/** Ids no path segment can carry. */
const UNADDRESSABLE_IDS: ReadonlySet<string> = new Set(['', '.', '..']);

/** `path` with `id` in place of `{id}`; throws `TypeError` for an id no segment can carry. */
export function filled(
  context: CallContext,
  call: string,
  path: string,
  id: string,
): string {
  if (UNADDRESSABLE_IDS.has(id)) {
    throw new TypeError(
      `${context.definition.type} ${call}: an id must not be empty, "." or ".."`,
    );
  }
  return path.replace(ID_TEMPLATE, () => encodeURIComponent(id));
}

/** `path` and `query` on the transport's origin. */
export function urlOf(
  context: CallContext,
  path: string,
  query: URLSearchParams = new URLSearchParams(),
): string {
  const search = query.toString();
  return `${context.state.origin}${path}${search === '' ? '' : `?${search}`}`;
}

/** The path of a relationship's link; throws `TypeError` naming the relationship when there is none. */
export function relationshipPath(
  context: CallContext,
  call: string,
  name: string,
  link: 'self' | 'related',
): string {
  const { type } = context.definition;
  relationshipOf(context.definition, call, name);
  const path = context.paths.relationships.get(name)?.[link];
  if (path === undefined) {
    throw new TypeError(
      `${type} ${call}: ${type} has no ${link === 'self' ? 'relationship' : 'related'} link for "${name}"`,
    );
  }
  return path;
}
