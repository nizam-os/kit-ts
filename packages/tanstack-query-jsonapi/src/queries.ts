/**
 * `resourceQueries(client)` (SPEC 16.2 to 16.6): TanStack Query's options
 * for a client's reads and writes, as plain objects keyed by the request
 * (`query-keys.ts`). Nothing of TanStack Query runs here: an adapter's
 * `queryOptions` returns the object it is given, and the `QueryClient` a
 * write invalidates through is the one TanStack Query hands `onSuccess`
 * (`context.client`), so the options go into any adapter's hooks. Each
 * read passes the query's `signal`, so a cancelled query aborts its
 * request. Each write invalidates its type, and the keys its settings
 * name, and returns that promise from `onSuccess`, so the mutation stays
 * pending until the lists and records it touched have refetched; `remove`
 * first removes the record's `get` entries, so a screen still showing it
 * does not refetch a 404. An invalidation is in the options, never in a
 * callback passed to `mutate`, which TanStack Query skips once the
 * component that called it unmounts. The options are made over the
 * client's calls typed wide and typed by its definitions where they are
 * returned, as `createClients` types the calls themselves.
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/mutations#mutation-side-effects ("those additional callbacks won't run if your component unmounts before the mutation finishes")
 * @ref https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientremovequeries
 * @packageDocumentation
 */
import type { MutationFunctionContext, QueryKey } from '@tanstack/query-core';

import type {
  CallOptions,
  Query,
  ReadResult,
  ResourceClient,
  WriteResult,
} from '@nizam-os/jsonapi-client';

import type { PageParam } from './pages';
import type { AllKey, KeyedDefinition } from './query-keys';
import type { ResourceQueries, WriteSettings } from './query-types';

import { invalidate, settingsKeys } from './invalidation';
import { firstPage, nextPage, pageQuery, previousPage } from './pages';
import { queryText, recordText } from './query-keys';

const CALLER = 'resourceQueries';

/** The calls the options make. */
const CALLS: ReadonlyArray<string> = [
  'list',
  'get',
  'create',
  'update',
  'remove',
];

/** The calls typed wide: the client holds each result to its call's shape at run time. */
interface WideClient {
  readonly definition: KeyedDefinition;
  readonly list: (
    query: Query | undefined,
    options: CallOptions,
  ) => Promise<ReadResult<ReadonlyArray<unknown>>>;
  readonly get: (
    id: string,
    query: Query | undefined,
    options: CallOptions,
  ) => Promise<ReadResult<unknown>>;
  readonly create: (input: unknown) => Promise<WriteResult<unknown>>;
  readonly update: (
    id: string,
    input: unknown,
  ) => Promise<WriteResult<unknown>>;
  readonly remove: (id: string) => Promise<WriteResult<unknown>>;
}

/** A non-null object. */
function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** Whether `value` has a definition and the calls, as every client `createClients` returns does. */
function isClient(value: unknown): value is WideClient {
  return (
    isObject(value) &&
    isObject(Reflect.get(value, 'definition')) &&
    CALLS.every((call) => typeof Reflect.get(value, call) === 'function')
  );
}

/** The keys a write invalidates: its type's, then each of `settings.invalidates`. */
function invalidatedBy(
  all: AllKey<string>,
  settings: WriteSettings | undefined,
): ReadonlyArray<QueryKey> {
  return [all, ...settingsKeys(CALLER, settings)];
}

/** `onSuccess` of a write: the invalidation of `keys`, which the mutation awaits. */
function invalidating(keys: ReadonlyArray<QueryKey>) {
  return async (
    _data: unknown,
    _variables: unknown,
    _onMutateResult: unknown,
    context: MutationFunctionContext,
  ): Promise<void> => invalidate(context.client, keys);
}

/** The infinite list of `query`, refused on a definition that does not paginate. */
function pagesOf(client: WideClient, query: Query | undefined) {
  const { definition } = client;
  if (definition.query.page === undefined) {
    throw new TypeError(
      `${CALLER}: ${definition.type} does not paginate, so it has no pages`,
    );
  }
  return {
    queryKey: [definition.type, 'pages', queryText(definition, query)],
    queryFn: async ({
      pageParam,
      signal,
    }: {
      readonly pageParam: PageParam;
      readonly signal: AbortSignal;
    }) => client.list(pageQuery(query, pageParam), { signal }),
    initialPageParam: firstPage(query),
    getNextPageParam: nextPage,
    getPreviousPageParam: previousPage,
  };
}

/** The options over the calls typed wide. */
function wideQueries(client: WideClient) {
  const { definition } = client;
  const { type } = definition;
  const all = Object.freeze([type] as const);
  return Object.freeze({
    all,
    list: (query?: Query) => ({
      queryKey: [type, 'list', queryText(definition, query)],
      queryFn: async ({ signal }: { readonly signal: AbortSignal }) =>
        client.list(query, { signal }),
    }),
    pages: (query?: Query) => pagesOf(client, query),
    get: (id: string, query?: Query) => ({
      queryKey: [type, 'get', id, recordText(definition, query)],
      queryFn: async ({ signal }: { readonly signal: AbortSignal }) =>
        client.get(id, query, { signal }),
    }),
    create: (settings?: WriteSettings) => ({
      mutationKey: [type, 'create'],
      mutationFn: async (input: unknown) => client.create(input),
      onSuccess: invalidating(invalidatedBy(all, settings)),
    }),
    update: (settings?: WriteSettings) => ({
      mutationKey: [type, 'update'],
      mutationFn: async ({ id, ...input }: { readonly id: string }) =>
        client.update(id, input),
      onSuccess: invalidating(invalidatedBy(all, settings)),
    }),
    remove: (settings?: WriteSettings) => {
      const keys = invalidatedBy(all, settings);
      return {
        mutationKey: [type, 'remove'],
        mutationFn: async (id: string) => client.remove(id),
        onSuccess: async (
          _data: unknown,
          id: string,
          _onMutateResult: unknown,
          context: MutationFunctionContext,
        ): Promise<void> => {
          context.client.removeQueries({ queryKey: [type, 'get', id] });
          return invalidate(context.client, keys);
        },
      };
    },
  });
}

/**
 * The keys and options of `client`'s reads and writes. Throws `TypeError`
 * when `client` is not one `createClients` returned, from `pages` when
 * its definition does not paginate, and from a write whose `invalidates`
 * is not a list of query keys.
 */
export function resourceQueries<
  TDefinitions,
  TDefinition extends KeyedDefinition,
>(
  client: ResourceClient<TDefinitions, TDefinition>,
): ResourceQueries<TDefinitions, TDefinition> {
  if (!isClient(client)) {
    throw new TypeError(
      `${CALLER}: client must be a client createClients returned`,
    );
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the options are made over the calls typed wide, whose results the client types by these definitions (SPEC 15.4); the keys and calls are the ones ResourceQueries names
  return wideQueries(client) as unknown as ResourceQueries<
    TDefinitions,
    TDefinition
  >;
}
