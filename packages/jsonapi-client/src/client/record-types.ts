/**
 * `RecordOf<TDefinitions, TDefinition, TQuery>` (SPEC 15.6, ADR 0019): the
 * record a response to `TQuery` holds, typed from the definitions as
 * `deserialize` builds it. The fields are the definition's client types
 * narrowed to `fields[type]`; a relationship on an include path is the
 * related definition's record, found among the definitions by type, and
 * any other one its linkage. A query whose `include` or fieldset is a
 * tuple, as a literal passed to a call is, says what the response holds; a
 * list type says only what it may hold, so such a relationship is its
 * record or its linkage, and such fields are optional.
 * @packageDocumentation
 */
import type { TypesOf } from '@nizam-os/jsonapi-core';

import type { AnyRecord, Identifier, RecordMembers } from '../document/types';
import type {
  FieldNameOf,
  KnownDefinition,
  Simplify,
  TypeOf,
} from '../internal/definition-types';

/** Whether a list type is a tuple, whose elements are all there. */
type IsTuple<TList> =
  TList extends ReadonlyArray<unknown>
    ? number extends TList['length']
      ? false
      : true
    : false;

type Listed<TList> =
  TList extends ReadonlyArray<infer TName extends string> ? TName : never;

type MemberOf<TQuery, TKey extends string> = TQuery extends {
  readonly [K in TKey]?: infer TValue;
}
  ? TValue
  : undefined;

/** The include paths every response holds, from a tuple. */
type SurePaths<TInclude> =
  IsTuple<TInclude> extends true ? Listed<TInclude> : never;

/** The include paths a response may hold, from a list type. */
type MaybePaths<TInclude> =
  IsTuple<TInclude> extends true ? never : Listed<TInclude>;

/** Whether a path in `TPaths` is `TName` or runs through it. */
type Reaches<TPaths extends string, TName extends string> = [
  Extract<TPaths, TName | `${TName}.${string}`>,
] extends [never]
  ? false
  : true;

/** The rest of each path that runs through `TName`. */
type Below<
  TPaths extends string,
  TName extends string,
> = TPaths extends `${TName}.${infer TRest}` ? TRest : never;

/** The fieldset a query gives a type: its list, `undefined` where it may give none. */
type FieldsetFor<TFields, TType extends string> = TFields extends object
  ? TType extends keyof TFields
    ? TFields[TType]
    : undefined
  : undefined;

/** The names a fieldset may select: every field where it may be absent. */
type Selected<TDefinition, TFieldset> = undefined extends TFieldset
  ? FieldNameOf<TDefinition>
  : Listed<TFieldset>;

type RelatedType<TRelationship> = TRelationship extends {
  readonly type: infer TType extends string;
}
  ? TType
  : string;

/** A relationship's value for `TValue` records or identifiers, by cardinality. */
type ByCardinality<TRelationship, TValue> = TRelationship extends {
  readonly cardinality: infer TCardinality;
}
  ? TCardinality extends 'one'
    ? TValue | null | undefined
    : ReadonlyArray<TValue> | undefined
  : never;

type Linkage<TRelationship> = ByCardinality<
  TRelationship,
  Identifier<RelatedType<TRelationship>>
>;

type Related<
  TKnown,
  TRelationship,
  TSure extends string,
  TMaybe extends string,
  TFields,
> = RecordAt<
  TKnown,
  KnownDefinition<TKnown, RelatedType<TRelationship>>,
  TSure,
  TMaybe,
  TFields
>;

type RelationshipValue<
  TKnown,
  TRelationship,
  TName extends string,
  TSure extends string,
  TMaybe extends string,
  TFields,
> =
  Reaches<TSure, TName> extends true
    ? ByCardinality<
        TRelationship,
        Related<
          TKnown,
          TRelationship,
          Below<TSure, TName>,
          Below<TMaybe, TName>,
          TFields
        >
      >
    : Reaches<TMaybe, TName> extends true
      ?
          | ByCardinality<
              TRelationship,
              Related<
                TKnown,
                TRelationship,
                never,
                Below<TSure | TMaybe, TName>,
                TFields
              >
            >
          | Linkage<TRelationship>
      : Linkage<TRelationship>;

type Fields<
  TKnown,
  TDefinition,
  TSure extends string,
  TMaybe extends string,
  TFields,
  TNames,
> = Pick<
  TypesOf<TDefinition>['attributes'],
  Extract<keyof TypesOf<TDefinition>['attributes'], TNames>
> & {
  readonly [
    R in Extract<keyof TypesOf<TDefinition>['relationships'], TNames> & string
  ]: RelationshipValue<
    TKnown,
    TypesOf<TDefinition>['relationships'][R],
    R,
    TSure,
    TMaybe,
    TFields
  >;
};

/** The fields; optional where a fieldset typed as a list may leave them out. */
type FieldsOf<
  TKnown,
  TDefinition,
  TSure extends string,
  TMaybe extends string,
  TFields,
  TFieldset,
> = [TFieldset] extends [undefined]
  ? Fields<
      TKnown,
      TDefinition,
      TSure,
      TMaybe,
      TFields,
      FieldNameOf<TDefinition>
    >
  : IsTuple<TFieldset> extends true
    ? Fields<TKnown, TDefinition, TSure, TMaybe, TFields, Listed<TFieldset>>
    : Partial<
        Fields<
          TKnown,
          TDefinition,
          TSure,
          TMaybe,
          TFields,
          Selected<TDefinition, TFieldset>
        >
      >;

type RecordAt<
  TKnown,
  TDefinition,
  TSure extends string,
  TMaybe extends string,
  TFields,
> = [TDefinition] extends [never]
  ? AnyRecord
  : string extends TypeOf<TDefinition>
    ? AnyRecord
    : Simplify<
        { readonly type: TypeOf<TDefinition>; readonly id: string } & FieldsOf<
          TKnown,
          TDefinition,
          TSure,
          TMaybe,
          TFields,
          FieldsetFor<TFields, TypeOf<TDefinition>>
        > &
          RecordMembers
      >;

/**
 * The record of `TDefinition` in a response to `TQuery`, related types
 * resolved among `TDefinitions`. Without a query, every field is there
 * and every relationship is its linkage.
 */
export type RecordOf<TDefinitions, TDefinition, TQuery = unknown> = RecordAt<
  TDefinitions[keyof TDefinitions] | TDefinition,
  TDefinition,
  SurePaths<MemberOf<TQuery, 'include'>>,
  MaybePaths<MemberOf<TQuery, 'include'>>,
  MemberOf<TQuery, 'fields'>
>;
