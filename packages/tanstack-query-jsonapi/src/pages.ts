/**
 * The pages of an infinite list (SPEC 16.3) under the Cursor Pagination
 * profile (SPEC 15.8): the list starts at the query's own cursors, the next
 * page is after the `next` cursor of the last page and the previous before
 * the `prev` cursor of the first, each only while that page holds records,
 * since the profile lets a link point at an empty page. `page[size]` stays
 * the query's.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id-links
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/infinite-queries
 * @packageDocumentation
 */
import type { Query, ReadResult } from '@nizam-os/jsonapi-client';

import { pageCursors } from '@nizam-os/jsonapi-client';

/** Where a page starts: after a cursor, before one, or at the query's own cursors. */
export interface PageParam {
  readonly after?: string | undefined;
  readonly before?: string | undefined;
}

/** A page as a list resolves to it. */
type Page = ReadResult<ReadonlyArray<unknown>>;

/** The page the list starts at: the query's own cursors. */
export function firstPage(query: Query | undefined): PageParam {
  return { after: query?.page?.after, before: query?.page?.before };
}

/** The query of the page at `param`: the query's members and page size, at the param's cursors. */
export function pageQuery(query: Query | undefined, param: PageParam): Query {
  return {
    ...query,
    page: { size: query?.page?.size, after: param.after, before: param.before },
  };
}

/** The page after `last`, `undefined` when its `next` link has no cursor or it holds no records. */
export function nextPage(last: Page): PageParam | undefined {
  const { next } = pageCursors(last);
  return next === undefined || last.data.length === 0
    ? undefined
    : { after: next };
}

/** The page before `first`, `undefined` when its `prev` link has no cursor or it holds no records. */
export function previousPage(first: Page): PageParam | undefined {
  const { prev } = pageCursors(first);
  return prev === undefined || first.data.length === 0
    ? undefined
    : { before: prev };
}
