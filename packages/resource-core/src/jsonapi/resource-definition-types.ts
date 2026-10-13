/**
 * A declared resource's JSON:API definition in types (SPEC 11.1): the
 * `ResourceDefinition` whose type, attribute and relationship names, row,
 * sort and filter names, create and update attributes, and client types
 * are the declaration's, so `RowOf`, `CreateAttributesOf`, the names a
 * query takes, and what a client reads and writes follow from it.
 * @packageDocumentation
 */
import type { ResourceDefinition } from '@nizam-os/jsonapi-core';

import type { DeclareContext } from '../declare/registries';
import type { Declaration } from '../declare/types';
import type {
  FieldNames,
  RelationshipNames,
  TypeNameOf,
} from '../names/public-names';
import type { TableDefOf, TypesOf } from '../schema/resource-types';
import type { ClientTypesOf } from './client-types';
import type { FilterNameOf, SortNameOf } from './query-name-types';

type Simplify<TValue> = { readonly [K in keyof TValue]: TValue[K] };

/** Linkage as target ids: a nullable relationship takes `null`. */
export type LinkIds<TLinkage> = {
  readonly [K in keyof TLinkage]: null extends TLinkage[K]
    ? string | null
    : string;
};

/** A resource's public row: `id`, each readable field, and each relationship's target id (`PublicRow`). */
export type PublicRowType<
  TContext extends DeclareContext,
  TTable extends string,
  TDecl extends Declaration,
> = Simplify<
  { readonly id: string } & TypesOf<TContext, TTable, TDecl>['read'] &
    LinkIds<TypesOf<TContext, TTable, TDecl>['linkage']['read']>
>;

/** The attributes an operation's validator gives, or `unknown` when the declaration does not serve it. */
type Validated<
  TDecl extends Declaration,
  TOperation extends 'create' | 'update',
  TAttributes,
> = TOperation extends TDecl['operations'][number] ? TAttributes : unknown;

/** The JSON:API definition of the resource `TDecl` declares over `TTable`. */
export type ResourceOf<
  TContext extends DeclareContext,
  TTable extends string,
  TDecl extends Declaration,
> = ResourceDefinition<
  TypeNameOf<TableDefOf<TContext, TTable>, TDecl>,
  keyof FieldNames<TDecl> & string,
  keyof RelationshipNames<TDecl> & string,
  PublicRowType<TContext, TTable, TDecl>,
  SortNameOf<TDecl>,
  FilterNameOf<TDecl>,
  Validated<TDecl, 'create', TypesOf<TContext, TTable, TDecl>['create']>,
  Validated<TDecl, 'update', TypesOf<TContext, TTable, TDecl>['update']>,
  ClientTypesOf<TContext, TTable, TDecl>
>;
