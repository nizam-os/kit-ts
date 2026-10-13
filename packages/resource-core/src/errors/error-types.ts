/**
 * The derived error codes of a declared resource in types (SPEC 9.1), the
 * twin of `deriveErrors`: each code a literal key, each entry its kind's
 * status and title and the union of the public members it points at. The
 * scope column makes no code and is no member an entry points at (SPEC
 * 3.2). Computed only where `errors` is read, so declaring a resource costs
 * nothing here.
 * @packageDocumentation
 */
import type { PublicCatalog, PublicTable } from '@nizam-os/catalog-core';

import type { TypedRecord } from '../catalog/resolve-type';
import type { ColumnName } from '../catalog/types';
import type { ScopeColumnOf } from '../declare/declaration-check';
import type { WrittenColumn } from '../declare/members';
import type { DeclareContext } from '../declare/registries';
import type { Declaration, DeclaredMembers, MemberOf } from '../declare/types';
import type { CodeOf } from '../names/code';
import type { CodedConstraint, CodingColumn } from '../names/coded-keys';
import type { FieldNameOf, RelationshipNameOf } from '../names/public-names';
import type { ConstraintKind, ErrorEntry } from './error-entry';

type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

/** A member column's public name. */
type PublicNameOf<
  TDecl extends Declaration,
  TColumn,
> = TColumn extends keyof TDecl['fields'] & string
  ? FieldNameOf<TColumn, TDecl['fields'][TColumn]>
  : TColumn extends keyof Relationships<TDecl> & string
    ? RelationshipNameOf<TColumn, Relationships<TDecl>[TColumn]>
    : never;

type TableDefOf<
  TContext extends DeclareContext,
  TTable extends string,
> = TContext['catalog']['tables'][TTable] extends infer TTableDef extends
  PublicTable
  ? TTableDef
  : never;

type ConstraintEntry<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
  K extends keyof TTableDef['constraints'],
> = TTableDef['constraints'][K] extends {
  readonly kind: infer TKind extends ConstraintKind;
  readonly columns: infer TColumns extends ReadonlyArray<string>;
}
  ? ErrorEntry<
      TKind,
      TKind extends 'primaryKey'
        ? 'id'
        : PublicNameOf<
            TDecl,
            TColumns[number] & CodingColumn<TDecl, TScopeColumn>
          >
    >
  : never;

type ConstraintErrors<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
> = {
  readonly [
    K in CodedConstraint<TTableDef, TDecl, TScopeColumn> as CodeOf<TDecl, K>
  ]: ConstraintEntry<TTableDef, TDecl, TScopeColumn, K>;
};

type NotNullErrors<TTableDef extends PublicTable, TDecl extends Declaration> = {
  readonly [
    C in WrittenColumn<TDecl> &
      ColumnName<TTableDef> as TTableDef['columns'][C]['nullable'] extends false
      ? CodeOf<TDecl, `${TTableDef['name']}_${C}_not_null`>
      : never
  ]: ErrorEntry<'notNull', PublicNameOf<TDecl, C>>;
};

/** The domains a type passes, through arrays; a cycle stops where it repeats. */
type DomainChain<
  TCatalog extends PublicCatalog,
  TRecord extends TypedRecord,
  TSeen extends string = never,
> = TRecord['typeKind'] extends 'domain'
  ? TRecord['type'] extends TSeen
    ? TSeen
    : TRecord['type'] extends keyof TCatalog['domains'] & string
      ? DomainChain<
          TCatalog,
          TCatalog['domains'][TRecord['type']],
          TSeen | TRecord['type']
        >
      : TSeen
  : TSeen;

/** Each member column of the table but the scope column, with the domains its type passes. */
type MemberDomains<
  TCatalog extends PublicCatalog,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
> = {
  readonly [
    C in CodingColumn<TDecl, TScopeColumn> & ColumnName<TTableDef>
  ]: DomainChain<TCatalog, TTableDef['columns'][C]>;
};

/** A domain CHECK some member passes. */
interface DomainCheck<TDomain extends string, TConstraint extends string> {
  readonly domain: TDomain;
  readonly constraint: TConstraint;
}

type DomainChecks<TCatalog extends PublicCatalog, TDomain extends string> = {
  [D in TDomain]: D extends keyof TCatalog['domains']
    ? {
        [
          N in keyof TCatalog['domains'][D]['constraints'] & string
        ]: DomainCheck<D, N>;
      }[keyof TCatalog['domains'][D]['constraints'] & string]
    : never;
}[TDomain];

/** The code the definer gives a domain CHECK, or its name upper-cased. */
type DomainCodeOf<
  TContext extends DeclareContext,
  TCheck extends DomainCheck<string, string>,
> =
  MemberOf<
    MemberOf<TContext['domains'], TCheck['domain']>,
    TCheck['constraint']
  > extends { readonly code: infer TCode extends string }
    ? TCode
    : Uppercase<TCheck['constraint']>;

type MembersOfDomain<
  TDomains,
  TDecl extends Declaration,
  TDomain extends string,
> = {
  [C in keyof TDomains]: TDomain extends TDomains[C]
    ? PublicNameOf<TDecl, C>
    : never;
}[keyof TDomains];

type DomainErrors<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
  TDomains = MemberDomains<TContext['catalog'], TTableDef, TDecl, TScopeColumn>,
> = {
  readonly [
    P in DomainChecks<
      TContext['catalog'],
      TDomains[keyof TDomains] & string
    > as DomainCodeOf<TContext, P>
  ]: ErrorEntry<'check', MembersOfDomain<TDomains, TDecl, P['domain']>>;
};

type Simplify<TValue> = { readonly [K in keyof TValue]: TValue[K] };

/** The derived errors of a resource declared over `TTable`, keyed by code. */
export type ResourceErrors<
  TContext extends DeclareContext,
  TTable extends string,
  TDecl extends Declaration,
> = Simplify<
  ConstraintErrors<
    TableDefOf<TContext, TTable>,
    TDecl,
    ScopeColumnOf<TContext, TDecl>
  > &
    NotNullErrors<TableDefOf<TContext, TTable>, TDecl> &
    DomainErrors<
      TContext,
      TableDefOf<TContext, TTable>,
      TDecl,
      ScopeColumnOf<TContext, TDecl>
    >
>;
