/**
 * `sort` and TanStack Table's sorting (resource SPEC 20.7): each sort name
 * as `{ id, desc }`, `desc` for a `-` name, and back, entries in order. A
 * state without `sort` shows the declaration's default sort (SPEC 3.7),
 * the order the server applies, so a table's headers show the order its
 * rows are in; an empty sorting removes `sort`, and the default applies
 * again. A sort on a member that does not sort, or on one member twice,
 * is the application's mistake, since a table's columns come from the
 * model's, and throws before the server would refuse it.
 * @ref https://tanstack.com/table/v9/docs/framework/react/guide/sorting
 * @ref https://jsonapi.org/format/1.1/#fetching-sorting
 * @packageDocumentation
 */
import type { Query } from '@nizam-os/jsonapi-client';
import type { AnyResource } from '@nizam-os/jsonapi-core';

import type { ColumnSort, DefaultSortEntry } from './list-types';

import { isRecord } from '../internal/object';
import { firstPage } from './list-state';

/** What Table's `onSortingChange` hands: the next sorting, or a function of the current one. */
export type SortingUpdate =
  | ReadonlyArray<ColumnSort>
  | ((current: Array<ColumnSort>) => unknown);

/** The prefix of a descending sort name (jsonapi SPEC 6.6). */
const DESCENDING = '-';

function entryOf(name: string): ColumnSort {
  return name.startsWith(DESCENDING)
    ? { id: name.slice(DESCENDING.length), desc: true }
    : { id: name, desc: false };
}

function defaultEntry(entry: DefaultSortEntry): ColumnSort {
  return typeof entry === 'string'
    ? entryOf(entry)
    : { id: entry.field, desc: entry.direction === 'desc' };
}

/** Table's sorting of `state`: its `sort`, or else `defaults`, the declaration's default sort. */
export function sortingOf(
  state: Query,
  defaults: ReadonlyArray<DefaultSortEntry>,
): Array<ColumnSort> {
  return state.sort === undefined || state.sort.length === 0
    ? defaults.map((entry) => defaultEntry(entry))
    : state.sort.map((name) => entryOf(name));
}

function isColumnSort(entry: unknown): entry is ColumnSort {
  if (!isRecord(entry)) {
    return false;
  }
  const { id, desc } = entry;
  return typeof id === 'string' && typeof desc === 'boolean';
}

/** The sort names of `sorting`; a `TypeError` naming `caller` for a list of another shape, a member that does not sort, and a member named twice. */
function sortOf(
  caller: string,
  definition: AnyResource,
  sorting: unknown,
): Array<string> {
  if (
    !Array.isArray(sorting) ||
    !sorting.every((entry) => isColumnSort(entry))
  ) {
    throw new TypeError(`${caller}: sorting must be a list of { id, desc }`);
  }
  const sortable: ReadonlyArray<string> = definition.query.sort;
  const seen = new Set<string>();
  return sorting.map(({ id, desc }) => {
    if (!sortable.includes(id)) {
      throw new TypeError(
        `${caller}: a sort of ${definition.type} names a member that does not sort`,
      );
    }
    if (seen.has(id)) {
      throw new TypeError(
        `${caller}: a sort of ${definition.type} names one member twice`,
      );
    }
    seen.add(id);
    return desc ? `${DESCENDING}${id}` : id;
  });
}

/** `state` sorted by `update`, at its first page; an empty sorting removes `sort`. */
export function sortedState(
  caller: string,
  definition: AnyResource,
  defaults: ReadonlyArray<DefaultSortEntry>,
  state: Query,
  update: SortingUpdate,
): Query {
  const sorting =
    typeof update === 'function' ? update(sortingOf(state, defaults)) : update;
  const sort = sortOf(caller, definition, sorting);
  const { sort: _sort, ...rest } = firstPage(state);
  return sort.length === 0 ? rest : { ...rest, sort };
}
