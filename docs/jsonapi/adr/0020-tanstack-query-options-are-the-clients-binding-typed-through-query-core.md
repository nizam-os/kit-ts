# ADR 0020: TanStack Query options are the clients' binding, typed through query-core

- Status: accepted; amended by ADR-0021 (a list's pages key is tagged `InfiniteData<TPage>`, as
  every adapter's `infiniteQueryOptions` tags an infinite key)
- Date: 2026-10-12

## Context

`resourceQueries(client)` keys TanStack Query by the request each call sends and invalidates a type
after each write (resource ADR 0015). It reads the client alone: its `definition`, for
`serializeQuery` (SPEC 15.5), its calls, and `pageCursors` (15.8). It was built in the resource
family, as `@nizam-os/react-resource/query`, typed through `@tanstack/react-query`'s `queryOptions`,
`infiniteQueryOptions`, and `mutationOptions`, which exist only in the adapters. Root ADR 0010 binds
such a library through its core and root ADR 0011 takes the core as an optional peer.

query-core's own option types do not serve every adapter. Measured on 2026-10-12 with the five
adapters of TanStack Query 5.104.1 (Svelte's at 6.3.1), under `exactOptionalPropertyTypes`, options
typed as `QueryObserverOptions` and `InfiniteQueryObserverOptions` fail in two:

- Vue's `useQuery` and `useInfiniteQuery` type each option as a `MaybeRefDeep` of query-core's, over
  the key as `DeepUnwrapRef` maps it, and a `persister` typed over the key's tuple no longer
  matches.
- Solid's `useQuery` has one overload for options whose `initialData` is set and one for options
  without it, and an `initialData` that may be either matches neither; `useInfiniteQuery` likewise.

Types that hold only the members the binding sets, the tagged `queryKey` and the `queryFn`, with the
page parameters for an infinite query and `mutationKey`, `mutationFn`, and `onSuccess` for a
mutation, are taken by the queries, infinite queries, and mutations of all five, with their data
typed, `select` inferring from the data, and `getQueryData(key)` typed through the key's tag.

## Decision

- `resourceQueries` is the family's TanStack Query binding, `@nizam-os/tanstack-query-jsonapi` (root
  ADR 0010). It takes `@nizam-os/jsonapi-client` as a peer, since the application hands it clients
  (root ADR 0006), and `@tanstack/query-core` `^5.89.0` as an optional peer it imports only types
  from (root ADR 0011): it hands TanStack Query no value made with the core.
- Its options are plain objects whose types hold only the members it sets, built from query-core's
  `DataTag`, `QueryFunction`, `GetNextPageParamFunction`, `GetPreviousPageParamFunction`,
  `MutationFunction`, and `MutationFunctionContext`. An application spreads them and adds its own,
  such as `placeholderData`, `staleTime`, or `select`.
- The keys, reads, pages, and writes are ADR 0015's: a key is the request, and a write invalidates
  its type and the keys it names from `onSuccess`, through the `QueryClient` TanStack Query passes
  it.

## Consequences

An application on React, Vue, Solid, Svelte, or Angular uses one package with its own adapter's
hooks, and may still pass the options through its adapter's helpers. The data of an infinite query's
hook is `InfiniteData<TPage, unknown>`, TanStack Query's default for an infinite query without
`select`, while `getQueryData` of a pages key is typed with the page parameter. The family's e2e
suite type-checks the built binding with each adapter and runs it against the blog API over HTTP.
