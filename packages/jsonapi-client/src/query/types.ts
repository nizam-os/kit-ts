/**
 * The queries a client sends (SPEC 15.5), typed by a definition's client
 * types (SPEC 5.3): the include paths, sort names, filter operators,
 * search, page, and custom names it declares, and the fields of each type
 * the client knows. `Query` is the wide form `serializeQuery` takes.
 * @ref https://jsonapi.org/format/1.1/#fetching
 * @packageDocumentation
 */
import type { TypesOf } from '@nizam-os/jsonapi-core';

import type {
  FieldNameOf,
  KnownDefinition,
  TypeOf,
} from '../internal/definition-types';

/** A filter value: a string as it is, a number, bigint, or boolean as `String` writes it. */
export type FilterValue = string | number | bigint | boolean;

/** One value, or a list sent as the parameter repeated. */
export type FilterValues = FilterValue | ReadonlyArray<FilterValue>;

/** A field's condition: a bare value when it declares `eq`, else values by operator. */
export type Condition<TOperator extends string> =
  | ('eq' extends TOperator ? FilterValues : never)
  | { readonly [O in TOperator]?: FilterValues | undefined };

/** By filterable field, its condition. */
export type Conditions<TFilter extends Readonly<Record<string, string>>> = {
  readonly [K in keyof TFilter]?: Condition<TFilter[K]> | undefined;
};

/** Conditions that all hold, and `or`: groups of which each holds when any of its conditions does. */
export type TypedFilterInput<TFilter extends Readonly<Record<string, string>>> =
  Conditions<TFilter> & {
    readonly or?: ReadonlyArray<Conditions<TFilter>> | undefined;
  };

/** The filter of a definition typed wide: any field, any operator. */
export interface WideFilterInput {
  readonly [field: string]:
    | Condition<string>
    | ReadonlyArray<Conditions<Readonly<Record<string, string>>>>
    | undefined;
}

/**
 * The `filter` member: by field, a bare value (`eq`) or values by operator,
 * and `or` groups (SPEC 6.8). Typed by the definition's operators; wide
 * for a definition typed wide.
 */
export type FilterInput<
  TFilter extends Readonly<Record<string, string>> = Readonly<
    Record<string, string>
  >,
> = string extends keyof TFilter ? WideFilterInput : TypedFilterInput<TFilter>;

/** The Cursor Pagination profile's page parameters (SPEC 6.7). */
export interface PageInput {
  /** A positive safe integer. */
  readonly size?: number | undefined;
  readonly after?: string | undefined;
  readonly before?: string | undefined;
}

/** A custom parameter's value, or values sent as the parameter repeated. */
export type CustomValues = string | ReadonlyArray<string>;

/** Every member a query may hold, typed wide: what `serializeQuery` takes. */
export interface Query {
  readonly include?: ReadonlyArray<string> | undefined;
  readonly fields?:
    | Readonly<Record<string, ReadonlyArray<string> | undefined>>
    | undefined;
  readonly sort?: ReadonlyArray<string> | undefined;
  readonly page?: PageInput | undefined;
  readonly filter?: FilterInput | undefined;
  readonly search?: string | undefined;
  readonly custom?:
    | Readonly<Record<string, CustomValues | undefined>>
    | undefined;
}

/** The sort names a definition declares. */
type SortNameOf<TDefinition> = TDefinition extends {
  readonly query: { readonly sort: ReadonlyArray<infer TSort extends string> };
}
  ? TSort
  : never;

/** The type a relationship of `TDefinition` holds; `never` for no definition. */
type RelatedType<TDefinition, TName extends string> = [TDefinition] extends [
  never,
]
  ? never
  : TypesOf<TDefinition>['relationships'] extends infer TRelationships
    ? TName extends keyof TRelationships
      ? TRelationships[TName] extends {
          readonly type: infer TType extends string;
        }
        ? TType
        : never
      : never
    : never;

/** The types the segments of an include path reach from `TDefinition`. */
type PathTypes<
  TKnown,
  TDefinition,
  TPath extends string,
> = TPath extends `${infer THead}.${infer TRest}`
  ?
      | RelatedType<TDefinition, THead>
      | PathTypes<
          TKnown,
          KnownDefinition<TKnown, RelatedType<TDefinition, THead>>,
          TRest
        >
  : RelatedType<TDefinition, TPath>;

/** A fieldset's names: the fields of the type's definition, any name when the client knows none. */
type FieldsetOf<TKnown, TType> = [KnownDefinition<TKnown, TType>] extends [
  never,
]
  ? string
  : FieldNameOf<KnownDefinition<TKnown, TType>>;

type Fieldsets<TKnown, TDefinition> = {
  readonly [
    K in
      | TypeOf<TDefinition>
      | PathTypes<TKnown, TDefinition, TypesOf<TDefinition>['include']>
  ]?: ReadonlyArray<FieldsetOf<TKnown, K>> | undefined;
};

/**
 * `fields[type]` for the types a response can hold (SPEC 6.5): the
 * definition's own and each type its declared include paths reach, the
 * only ones `parseQuery` accepts. A type's names are its definition's
 * fields when the client knows it, any name otherwise.
 * @ref https://jsonapi.org/format/1.1/#fetching-sparse-fieldsets
 */
export type FieldsInput<TDefinitions, TDefinition> = Fieldsets<
  TDefinitions[keyof TDefinitions] | TDefinition,
  TDefinition
>;

/** `fields` where the definition accepts it; `never` where its query sets `fields: false`. */
type FieldsMember<TDefinitions, TDefinition> =
  TypesOf<TDefinition>['fields'] extends false
    ? never
    : FieldsInput<TDefinitions, TDefinition>;

/** By declared custom name, and by the name with members, its values. */
type CustomInput<TCustom extends string> = [TCustom] extends [never]
  ? never
  : {
      readonly [K in TCustom | `${TCustom}[${string}]`]?:
        | CustomValues
        | undefined;
    };

/** What a `get` or a `related` call sends: the include paths and sparse fieldsets. */
export interface GetQuery<TDefinitions, TDefinition> {
  readonly include?: ReadonlyArray<TypesOf<TDefinition>['include']> | undefined;
  readonly fields?: FieldsMember<TDefinitions, TDefinition> | undefined;
}

/**
 * What a `list` call sends: a `get`'s members, the declared sorts (`-`
 * for descending), the filter, and `page` only on a definition that
 * paginates, `search` only on one with a search parameter.
 */
export interface ListQuery<TDefinitions, TDefinition> extends GetQuery<
  TDefinitions,
  TDefinition
> {
  readonly sort?:
    | ReadonlyArray<SortNameOf<TDefinition> | `-${SortNameOf<TDefinition>}`>
    | undefined;
  readonly page?:
    | (TypesOf<TDefinition>['page'] extends false ? never : PageInput)
    | undefined;
  readonly filter?: FilterInput<TypesOf<TDefinition>['filter']> | undefined;
  readonly search?:
    | (TypesOf<TDefinition>['search'] extends false ? never : string)
    | undefined;
  readonly custom?: CustomInput<TypesOf<TDefinition>['custom']> | undefined;
}
