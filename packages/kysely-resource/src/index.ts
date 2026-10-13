/**
 * `@nizam-os/kysely-resource`: the Kysely runtime for `@nizam-os/resource-core`
 * declarations on PostgreSQL (resource SPEC 18, ADR 0012). The storage
 * adapter runs each operation in one transaction that sets every scope's
 * session parameter for that transaction only, and adds the scope's
 * predicate to every statement on a scoped table. `createResourceRuntime`
 * checks the composition against the catalog and the database, then runs
 * each operation's lifecycle for `runtime.as(actor)`, which HTTP hosts and
 * workers call alike; `checkResourceRuntime` runs the static checks in CI;
 * `relayOutbox` delivers the events operations recorded, after they
 * committed. The runtime's types are `@nizam-os/resource-core/server`'s
 * contract (resource SPEC 12.10), re-exported here.
 * @ref https://kysely.dev/
 * @packageDocumentation
 */
export type { BootReport } from './boot/report';
export type { OutboxEvent, RelayOptions } from './outbox/relay';
export type { RuntimeOptions } from './runtime/types';
export type { KyselyTransaction } from './storage/transaction';
export type {
  KyselyStorage,
  KyselyStorageOptions,
  OutboxTable,
  TextCodec,
} from './storage/types';
export type {
  Domain,
  ListOptions,
  ResourceInput,
  ResourceOperations,
  ResourceRuntime,
  RuntimeResources,
} from '@nizam-os/resource-core/server';

export { checkResourceRuntime } from './boot/check-runtime';
export { BootError } from './boot/report';
export { relayOutbox } from './outbox/relay';
export { createResourceRuntime } from './runtime/create-runtime';
export { createKyselyStorage } from './storage/create-storage';
