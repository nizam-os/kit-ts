/**
 * The type-level check of `filter` and `sort` (SPEC 11.3), the twin of
 * `checkFilters`: the declared operators, listed once each, against
 * keyset-core's `OperatorsOf` for the member's keyset type, `isNull`
 * against its effective nullability, and `sort` against an array or a
 * member without a keyset type. A member that declares neither costs one
 * comparison; its public name is checked with the names
 * (`names/keyset-names-check.ts`).
 *
 * `KeysetCheck` is keyed by the keyset type and the declared members,
 * which repeat across fields (`text`, `['eq']`, `true`), so TypeScript
 * computes it once per combination; nullability is read only for a filter
 * with `isNull`. On stern's 1,019 filtered and sorted fields the check
 * adds 15% instantiations (package README, performance notes).
 * @packageDocumentation
 */
import type { PublicCatalog, PublicTable } from '@nizam-os/catalog-core';
import type { FieldType, OperatorsOf } from '@nizam-os/keyset-core';

import type { KeysetTypeOf } from '../jsonapi/keyset-types';
import type { IsNullable } from '../schema/member-types';
import type { HasRepeat } from './lists';
import type { DeclareContext } from './registries';
import type { Requirement } from './requirement';

type UnavailableOperator<TKeyset extends FieldType, TOperator> = Exclude<
  TOperator,
  OperatorsOf<TKeyset> | 'isNull'
>;

type OperatorRequirement<TKeyset extends FieldType, TOperator> = [
  UnavailableOperator<TKeyset, TOperator>,
] extends [never]
  ? unknown
  : Requirement<`filter: operator "${UnavailableOperator<TKeyset, TOperator> & string}" is not available for ${TKeyset} fields`>;

/** What `filter` and `sort` require of a member with keyset type `TKeyset`, or without one for the reason `TKeyset` gives. */
type KeysetCheck<TKeyset, TFilter, TSort> = [TKeyset] extends [FieldType]
  ? (TFilter extends ReadonlyArray<infer TOperator>
      ? OperatorRequirement<TKeyset, TOperator>
      : unknown) &
      (TSort extends true
        ? TKeyset extends 'array'
          ? Requirement<'sort: an array field is not sortable'>
          : unknown
        : unknown)
  : (TFilter extends ReadonlyArray<unknown>
      ? Requirement<`filter: ${TKeyset & string} is not filterable`>
      : unknown) &
      (TSort extends true
        ? Requirement<`sort: ${TKeyset & string} is not sortable`>
        : unknown);

type HasIsNull<TFilter> =
  TFilter extends ReadonlyArray<infer TOperator>
    ? 'isNull' extends TOperator
      ? true
      : false
    : false;

type NullCheck<
  TCatalog extends PublicCatalog,
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
  TFilter,
> =
  HasIsNull<TFilter> extends true
    ? IsNullable<TCatalog, TTableDef, TColumn> extends true
      ? unknown
      : Requirement<'filter: operator "isNull" is not available for non-null fields'>
    : unknown;

/**
 * `filter` lists at least one operator, each once, as jsonapi-core requires
 * of a filter field; a list typed only as an array is left to the runtime.
 */
type FilterListCheck<TFilter> =
  TFilter extends ReadonlyArray<unknown>
    ? number extends TFilter['length']
      ? unknown
      : TFilter extends readonly []
        ? Requirement<'filter: list at least one operator'>
        : HasRepeat<TFilter> extends true
          ? Requirement<'filter: an operator is listed twice'>
          : unknown
    : unknown;

type FilterCheck<
  TCatalog extends PublicCatalog,
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
  TFilter,
  TSort,
  TCodec,
> = KeysetCheck<
  [TCodec] extends [string]
    ? 'a codec field'
    : KeysetTypeOf<TCatalog, TTableDef, TColumn>,
  TFilter,
  TSort
> &
  NullCheck<TCatalog, TTableDef, TColumn, TFilter>;

/**
 * What a field's or a relationship's `filter`, `sort`, and `codec` require,
 * each the member as declared: `unknown` when absent, which declares
 * neither filter nor sort, and a codec field has no keyset type.
 */
export type FilterRequirement<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
  TFilter,
  TSort,
  TCodec,
> = [TFilter] extends [ReadonlyArray<unknown>]
  ? FilterCheck<
      TContext['catalog'],
      TTableDef,
      TColumn,
      TFilter,
      TSort,
      TCodec
    > &
      FilterListCheck<TFilter>
  : [TSort] extends [true]
    ? FilterCheck<
        TContext['catalog'],
        TTableDef,
        TColumn,
        TFilter,
        TSort,
        TCodec
      >
    : unknown;
