/**
 * A list's state as the model's functions read and write it (resource
 * SPEC 20.7): the `TypeError` of a state a JavaScript caller got wrong,
 * and the page a new state holds. A new state keeps every member a change
 * does not set and leaves out a `page` the change empties, so a route's
 * search never holds `page: {}`. Every change but paging drops the
 * cursors, since a cursor names a position under the sort and filter that
 * made it; paging follows a page's `next` and `prev` links (jsonapi SPEC
 * 15.8), and a page with no records ends the list in the direction it was
 * reached, since the profile lets `next` point at an empty page.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id-links
 * @packageDocumentation
 */
import type { PageInput, Query } from '@nizam-os/jsonapi-client';

import type { PageResult } from './list-types';

import { pageCursors } from '@nizam-os/jsonapi-client';

import { isRecord } from '../internal/object';

/** Whether `value` is a list of strings. */
export function isStringList(value: unknown): value is ReadonlyArray<string> {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => typeof entry === 'string')
  );
}

function isList(value: unknown): value is ReadonlyArray<unknown> {
  return Array.isArray(value);
}

/** Whether the members of `state` the model reads have the shapes a query's do. */
function hasQueryShapes(state: Readonly<Record<string, unknown>>): boolean {
  const { sort, filter, page } = state;
  return (
    (sort === undefined || isStringList(sort)) &&
    (filter === undefined || isRecord(filter)) &&
    (page === undefined || isRecord(page))
  );
}

/**
 * `state` as the query it is. Throws a `TypeError` naming `caller` for a
 * state that is not an object, or whose `sort`, `filter`, or `page` is of
 * a shape no query's is.
 */
export function readState(caller: string, state: unknown): Query {
  if (!isRecord(state) || !hasQueryShapes(state)) {
    throw new TypeError(`${caller}: state must be a list state`);
  }
  return state;
}

/** A page of `size` at `after` or `before`, holding only what is defined; `undefined` when nothing is. */
export function pageOf(
  size: number | undefined,
  after?: string,
  before?: string,
): PageInput | undefined {
  if (size === undefined && after === undefined && before === undefined) {
    return undefined;
  }
  return {
    ...(size === undefined ? {} : { size }),
    ...(after === undefined ? {} : { after }),
    ...(before === undefined ? {} : { before }),
  };
}

/** `state` with `page`, or without one when `page` is `undefined`. */
function withPage(state: Query, page: PageInput | undefined): Query {
  const { page: _page, ...rest } = state;
  return page === undefined ? rest : { ...rest, page };
}

/** `state` at its first page: without cursors, its page size kept. */
export function firstPage(state: Query): Query {
  return withPage(state, pageOf(state.page?.size));
}

/** `result` as a list result, or a `TypeError` naming `caller`. */
function readResult(caller: string, result: unknown): PageResult {
  if (isRecord(result)) {
    const { data, links } = result;
    if (isList(data)) {
      return { data, links };
    }
  }
  throw new TypeError(`${caller}: result must be what a list call returned`);
}

/**
 * The state at the page after `result`, from its `next` link's
 * `page[after]`; `undefined` when it has none, or when it holds no records
 * and was reached going forward, the first page among them.
 */
export function nextPage(
  caller: string,
  state: Query,
  result: unknown,
): Query | undefined {
  const page = readResult(caller, result);
  const { next } = pageCursors(page);
  const forward = state.page?.before === undefined;
  if (next === undefined || (forward && page.data.length === 0)) {
    return undefined;
  }
  return withPage(state, pageOf(state.page?.size, next));
}

/**
 * The state at the page before `result`, from its `prev` link's
 * `page[before]`; `undefined` when it has none, or when it holds no
 * records and was reached going backward.
 */
export function previousPage(
  caller: string,
  state: Query,
  result: unknown,
): Query | undefined {
  const page = readResult(caller, result);
  const { prev } = pageCursors(page);
  const backward =
    state.page?.before !== undefined && state.page.after === undefined;
  if (prev === undefined || (backward && page.data.length === 0)) {
    return undefined;
  }
  return withPage(state, pageOf(state.page?.size, undefined, prev));
}
