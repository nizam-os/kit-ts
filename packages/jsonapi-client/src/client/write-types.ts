/**
 * What the writes take (SPEC 15.4, 17.1): a create's and an update's
 * members and a relationship's value, typed by the definition's client
 * types (SPEC 5.3). An Atomic Operations request may also link a resource
 * that an earlier operation of the request creates, by its local
 * identifier, so each type takes whether local identifiers are allowed.
 * @ref https://jsonapi.org/format/1.1/#crud-creating
 * @ref https://jsonapi.org/format/1.1/#crud-updating
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 * @packageDocumentation
 */
import type { ClientRelationship, TypesOf } from '@nizam-os/jsonapi-core';

import type { Identifier } from '../document/types';
import type {
  ByCardinality,
  RelationshipName,
  RelationshipsOf,
  Simplify,
} from '../internal/definition-types';

/**
 * A resource that an earlier operation of the same Atomic Operations
 * request creates, named by the `lid` its create gave (SPEC 17.1).
 */
export interface LocalIdentifier<TType extends string = string> {
  readonly type: TType;
  readonly lid: string;
}

/** What a relationship value names: an id, an identifier, and, where `TLocal` is `true`, a local identifier. */
type TargetInput<TType extends string, TLocal extends boolean> =
  | string
  | Identifier<TType>
  | (TLocal extends true ? LocalIdentifier<TType> : never);

/**
 * A relationship's value in a write, whose targets may be local
 * identifiers where `TLocal` is `true`, as in an operation (SPEC 17.1).
 */
export type LinkageValue<
  TRelationship extends ClientRelationship,
  TLocal extends boolean,
> = ByCardinality<
  TRelationship['cardinality'],
  TargetInput<TRelationship['type'], TLocal> | null,
  ReadonlyArray<TargetInput<TRelationship['type'], TLocal>>
>;

/**
 * A relationship's value in a write: an id, which becomes an identifier of
 * the relationship's type, or an identifier object; `null` empties a
 * to-one, and a to-many takes a list.
 */
export type LinkageInput<
  TRelationship extends ClientRelationship = ClientRelationship,
> = LinkageValue<TRelationship, false>;

/**
 * `attributes`, required when the write's input has a required member;
 * `never` for an operation the definition does not serve, so no input
 * compiles.
 */
type AttributesMember<TAttributes> = [TAttributes] extends [never]
  ? { readonly attributes: never }
  : Partial<TAttributes> extends TAttributes
    ? { readonly attributes?: TAttributes | undefined }
    : { readonly attributes: TAttributes };

/**
 * The relationships a write may carry, by the names its writable list
 * holds; `never` when it holds none, since an object type without members
 * would accept any relationship.
 */
type WritableRelationships<
  TDefinition,
  TWritable extends string,
  TLocal extends boolean,
> = [RelationshipName<TDefinition> & TWritable] extends [never]
  ? never
  : {
      readonly [K in RelationshipName<TDefinition> & TWritable]?:
        | LinkageValue<RelationshipsOf<TDefinition>[K], TLocal>
        | undefined;
    };

/**
 * A create's members: the create validator's input as `attributes`, the
 * relationships `creatable` names, and `id` where the definition takes
 * client ids.
 */
export type CreateMembers<TDefinition, TLocal extends boolean> = Simplify<
  AttributesMember<TypesOf<TDefinition>['create']> & {
    readonly id?:
      | (TypesOf<TDefinition>['clientIds'] extends false ? never : string)
      | undefined;
    readonly relationships?:
      | WritableRelationships<
          TDefinition,
          TypesOf<TDefinition>['creatable'],
          TLocal
        >
      | undefined;
  }
>;

/** An update's members: the update validator's input as `attributes`, and the relationships `updatable` names. */
export type UpdateMembers<TDefinition, TLocal extends boolean> = Simplify<
  AttributesMember<TypesOf<TDefinition>['update']> & {
    readonly relationships?:
      | WritableRelationships<
          TDefinition,
          TypesOf<TDefinition>['updatable'],
          TLocal
        >
      | undefined;
  }
>;

/** What `create` sends (SPEC 15.4). */
export type CreateInput<TDefinition> = CreateMembers<TDefinition, false>;

/** What `update` sends (SPEC 15.4). */
export type UpdateInput<TDefinition> = UpdateMembers<TDefinition, false>;
