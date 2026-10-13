/**
 * The type-level check of `search` and `sort` (SPEC 3.7, 11.2), the twin
 * of `checkSearch` and `checkSort` in `check-options.ts`: the search column
 * is a `tsvector` of the table, its configuration matches the generated one
 * and keeps to keyset-core's `regconfig` syntax, and the default sort names
 * fields declared with `sort: true`, each once.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';
import type { SortField } from '@nizam-os/keyset-core';

import type { SearchColumn } from '../catalog/types';
import type {
  IsSearchConfig,
  SEARCH_CONFIG_SYNTAX,
} from '../jsonapi/keyset-names';
import type { HasRepeat } from './lists';
import type { KnownMembers, Requirement, RequireWhen } from './requirement';
import type { Declaration, MemberOf } from './types';

type Fields<TDecl extends Declaration> = TDecl['fields'];

export type SearchCheck<
  TTable extends string,
  TTableDef extends PublicTable,
  TSearch,
> = TSearch extends { readonly column: infer TColumn extends string }
  ? SearchColumnCheck<
      TTable,
      TTableDef,
      TSearch,
      TColumn,
      MemberOf<TSearch, 'config'>
    >
  : unknown;

/**
 * The configuration keyset-core receives keeps to its `regconfig` syntax
 * (SPEC 11.2): `TConfig` when declared, else the generated `TGenerated`.
 */
type SearchConfigCheck<TConfig, TGenerated> = [TConfig] extends [string]
  ? IsSearchConfig<TConfig> extends true
    ? unknown
    : Requirement<`search.config: "${TConfig}" is not a text search configuration @nizam-os/keyset-core accepts (${typeof SEARCH_CONFIG_SYNTAX})`>
  : [TGenerated] extends [string]
    ? IsSearchConfig<TGenerated> extends true
      ? unknown
      : Requirement<`search.column: the column is generated with config "${TGenerated}", which @nizam-os/keyset-core does not accept (${typeof SEARCH_CONFIG_SYNTAX})`>
    : unknown;

type SearchColumnCheck<
  TTable extends string,
  TTableDef extends PublicTable,
  TSearch,
  TColumn extends string,
  TConfig,
> = KnownMembers<TSearch, 'column' | 'config' | 'mode', 'search'> &
  (TColumn extends SearchColumn<TTableDef>
    ? TTableDef['columns'][TColumn]['generated'] extends {
        readonly searchConfig: infer TGenerated extends string;
      }
      ? RequireWhen<
          [TConfig] extends [TGenerated | undefined] ? false : true,
          `search.config: the column is generated with config "${TGenerated}"`
        > &
          SearchConfigCheck<TConfig, TGenerated>
      : RequireWhen<
          [TConfig] extends [string] ? false : true,
          `search.config: required, because ${TColumn} is not generated with a configuration`
        > &
          SearchConfigCheck<TConfig, undefined>
    : Requirement<`search.column: "${TColumn}" is not a tsvector column of ${TTable}`>);

/** Fields declared with `sort: true`, which the default sort may name. */
type SortableColumn<TDecl extends Declaration> = {
  [K in keyof Fields<TDecl>]: Fields<TDecl>[K] extends { readonly sort: true }
    ? K
    : never;
}[keyof Fields<TDecl>] &
  string;

type SortEntryField<TEntry> = TEntry extends `-${infer TField}`
  ? TField
  : TEntry extends string
    ? TEntry
    : TEntry extends SortField<infer TField>
      ? TField
      : never;

/** The field each entry of a literal default sort names, `-name` and `name` alike. */
type SortFieldsOf<TEntries extends ReadonlyArray<unknown>> = {
  readonly [I in keyof TEntries]: SortEntryField<TEntries[I]>;
};

/** A literal default sort names each field once, as keyset-core requires. */
type SortRepeatCheck<TEntries extends ReadonlyArray<unknown>> =
  number extends TEntries['length']
    ? unknown
    : HasRepeat<SortFieldsOf<TEntries>> extends true
      ? {
          readonly default: Requirement<'sort.default: a field is listed twice'>;
        }
      : unknown;

export type SortCheck<TDecl extends Declaration> = TDecl['sort'] extends {
  readonly default: infer TEntries extends ReadonlyArray<unknown>;
}
  ? string extends SortEntryField<TEntries[number]>
    ? unknown
    : [
          Exclude<SortEntryField<TEntries[number]>, SortableColumn<TDecl>>,
        ] extends [never]
      ? SortRepeatCheck<TEntries>
      : {
          readonly default: Requirement<`sort.default: "${Exclude<SortEntryField<TEntries[number]>, SortableColumn<TDecl>>}" is not declared with sort: true`>;
        }
  : unknown;
