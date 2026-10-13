/**
 * The runtime contract (SPEC 12.10, ADR 0013): what a host or a worker
 * calls to run the declared operations, whichever runtime runs them,
 * typed here so a host types a runtime without a query builder or a
 * driver. One resource's operations as one actor runs them are typed by
 * its declaration: a resource TypeScript knows has exactly the operations
 * it declares, and `include` when a relationship is includable; its rows
 * are its public rows and its list request names its own keyset fields. A
 * resource typed wide may have any of them.
 * @packageDocumentation
 */
import type {
  FieldsInit,
  KeysetRequestOf,
  NoRelations,
  Page,
} from '@nizam-os/keyset-core';

import type {
  AnyDeclaredResource,
  DeclaredResource,
} from '../declare/declared-resource';
import type { ResourceBehavior } from './behavior-types';
import type { DomainShape } from './domain-types';
import type { IncludableOf, OperationOf, PublicRowOf } from './resource-types';
import type { PublicRow, StorageListRequest } from './storage';

/**
 * A create's or an update's input, as `@nizam-os/jsonapi-core` parses a
 * resource object: each relationship as its linkage, `{ type, id }` or
 * `null`. A missing member is `{}`. The write schemas validate it, so a
 * worker's input is held to what a request's is.
 */
export interface ResourceInput {
  /** A create's client-generated id, for a resource that takes them. */
  readonly id?: string | undefined;
  readonly attributes?: Readonly<Record<string, unknown>> | undefined;
  readonly relationships?: Readonly<Record<string, unknown>> | undefined;
}

/** What `list` does besides the page. */
/** A condition's place in a list request's filter (keyset SPEC 4.1), and the query parameter it came in. */
export interface FilterParameter {
  /** Member names and array indexes from the filter's root, as keyset-core's errors give them. */
  readonly path: ReadonlyArray<string | number>;
  /** The parameter as the request spelled it, such as `filter[status]` or `filter[or][0][status][eq]`. */
  readonly parameter: string;
}

export interface ListOptions {
  /** Also count the rows of the scope the filter selects, as the page's `total`. */
  readonly total?: boolean | undefined;
  /**
   * The query parameter of each condition of the request's filter, as
   * `filterParameters` lists them, so the error of a refused value names
   * the parameter the client sent (SPEC 18.5).
   */
  readonly parameters?: ReadonlyArray<FilterParameter> | undefined;
}

/** What `defineResource` returned for each resource (SPEC 12.3), keyed by type. */
export type RuntimeResources<TDomain extends DomainShape> = Readonly<
  Record<string, ResourceBehavior<TDomain>>
>;

/** The keyset request of `TResource`'s list, in its public names. */
type ListRequestOf<TResource extends AnyDeclaredResource> = TResource extends {
  readonly keyset: { readonly fields: infer TFields extends FieldsInit };
}
  ? KeysetRequestOf<TFields, NoRelations>
  : StorageListRequest;

/**
 * Every operation a resource may declare, typed by it. They are methods,
 * whose parameters TypeScript compares both ways, so the operations of a
 * resource typed by its behavior pass where a host or a worker takes them
 * typed wide, as `ResourceOperations` or in a `Domain`; what the wide type
 * lets through, such as a sort the keyset does not declare, the runtime
 * refuses when it plans the page. `ResourceOperations` makes them
 * read-only, which a method cannot be declared.
 * @ref https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-6.html#strict-function-types ("methods are excluded")
 */
interface Operations<TResource extends AnyDeclaredResource> {
  list(
    request?: ListRequestOf<TResource>,
    options?: ListOptions,
  ): Promise<Page<PublicRowOf<TResource>>>;
  get(id: string): Promise<PublicRowOf<TResource>>;
  create(input: ResourceInput): Promise<PublicRowOf<TResource>>;
  update(id: string, input: ResourceInput): Promise<PublicRowOf<TResource>>;
  remove(id: string): Promise<void>;
  /** The rows of the target `rows` link to over `relationship`, each once. */
  include(
    relationship: IncludableOf<TResource>,
    rows: ReadonlyArray<PublicRow>,
  ): Promise<ReadonlyArray<PublicRow>>;
}

/** `include` when `TResource` has an includable relationship. */
type IncludeOf<TResource extends AnyDeclaredResource> = [
  IncludableOf<TResource>,
] extends [never]
  ? never
  : 'include';

/** The operations of one resource as one actor runs them. */
export type ResourceOperations<
  TResource extends AnyDeclaredResource = AnyDeclaredResource,
> = string extends TResource['table']
  ? Readonly<Partial<Operations<TResource>>>
  : Readonly<
      Pick<Operations<TResource>, OperationOf<TResource> | IncludeOf<TResource>>
    >;

/** The resource `defineResource` was given for `TBehavior`. */
type ResourceOf<TBehavior> =
  TBehavior extends ResourceBehavior<infer _TDomain, infer TResource>
    ? TResource
    : AnyDeclaredResource;

/** One `ResourceOperations` per resource, keyed by type. */
export type Domain<
  TResources extends Readonly<Record<string, unknown>> =
    RuntimeResources<DomainShape>,
> = {
  readonly [TType in keyof TResources]: ResourceOperations<
    ResourceOf<TResources[TType]>
  >;
};

/**
 * A runtime of the declared operations, as a host or a worker takes it:
 * `@nizam-os/kysely-resource`'s `createResourceRuntime` resolves to one.
 */
export interface ResourceRuntime<
  TDomain extends DomainShape = DomainShape,
  TResources extends RuntimeResources<TDomain> = RuntimeResources<TDomain>,
> {
  /** What the runtime warned about when it started. */
  readonly warnings: ReadonlyArray<string>;
  /**
   * The declared resource of every behavior the runtime runs, in their
   * order: what a host mounts, documents, and finds include targets in.
   */
  readonly resources: ReadonlyArray<DeclaredResource>;
  /** Each resource's operations as `actor` runs them, each in a transaction of its own. */
  readonly as: (actor: TDomain['actor']) => Domain<TResources>;
  /**
   * Runs `work` with the operations of `as(actor)` sharing one
   * transaction, one at a time: it commits when `work` resolves and no
   * operation failed, and resolves to what `work` resolved to. The first
   * operation that fails ends it, rolled back, and every later call of
   * that domain rejects with a `TypeError`.
   */
  readonly transaction: <TResult>(
    actor: TDomain['actor'],
    work: (domain: Domain<TResources>) => Promise<TResult>,
  ) => Promise<TResult>;
}
