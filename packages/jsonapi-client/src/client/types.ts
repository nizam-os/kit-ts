/**
 * The clients `createClients` returns (SPEC 15.4): a `ResourceClient` per
 * definition, its calls typed by the definition's client types (SPEC 5.3)
 * and its records by `RecordOf` over the definitions passed, which resolve
 * related types. Nothing here is checked at run time: the server stays the
 * authority and answers what the types would have caught.
 * @ref https://jsonapi.org/format/1.1/#crud
 * @packageDocumentation
 */
import type {
  AnyResource,
  ClientRelationship,
  JsonApiObject,
  Links,
  Meta,
} from '@nizam-os/jsonapi-core';

import type { AnyRecord, Identifier } from '../document/types';
import type {
  ByCardinality,
  KnownDefinition,
  RelationshipName,
  RelationshipsOf,
  ToManyName,
  UpdatableName,
} from '../internal/definition-types';
import type { GetQuery, ListQuery } from '../query/types';
import type { CallOptions } from '../transport/send';
import type { RecordOf } from './record-types';
import type { CreateInput, LinkageInput, UpdateInput } from './write-types';

/** What a read resolves to: the status, the data, and the document's `links`, `meta`, and `jsonapi`. */
export interface ReadResult<TData> {
  readonly status: number;
  readonly data: TData;
  readonly links: Links | undefined;
  readonly meta: Meta | undefined;
  readonly jsonapi: JsonApiObject | undefined;
}

/**
 * What a write resolves to. `data` is `undefined` when the response holds
 * none: a 202, a 204, or a 200 with `meta` alone.
 */
export interface WriteResult<TData> {
  readonly status: number;
  readonly data: TData | undefined;
  readonly links: Links | undefined;
  readonly meta: Meta | undefined;
  readonly jsonapi: JsonApiObject | undefined;
}

/** A resource identifier object as a relationship document holds it: `type`, `id`, and its `meta`. */
export interface IdentifierObject<
  TType extends string = string,
> extends Identifier<TType> {
  readonly meta?: Meta | undefined;
}

/** A relationship's linkage as a relationship document holds it. */
type LinkageOf<TRelationship extends ClientRelationship> = ByCardinality<
  TRelationship['cardinality'],
  IdentifierObject<TRelationship['type']> | null,
  ReadonlyArray<IdentifierObject<TRelationship['type']>>
>;

/** The related type's definition among those passed; `AnyResource` when none has it. */
type RelatedDefinition<TDefinitions, TDefinition, TName extends string> =
  KnownDefinition<
    TDefinitions[keyof TDefinitions] | TDefinition,
    RelationshipsOf<TDefinition>[TName]['type']
  > extends infer TKnown
    ? [TKnown] extends [never]
      ? AnyResource
      : TKnown
    : never;

/** What `related` resolves to: the related record or `null` for a to-one, the records for a to-many. */
type RelatedData<
  TDefinitions,
  TDefinition,
  TName extends string,
  TQuery,
> = ByCardinality<
  RelationshipsOf<TDefinition>[TName]['cardinality'],
  RecordOf<
    TDefinitions,
    RelatedDefinition<TDefinitions, TDefinition, TName>,
    TQuery
  > | null,
  ReadonlyArray<
    RecordOf<
      TDefinitions,
      RelatedDefinition<TDefinitions, TDefinition, TName>,
      TQuery
    >
  >
>;

/** A call's query left out: no members, so nothing is included and every field is there. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- reason: a query left out must have no members at all, so it names no include path and no fieldset; `undefined` does not satisfy the query constraint a type parameter's default must meet
type NoQuery = Readonly<Record<never, never>>;

/**
 * The calls of one resource (SPEC 15.4). A literal query passed to `list`,
 * `get`, or `related` is read as a constant, so its include paths and
 * fieldsets type the records exactly.
 */
export interface ResourceClient<TDefinitions, TDefinition> {
  /**
   * The definition the client was made from, as it was passed: a binding
   * that keys a cache by the request serializes with it (SPEC 15.4).
   */
  readonly definition: TDefinition;
  /** `GET <collection>?<query>`: a page of records. */
  list<const TQuery extends ListQuery<TDefinitions, TDefinition> = NoQuery>(
    query?: TQuery,
    options?: CallOptions,
  ): Promise<
    ReadResult<ReadonlyArray<RecordOf<TDefinitions, TDefinition, TQuery>>>
  >;
  /** `GET <resource>?<query>`, sending `include` and `fields`: one record. */
  get<const TQuery extends GetQuery<TDefinitions, TDefinition> = NoQuery>(
    id: string,
    query?: TQuery,
    options?: CallOptions,
  ): Promise<ReadResult<RecordOf<TDefinitions, TDefinition, TQuery>>>;
  /** `POST <collection>`: the record the server stored, `undefined` without one. */
  create(
    input: CreateInput<TDefinition>,
    options?: CallOptions,
  ): Promise<WriteResult<RecordOf<TDefinitions, TDefinition>>>;
  /** `PATCH <resource>`: the record as updated, `undefined` without one. */
  update(
    id: string,
    input: UpdateInput<TDefinition>,
    options?: CallOptions,
  ): Promise<WriteResult<RecordOf<TDefinitions, TDefinition>>>;
  /** `DELETE <resource>`. */
  remove(id: string, options?: CallOptions): Promise<WriteResult<undefined>>;
  /** `GET <relationship link>`: the linkage. */
  relationship<TName extends RelationshipName<TDefinition>>(
    id: string,
    name: TName,
    options?: CallOptions,
  ): Promise<ReadResult<LinkageOf<RelationshipsOf<TDefinition>[TName]>>>;
  /** `GET <related link>?<query>`, sending `include` and `fields`: the related record, `null`, or records. */
  related<
    TName extends RelationshipName<TDefinition>,
    const TQuery extends GetQuery<
      TDefinitions,
      RelatedDefinition<TDefinitions, TDefinition, TName>
    > = NoQuery,
  >(
    id: string,
    name: TName,
    query?: TQuery,
    options?: CallOptions,
  ): Promise<ReadResult<RelatedData<TDefinitions, TDefinition, TName, TQuery>>>;
  /** `PATCH <relationship link>`: replaces the linkage of an updatable relationship. */
  setRelationship<TName extends UpdatableName<TDefinition>>(
    id: string,
    name: TName,
    linkage: LinkageInput<RelationshipsOf<TDefinition>[TName]>,
    options?: CallOptions,
  ): Promise<WriteResult<LinkageOf<RelationshipsOf<TDefinition>[TName]>>>;
  /** `POST <relationship link>`: adds to an updatable to-many's linkage. */
  addToRelationship<TName extends ToManyName<TDefinition>>(
    id: string,
    name: TName,
    linkage: LinkageInput<RelationshipsOf<TDefinition>[TName]>,
    options?: CallOptions,
  ): Promise<WriteResult<LinkageOf<RelationshipsOf<TDefinition>[TName]>>>;
  /** `DELETE <relationship link>`: removes from an updatable to-many's linkage. */
  removeFromRelationship<TName extends ToManyName<TDefinition>>(
    id: string,
    name: TName,
    linkage: LinkageInput<RelationshipsOf<TDefinition>[TName]>,
    options?: CallOptions,
  ): Promise<WriteResult<LinkageOf<RelationshipsOf<TDefinition>[TName]>>>;
  /** `GET` of a page's `links.next`; `undefined` when it has none. */
  next<TRecord extends AnyRecord>(
    result: ReadResult<ReadonlyArray<TRecord>>,
    options?: CallOptions,
  ): Promise<ReadResult<ReadonlyArray<TRecord>> | undefined>;
  /** `GET` of a page's `links.prev`; `undefined` when it has none. */
  prev<TRecord extends AnyRecord>(
    result: ReadResult<ReadonlyArray<TRecord>>,
    options?: CallOptions,
  ): Promise<ReadResult<ReadonlyArray<TRecord>> | undefined>;
}

/** A client per definition, by the name it was passed under. */
export type Clients<TDefinitions> = {
  readonly [K in keyof TDefinitions]: ResourceClient<
    TDefinitions,
    TDefinitions[K]
  >;
};
