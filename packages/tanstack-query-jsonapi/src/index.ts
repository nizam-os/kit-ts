/**
 * `@nizam-os/tanstack-query-jsonapi`: TanStack Query's options for a client's
 * reads and writes (SPEC 16), keyed by the request, for every adapter.
 * `resourceQueries` makes them from a client `createClients` returned, and
 * `operationsMutation` sends Atomic Operations (SPEC 17.4).
 * `@tanstack/query-core` is an optional peer, imported for types only (ADR
 * 0020).
 * @packageDocumentation
 */
export type { PageParam } from './pages';
export type {
  AllKey,
  GetKey,
  KeyedDefinition,
  ListKey,
  PagesKey,
} from './query-keys';
export type {
  ListResult,
  OperationsOptions,
  PagesOptions,
  ReadOptions,
  ResourceQueries,
  UpdateVariables,
  WriteOptions,
  WriteSettings,
} from './query-types';

export { operationsMutation } from './operations';
export { resourceQueries } from './queries';
