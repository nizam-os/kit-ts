/**
 * What `resourceQueries` and `operationsMutation` return (SPEC 16.5, 17.4):
 * plain objects typed with `@tanstack/query-core` alone, holding only the
 * members the binding sets (ADR 0020), so every adapter's hooks and
 * `QueryClient` methods take them as they are and infer their data. A read's
 * key tags its data through `DataTag`, so `queryClient.getQueryData(key)` is
 * typed. A read's records are the client's `RecordOf` for the query passed
 * (SPEC 15.6), a literal query read as a constant, as the client reads it; a
 * write's variables are what the client's call takes, and the operations'
 * are the operations.
 * @ref https://tanstack.com/query/v5/docs/framework/react/typescript#typing-query-options
 * @ref https://tanstack.com/query/v5/docs/framework/react/reference/mutationOptions
 * @packageDocumentation
 */
import type {
  DataTag,
  DefaultError,
  GetNextPageParamFunction,
  GetPreviousPageParamFunction,
  InfiniteData,
  MutationFunction,
  MutationFunctionContext,
  QueryFunction,
  QueryKey,
} from '@tanstack/query-core';

import type {
  CreateInput,
  GetQuery,
  ListQuery,
  Operation,
  OperationsResult,
  ReadResult,
  RecordOf,
  UpdateInput,
  WriteResult,
} from '@nizam-os/jsonapi-client';

import type { PageParam } from './pages';
import type {
  AllKey,
  GetKey,
  KeyedDefinition,
  ListKey,
  PagesKey,
} from './query-keys';

/** A call's query left out: no members, as the client's calls default it. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- reason: a query left out must have no members at all, so it names no include path and no fieldset, as the client's own default; `undefined` does not satisfy the query constraint a type parameter's default must meet
type NoQuery = Readonly<Record<never, never>>;

/** A read's options: the key, tagged with the data it caches, and the call. */
export interface ReadOptions<TData, TKey extends QueryKey> {
  readonly queryKey: DataTag<TKey, TData, DefaultError>;
  readonly queryFn: QueryFunction<TData, TKey>;
}

/**
 * An infinite list's options: the key, the call of one page, and where the
 * pages lead. The key is tagged as every adapter's `infiniteQueryOptions`
 * tags one, its page parameter left `unknown` (ADR 0021), so a key passed
 * through that helper keeps reading as the hook's data.
 * @ref https://tanstack.com/query/v5/docs/framework/react/reference/infiniteQueryOptions
 */
export interface PagesOptions<TPage, TKey extends QueryKey> {
  readonly queryKey: DataTag<TKey, InfiniteData<TPage>, DefaultError>;
  readonly queryFn: QueryFunction<TPage, TKey, PageParam>;
  readonly initialPageParam: PageParam;
  readonly getNextPageParam: GetNextPageParamFunction<PageParam, TPage>;
  readonly getPreviousPageParam: GetPreviousPageParamFunction<PageParam, TPage>;
}

/** A write's options: its key, the call, and the invalidation the mutation awaits. */
export interface WriteOptions<TData, TVariables> {
  readonly mutationKey: QueryKey;
  readonly mutationFn: MutationFunction<TData, TVariables>;
  readonly onSuccess: (
    data: TData,
    variables: TVariables,
    onMutateResult: unknown,
    context: MutationFunctionContext,
  ) => Promise<void>;
}

/**
 * What `operationsMutation` returns (SPEC 17.4): a write's options whose
 * variables are the operations `operationsOf` builds and whose data is
 * their results. `TOperation` is any operation by default, so each
 * result's data is `unknown`; a type argument narrows it.
 */
export type OperationsOptions<TOperation extends Operation = Operation> =
  WriteOptions<
    OperationsResult<ReadonlyArray<TOperation>>,
    ReadonlyArray<TOperation>
  >;

/** A page of records, as the client's `list` of `TQuery` resolves to it. */
export type ListResult<TDefinitions, TDefinition, TQuery> = ReadResult<
  ReadonlyArray<RecordOf<TDefinitions, TDefinition, TQuery>>
>;

/** `update`'s variables: the record's id beside the input the client's `update` takes. */
export type UpdateVariables<TDefinition> = {
  readonly id: string;
} & UpdateInput<TDefinition>;

/**
 * What a write's options take. `invalidates` holds the keys of the other
 * types the write changes on the server, such as `comments.all` for a
 * removal that cascades to an article's comments: the mutation invalidates
 * them with its own type and stays pending until they have refetched too.
 */
export interface WriteSettings {
  readonly invalidates?: ReadonlyArray<QueryKey> | undefined;
}

/** Whether the definition's list takes `page`. */
type Paginates<TDefinitions, TDefinition> = [
  Exclude<ListQuery<TDefinitions, TDefinition>['page'], undefined>,
] extends [never]
  ? false
  : true;

/** `pages` on a definition that paginates; `never` on one that does not, so no call compiles. */
type PagesMember<TDefinitions, TDefinition extends KeyedDefinition> =
  Paginates<TDefinitions, TDefinition> extends true
    ? <const TQuery extends ListQuery<TDefinitions, TDefinition> = NoQuery>(
        query?: TQuery,
      ) => PagesOptions<
        ListResult<TDefinitions, TDefinition, TQuery>,
        PagesKey<TDefinition['type']>
      >
    : never;

/** The keys and options of one resource's reads and writes (SPEC 16.2). */
export interface ResourceQueries<
  TDefinitions,
  TDefinition extends KeyedDefinition,
> {
  /** `[type]`: every list, page, and record of the type, which each write invalidates. */
  readonly all: AllKey<TDefinition['type']>;
  /** A page of records: `client.list(query)`, keyed by the query string it sends. */
  list<const TQuery extends ListQuery<TDefinitions, TDefinition> = NoQuery>(
    query?: TQuery,
  ): ReadOptions<
    ListResult<TDefinitions, TDefinition, TQuery>,
    ListKey<TDefinition['type']>
  >;
  /** An infinite list, from the query's cursors a page at a time in either direction. */
  readonly pages: PagesMember<TDefinitions, TDefinition>;
  /** One record: `client.get(id, query)`, keyed by the id and the `include` and `fields` it sends. */
  get<const TQuery extends GetQuery<TDefinitions, TDefinition> = NoQuery>(
    id: string,
    query?: TQuery,
  ): ReadOptions<
    ReadResult<RecordOf<TDefinitions, TDefinition, TQuery>>,
    GetKey<TDefinition['type']>
  >;
  /** `client.create(input)`, pending until the reads it invalidates have refetched. */
  create(
    settings?: WriteSettings,
  ): WriteOptions<
    WriteResult<RecordOf<TDefinitions, TDefinition>>,
    CreateInput<TDefinition>
  >;
  /** `client.update(id, input)` of `{ id, ...input }`, pending until the reads it invalidates have refetched. */
  update(
    settings?: WriteSettings,
  ): WriteOptions<
    WriteResult<RecordOf<TDefinitions, TDefinition>>,
    UpdateVariables<TDefinition>
  >;
  /** `client.remove(id)`, which removes the record's entries before the reads it invalidates refetch. */
  remove(
    settings?: WriteSettings,
  ): WriteOptions<WriteResult<undefined>, string>;
}
