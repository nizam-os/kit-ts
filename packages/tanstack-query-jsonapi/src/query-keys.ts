/**
 * The keys `resourceQueries` caches under (SPEC 16.2). A key is the request:
 * the definition's type, the call, and the query string `serializeQuery`
 * writes (SPEC 15.5), in its own order whatever order a query's members were
 * written in. Two queries that make one request share one entry, a bigint
 * filter value keys as its text, and every key is JSON, as TanStack Query
 * hashes it. Each key starts with the type, so invalidating `[type]` reaches
 * every list, page, and record of it, and `[type, 'list']` every list.
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/filters
 * @packageDocumentation
 */
import type { Query } from '@nizam-os/jsonapi-client';

import { serializeQuery } from '@nizam-os/jsonapi-client';

/** A definition as `serializeQuery` takes it. */
export type KeyedDefinition = Parameters<typeof serializeQuery>[0];

/** Every list, page, and record of a type. */
export type AllKey<TType extends string> = readonly [TType];

/** A list: the query string it sends. */
export type ListKey<TType extends string> = readonly [TType, 'list', string];

/** An infinite list: the query string of the page it starts at. */
export type PagesKey<TType extends string> = readonly [TType, 'pages', string];

/** A record: its id and the query string a `get` sends. */
export type GetKey<TType extends string> = readonly [
  TType,
  'get',
  string,
  string,
];

/** The query string `query` sends, `''` for none. */
export function queryText(
  definition: KeyedDefinition,
  query: Query | undefined,
): string {
  return serializeQuery(definition, query ?? {}).toString();
}

/** The query string a `get` of `query` sends: its `include` and `fields` alone (SPEC 15.4). */
export function recordText(
  definition: KeyedDefinition,
  query: Query | undefined,
): string {
  return queryText(definition, {
    include: query?.include,
    fields: query?.fields,
  });
}
