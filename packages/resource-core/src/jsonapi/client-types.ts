/**
 * What a client of a declared resource reads and writes (SPEC 11.1,
 * jsonapi SPEC 5.3): the `'~types'` of its JSON:API definition, computed
 * from the declaration and the catalog as `defineResource` infers them
 * from a definition written by hand. The attributes are the read types as
 * JSON, each write the input of its validator, and every name public.
 * @ref https://github.com/nizam-os/kit/blob/main/docs/jsonapi/SPEC.md (section 5.3)
 * @packageDocumentation
 */
import type { JsonOf } from '@nizam-os/jsonapi-core';

import type { DeclareContext } from '../declare/registries';
import type { Declaration, DeclaredMembers, MemberOf } from '../declare/types';
import type { HasSearch } from '../names/keyset-names-check';
import type { FieldNameOf, RelationshipNameOf } from '../names/public-names';
import type { InputOf, TargetType, TypesOf } from '../schema/resource-types';

type Fields<TDecl extends Declaration> = TDecl['fields'];
type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

type Simplify<TValue> = { readonly [K in keyof TValue]: TValue[K] };

/** The operators a member declares, when it filters. */
type OperatorsOf<TMember> =
  MemberOf<TMember, 'filter'> extends ReadonlyArray<
    infer TOperator extends string
  >
    ? TOperator
    : never;

/** Whether a member filters, as `FilterNameOf` reads it. */
type Filters<TMember> =
  MemberOf<TMember, 'filter'> extends ReadonlyArray<unknown> ? true : false;

/**
 * By public name, the operators of each field and relationship that
 * filters, as the record jsonapi-core's `ResourceTypes` requires, which
 * TypeScript cannot prove of a mapped type over a generic declaration.
 */
type FilterOperators<TDecl extends Declaration> =
  DeclaredFilters<TDecl> extends infer TFilter extends Readonly<
    Record<string, string>
  >
    ? TFilter
    : never;

type DeclaredFilters<TDecl extends Declaration> = Simplify<
  {
    readonly [
      K in keyof Fields<TDecl> & string as Filters<
        Fields<TDecl>[K]
      > extends true
        ? FieldNameOf<K, Fields<TDecl>[K]>
        : never
    ]: OperatorsOf<Fields<TDecl>[K]>;
  } & {
    readonly [
      K in keyof Relationships<TDecl> & string as Filters<
        Relationships<TDecl>[K]
      > extends true
        ? RelationshipNameOf<K, Relationships<TDecl>[K]>
        : never
    ]: OperatorsOf<Relationships<TDecl>[K]>;
  }
>;

/** By public name, each relationship's target type: every declared relationship is to-one. */
type ClientRelationships<TDecl extends Declaration> = {
  readonly [
    K in keyof Relationships<TDecl> & string as RelationshipNameOf<
      K,
      Relationships<TDecl>[K]
    >
  ]: {
    readonly type: TargetType<Relationships<TDecl>[K]>;
    readonly cardinality: 'one';
  };
};

/** The public names of the relationships declared with `include: true`. */
type IncludeOf<TDecl extends Declaration> = {
  [K in keyof Relationships<TDecl> & string]: MemberOf<
    Relationships<TDecl>[K],
    'include'
  > extends true
    ? RelationshipNameOf<K, Relationships<TDecl>[K]>
    : never;
}[keyof Relationships<TDecl> & string];

/** `TInput` when the declaration serves `TOperation`; else `never`, since there is no call to type. */
type Served<
  TDecl extends Declaration,
  TOperation extends 'create' | 'update',
  TInput,
> = TOperation extends TDecl['operations'][number] ? TInput : never;

/** The read types as JSON, an object as jsonapi-core's `ResourceTypes` requires. */
type JsonAttributes<TRead> =
  JsonOf<TRead> extends infer TJson extends object ? TJson : never;

/** The client types of the resource `TDecl` declares over `TTable` (SPEC 11.1). */
export interface ClientTypesOf<
  TContext extends DeclareContext,
  TTable extends string,
  TDecl extends Declaration,
> {
  readonly attributes: JsonAttributes<TypesOf<TContext, TTable, TDecl>['read']>;
  readonly relationships: ClientRelationships<TDecl>;
  readonly filter: FilterOperators<TDecl>;
  readonly include: IncludeOf<TDecl>;
  readonly fields: true;
  readonly search: HasSearch<TDecl>;
  readonly page: true;
  readonly custom: never;
  readonly create: Served<
    TDecl,
    'create',
    InputOf<TypesOf<TContext, TTable, TDecl>['create']>
  >;
  readonly update: Served<
    TDecl,
    'update',
    InputOf<TypesOf<TContext, TTable, TDecl>['update']>
  >;
  readonly creatable: WriteMembers<TypesOf<TContext, TTable, TDecl>, 'create'>;
  readonly updatable: WriteMembers<TypesOf<TContext, TTable, TDecl>, 'update'>;
  readonly clientIds: MemberOf<TDecl, 'clientIds'> extends true ? true : false;
}

/** The public names of the attributes and relationships a write holds (SPEC 9.4). */
type WriteMembers<
  TTypes extends {
    readonly create: unknown;
    readonly update: unknown;
    readonly linkage: { readonly create: unknown; readonly update: unknown };
  },
  TOperation extends 'create' | 'update',
> = (keyof TTypes[TOperation] | keyof TTypes['linkage'][TOperation]) & string;
