/**
 * Type helpers over definitions shared by the query, record, client, and
 * operation types: a definition's type, the definition the client knows
 * for a type, a definition's field names, and the relationships a write
 * may name (SPEC 5.3). Types only; never exported.
 * @packageDocumentation
 */
import type { TypesOf } from '@nizam-os/jsonapi-core';

/** An object type's members, written out. */
export type Simplify<TValue> = { readonly [K in keyof TValue]: TValue[K] };

/** A definition's resource type; `never` for no definition. */
export type TypeOf<TDefinition> = TDefinition extends {
  readonly type: infer TType extends string;
}
  ? TType
  : never;

/** The definition the client knows for a type; `never` when it knows none. */
export type KnownDefinition<TKnown, TType> = Extract<
  TKnown,
  { readonly type: TType }
>;

/** The fields of a type a client reads: its attributes and relationships. */
export type FieldNameOf<TDefinition> =
  | (keyof TypesOf<TDefinition>['attributes'] & string)
  | (keyof TypesOf<TDefinition>['relationships'] & string);

/** A definition's relationships, as its client types give them (SPEC 5.3). */
export type RelationshipsOf<TDefinition> =
  TypesOf<TDefinition>['relationships'];

/** The names of a definition's relationships. */
export type RelationshipName<TDefinition> = keyof RelationshipsOf<TDefinition> &
  string;

/**
 * The relationships a relationship write may name: the ones `updatable`
 * names, on a definition that serves updates. The server refuses any other
 * with 403, so a write naming one does not compile.
 * @ref https://jsonapi.org/format/1.1/#crud-updating-relationship-responses-403
 */
export type UpdatableName<TDefinition> = [
  TypesOf<TDefinition>['update'],
] extends [never]
  ? never
  : RelationshipName<TDefinition> & TypesOf<TDefinition>['updatable'];

/** The updatable to-many relationships: what adding to and removing from a relationship take. */
export type ToManyName<TDefinition> = {
  readonly [
    K in UpdatableName<TDefinition>
  ]: 'many' extends RelationshipsOf<TDefinition>[K]['cardinality'] ? K : never;
}[UpdatableName<TDefinition>];

/** `TOne` for a to-one, `TMany` for a to-many, either for a relationship typed wide. */
export type ByCardinality<TCardinality, TOne, TMany> =
  TCardinality extends 'one' ? TOne : TMany;
