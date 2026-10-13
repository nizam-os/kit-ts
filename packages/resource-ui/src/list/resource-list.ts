/**
 * `resourceList(resource, messages)` (resource SPEC 20.7): the list model
 * of a declared resource, whose state is its JSON:API query (ADR 0015).
 * TanStack Table holds no data of its own: its sorting and column filters
 * are read from the state and written back to it, the request sorts and
 * filters, and paging happens outside the table, by cursor, since a
 * cursor API has no total and no page index. The model imports no
 * framework and nothing of TanStack; its functions take the updaters
 * Table hands them.
 * @ref https://tanstack.com/table/v9/docs/framework/react/guide/pagination
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 * @packageDocumentation
 */
import type { Query } from '@nizam-os/jsonapi-client';
import type { AnyResource } from '@nizam-os/jsonapi-core';
import type { Messages } from '@nizam-os/resource-core';

import type { ColumnFiltersUpdate } from './column-filters';
import type { ListModel, ListResource } from './list-types';
import type { SortingUpdate } from './sorting';

import { serializeQuery } from '@nizam-os/jsonapi-client';

import { descriptorsOf } from '../fields/fields-of';
import { columnFiltersOf, filteredState } from './column-filters';
import { lenientQuery } from './lenient-query';
import { firstPage, nextPage, previousPage, readState } from './list-state';
import { sortedState, sortingOf } from './sorting';

const CALLER = 'resourceList';

/**
 * Every member of a list query, unset. A state `query` returns names each
 * one, so a router that hands a route the URL's search with the validated
 * one spread over it, as TanStack Router does, keeps nothing the URL held
 * that the state does not: neither a member the definition refused nor an
 * `include` or `fields` the URL chose. A router leaves an `undefined`
 * member out of the URL it writes.
 * @ref https://tanstack.com/router/v1/docs/framework/react/guide/search-params#search-params-are-inherited-from-parent-routes
 */
const UNSET: Query = Object.freeze({
  include: undefined,
  fields: undefined,
  sort: undefined,
  filter: undefined,
  page: undefined,
  search: undefined,
  custom: undefined,
});

/** The name of a member function in its `TypeError`s. */
function caller(member: string): string {
  return `${CALLER}.${member}`;
}

/** `state` searched for `text`; an empty `text` removes `search`. */
function searchedState(
  definition: AnyResource,
  state: unknown,
  text: unknown,
): Query {
  const read = readState(caller('withSearch'), state);
  if (definition.query.search === undefined) {
    throw new TypeError(
      `${caller('withSearch')}: ${definition.type} has no search parameter`,
    );
  }
  if (typeof text !== 'string') {
    throw new TypeError(`${caller('withSearch')}: text must be a string`);
  }
  const { search: _search, ...rest } = firstPage(read);
  return text === '' ? rest : { ...rest, search: text };
}

/** `state` at its first page of `size`, a positive safe integer at most `max`. */
function sizedState(max: number, state: unknown, size: unknown): Query {
  const read = readState(caller('withPageSize'), state);
  if (
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > max
  ) {
    throw new TypeError(
      `${caller('withPageSize')}: size must be a positive safe integer at most ${String(max)}`,
    );
  }
  const { page: _page, ...rest } = read;
  return { ...rest, page: { size } };
}

/**
 * The list model of `resource`, its columns labeled by `messages`; frozen.
 * Throws `TypeError` for a resource no `declareResource` returned, for
 * messages no definer returned, and for messages that label no member of
 * the resource's type. Its functions throw `TypeError` for a state that
 * is not one, a sort on a member that does not sort, a filter on a member
 * without `filter` or with an operator it does not declare, a search on a
 * resource without one, and a page size outside the definition's.
 */
export function resourceList<TResource extends ListResource>(
  resource: TResource,
  messages: Messages,
): ListModel<TResource> {
  const columns = descriptorsOf(CALLER, resource, messages).filter(
    ({ meta }) => meta.access !== 'write',
  );
  const definition = resource.resource;
  const { page } = definition.query;
  if (page === undefined) {
    throw new TypeError(
      `${CALLER}: resource must be what a declareResource returned`,
    );
  }
  const defaults = resource.keyset.sort?.default ?? [];
  const model = {
    columns: Object.freeze(columns),
    page: Object.freeze({ default: page.default, max: page.max }),
    searchable: definition.query.search !== undefined,
    query: (search: unknown) => ({
      ...UNSET,
      ...lenientQuery(definition, search),
    }),
    params: (state: unknown) =>
      serializeQuery(definition, readState(caller('params'), state)),
    sorting: (state: unknown) =>
      sortingOf(readState(caller('sorting'), state), defaults),
    withSorting: (state: unknown, sorting: SortingUpdate) =>
      sortedState(
        caller('withSorting'),
        definition,
        defaults,
        readState(caller('withSorting'), state),
        sorting,
      ),
    columnFilters: (state: unknown) =>
      columnFiltersOf(readState(caller('columnFilters'), state)),
    withColumnFilters: (state: unknown, filters: ColumnFiltersUpdate) =>
      filteredState(
        caller('withColumnFilters'),
        definition,
        readState(caller('withColumnFilters'), state),
        filters,
      ),
    withSearch: (state: unknown, text: unknown) =>
      searchedState(definition, state, text),
    withPageSize: (state: unknown, size: unknown) =>
      sizedState(page.max, state, size),
    next: (state: unknown, result: unknown) =>
      nextPage(caller('next'), readState(caller('next'), state), result),
    previous: (state: unknown, result: unknown) =>
      previousPage(
        caller('previous'),
        readState(caller('previous'), state),
        result,
      ),
    first: (state: unknown) => firstPage(readState(caller('first'), state)),
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: each function reads its state as the wide query it is and returns one, which `ListState` types by the same definition; `withSearch` is `never` only where it throws
  return Object.freeze(model) as unknown as ListModel<TResource>;
}
