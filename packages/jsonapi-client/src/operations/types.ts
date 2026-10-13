/**
 * The Atomic Operations of the client (SPEC 17): an operation is a value
 * built from a definition, typed by the data its result holds, and a
 * request's results are typed per operation, a tuple for a tuple.
 * `'~data'` is type-only, as a definition's `'~types'` is (SPEC 5.3).
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 * @ref https://jsonapi.org/ext/atomic/#result-objects
 * @packageDocumentation
 */
import type {
  AnyResource,
  JsonApiObject,
  Links,
  Meta,
} from '@nizam-os/jsonapi-core';

import type { RecordOf } from '../client/record-types';
import type {
  CreateMembers,
  LinkageValue,
  UpdateMembers,
} from '../client/write-types';
import type {
  RelationshipsOf,
  Simplify,
  ToManyName,
  UpdatableName,
} from '../internal/definition-types';

/** The extension's operation codes. */
export type OperationCode = 'add' | 'update' | 'remove';

/** What an operation targets by `ref`: a resource, or one of its relationships. */
export interface OperationRef {
  readonly type: string;
  readonly id: string;
  readonly relationship?: string | undefined;
}

/**
 * One operation of an Atomic Operations request, made by `operationsOf`:
 * the definition it writes, and the extension's `op`, `ref`, and `data`,
 * `undefined` where it has none.
 */
export interface Operation<TDefinition = AnyResource, TData = unknown> {
  readonly definition: TDefinition;
  readonly op: OperationCode;
  readonly ref: OperationRef | undefined;
  readonly data: unknown;
  /** Type-only, always absent: the data the operation's result holds. */
  readonly '~data'?: TData | undefined;
}

/** What a `create` operation takes: what the call takes, a `lid`, and relationships that may name local identifiers. */
export type CreateOperationInput<TDefinition> = Simplify<
  CreateMembers<TDefinition, true> & { readonly lid?: string | undefined }
>;

/** What an `update` operation takes: what the call takes, with relationships that may name local identifiers. */
export type UpdateOperationInput<TDefinition> = UpdateMembers<
  TDefinition,
  true
>;

/** A relationship's value in a relationship operation. */
type OperationLinkage<TDefinition, TName extends string> = LinkageValue<
  RelationshipsOf<TDefinition>[TName],
  true
>;

/**
 * The record of a definition as a result holds it (SPEC 15.6): every
 * field, each relationship its linkage, since a results document holds no
 * `included`; so no other definition is read.
 */
type ResultRecord<TDefinition> = RecordOf<never, TDefinition>;

/** The operations of one definition (SPEC 17.1): each builder takes what the call of its name takes. */
export interface OperationBuilders<TDefinition> {
  /** `add` of a resource object, linkable by its `lid`. */
  create(
    input: CreateOperationInput<TDefinition>,
  ): Operation<TDefinition, ResultRecord<TDefinition>>;
  /** `update` of the resource `id`, named by the resource object's `type` and `id`. */
  update(
    id: string,
    input: UpdateOperationInput<TDefinition>,
  ): Operation<TDefinition, ResultRecord<TDefinition>>;
  /** `remove` of the resource `id`. */
  remove(id: string): Operation<TDefinition, undefined>;
  /** `update` of an updatable relationship's linkage. */
  setRelationship<TName extends UpdatableName<TDefinition>>(
    id: string,
    name: TName,
    linkage: OperationLinkage<TDefinition, TName>,
  ): Operation<TDefinition, undefined>;
  /** `add` to an updatable to-many's linkage. */
  addToRelationship<TName extends ToManyName<TDefinition>>(
    id: string,
    name: TName,
    linkage: OperationLinkage<TDefinition, TName>,
  ): Operation<TDefinition, undefined>;
  /** `remove` from an updatable to-many's linkage. */
  removeFromRelationship<TName extends ToManyName<TDefinition>>(
    id: string,
    name: TName,
    linkage: OperationLinkage<TDefinition, TName>,
  ): Operation<TDefinition, undefined>;
}

/** One operation's result: its record, `undefined` when the result holds no data, and its `meta`. */
export interface OperationResult<TData = unknown> {
  readonly data: TData | undefined;
  readonly meta: Meta | undefined;
}

type DataOf<TOperation> =
  TOperation extends Operation<unknown, infer TData> ? TData : unknown;

/** What `sendOperations` resolves to: a result per operation, in order, and the document's members. */
export interface OperationsResult<
  TOperations extends ReadonlyArray<Operation> = ReadonlyArray<Operation>,
> {
  readonly status: number;
  readonly results: {
    readonly [K in keyof TOperations]: OperationResult<DataOf<TOperations[K]>>;
  };
  readonly links: Links | undefined;
  readonly meta: Meta | undefined;
  readonly jsonapi: JsonApiObject | undefined;
}

/** The operation an error object points at: its index in the request, and the pointer within it. */
export interface OperationPointer {
  readonly index: number;
  /** The rest of `source.pointer`, `''` for the operation itself. */
  readonly pointer: string;
}
