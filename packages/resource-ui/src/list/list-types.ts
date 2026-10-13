/**
 * The types of the list model (resource SPEC 20.7): a list's state, the
 * `sort`, `filter`, `page`, and `search` of the client's `ListQuery`
 * (jsonapi SPEC 15.5), and TanStack Table v9's sorting and column filters,
 * each typed by the definition's sort names, operators, and search.
 * Table's types are not imported: its `SortingState` and
 * `ColumnFiltersState` are mutable lists of `{ id, desc }` and
 * `{ id, value }`, which these lists are assignable to, and the setters
 * take what its `onSortingChange` and `onColumnFiltersChange` hand them,
 * `Updater<T>`: the next state or a function of the current one.
 * @ref https://tanstack.com/table/v9/docs/framework/react/guide/sorting
 * @ref https://tanstack.com/table/v9/docs/framework/react/guide/column-filtering
 * @packageDocumentation
 */
import type { FilterValues, ListQuery } from '@nizam-os/jsonapi-client';
import type { AnyResource, TypesOf } from '@nizam-os/jsonapi-core';

import type { FieldDescriptor } from '../fields/fields-of';
import type { DeclaredShape } from '../internal/declared';

/** An entry of a declaration's default sort by public name, as its keyset definition holds it (resource SPEC 11.2). */
export type DefaultSortEntry =
  | string
  | { readonly field: string; readonly direction: 'asc' | 'desc' };

/** What the list model reads of a declared resource besides its members: its definitions. */
export interface ListResource extends DeclaredShape {
  /** The JSON:API definition (resource SPEC 11.1): sort names, filters, page sizes, and search. */
  readonly resource: AnyResource;
  /** The keyset definition (SPEC 11.2), whose `sort.default` is the default sort by public name. */
  readonly keyset: {
    readonly sort?:
      | { readonly default?: ReadonlyArray<DefaultSortEntry> | undefined }
      | undefined;
  };
}

/**
 * A list's state: the `sort`, `filter`, `page`, and `search` of the
 * client's `ListQuery` over the resource's definition, held where the
 * application keeps it and sent as it is.
 */
export type ListState<TResource extends ListResource> = Pick<
  ListQuery<never, TResource['resource']>,
  'sort' | 'filter' | 'page' | 'search'
>;

type SortName<TResource extends ListResource> =
  TResource['resource']['query']['sort'][number];

type Operators<TResource extends ListResource> = TypesOf<
  TResource['resource']
>['filter'];

/** One entry of Table's sorting: a member, descending when `desc`. */
export interface ColumnSort<TName extends string = string> {
  readonly id: TName;
  readonly desc: boolean;
}

/** Table's sorting of a list, by the definition's sort names. */
export type ListSorting<TResource extends ListResource> = Array<
  ColumnSort<SortName<TResource>>
>;

/** One entry of Table's column filters: a member and its condition as an object of operators. */
type ColumnFilter<TResource extends ListResource> = {
  readonly [K in keyof Operators<TResource> & string]: {
    readonly id: K;
    readonly value: {
      readonly [O in Operators<TResource>[K]]?: FilterValues | undefined;
    };
  };
}[keyof Operators<TResource> & string];

/** Table's column filters of a list, by the definition's filters and their operators. */
export type ListColumnFilters<TResource extends ListResource> = Array<
  ColumnFilter<TResource>
>;

/** What a setter of Table's state hands: the next list, or a function of the current one. */
type Update<TCurrent, TNext> = TNext | ((current: TCurrent) => TNext);

/** A column filter as Table holds one: any member, any value. */
export interface AnyColumnFilter {
  readonly id: string;
  readonly value: unknown;
}

/** The members a read returns: every access but `write` (SPEC 3.1). */
type ColumnName<TResource extends ListResource> = {
  readonly [
    K in keyof TResource['fields'] & string
  ]: TResource['fields'][K]['access'] extends 'write' ? never : K;
}[keyof TResource['fields'] & string];

/** A list result as the client's `list` gives it: its records and its links. */
export interface PageResult {
  readonly data: ReadonlyArray<unknown>;
  readonly links?: unknown;
}

/** `withSearch`, or `never` on a definition without a search parameter. */
type SearchMember<TResource extends ListResource> = TypesOf<
  TResource['resource']
>['search'] extends false
  ? never
  : (state: ListState<TResource>, text: string) => ListState<TResource>;

/**
 * The list model of a declared resource: its columns and page sizes, and
 * functions from a state to Table's sorting and column filters, to the
 * API's parameters, and to the next state. Every function returns a new
 * state and keeps each member it does not set; every change but paging
 * drops the cursors.
 */
export interface ListModel<TResource extends ListResource> {
  /** The descriptors of the members a read returns, in declaration order: a table's columns. */
  readonly columns: ReadonlyArray<FieldDescriptor<ColumnName<TResource>>>;
  /** The definition's page sizes (SPEC 11.1). */
  readonly page: { readonly default: number; readonly max: number };
  /** Whether the definition has a search parameter (SPEC 3.7). */
  readonly searchable: boolean;
  /** The state a route's search holds, read back leniently: each parameter the definition refuses is dropped. */
  readonly query: (search: unknown) => ListState<TResource>;
  /** The API's own parameters: `serializeQuery(resource.resource, state)`. */
  readonly params: (state: ListState<TResource>) => URLSearchParams;
  /** Each `sort` name as `{ id, desc }`; without `sort`, the declaration's default sort. */
  readonly sorting: (state: ListState<TResource>) => ListSorting<TResource>;
  /** `sort` from the entries in order; an empty list removes it, so the default applies. */
  readonly withSorting: (
    state: ListState<TResource>,
    sorting: Update<ListSorting<TResource>, ReadonlyArray<ColumnSort>>,
  ) => ListState<TResource>;
  /** Each member of `filter` but `or` as `{ id, value }`, a bare value as `{ eq: value }`. */
  readonly columnFilters: (
    state: ListState<TResource>,
  ) => ListColumnFilters<TResource>;
  /** `filter` from the column filters, keeping `or`; a filter with no defined operator is removed. */
  readonly withColumnFilters: (
    state: ListState<TResource>,
    filters: Update<
      ListColumnFilters<TResource>,
      ReadonlyArray<AnyColumnFilter>
    >,
  ) => ListState<TResource>;
  /** `search`, removed when `text` is empty. */
  readonly withSearch: SearchMember<TResource>;
  /** `page.size`. */
  readonly withPageSize: (
    state: ListState<TResource>,
    size: number,
  ) => ListState<TResource>;
  /** The state at the page the result's `next` link names; `undefined` at the end. */
  readonly next: (
    state: ListState<TResource>,
    result: PageResult,
  ) => ListState<TResource> | undefined;
  /** The state at the page the result's `prev` link names; `undefined` at the start. */
  readonly previous: (
    state: ListState<TResource>,
    result: PageResult,
  ) => ListState<TResource> | undefined;
  /** The state without cursors: the first page. */
  readonly first: (state: ListState<TResource>) => ListState<TResource>;
}
