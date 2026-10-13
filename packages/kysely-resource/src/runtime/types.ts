/**
 * What the domain runs with (SPEC 18.3, 18.4): the storage, each
 * resource's behavior keyed by its type, the scope bindings, the quotas,
 * the services, the application's codes, and the hooks after commit; what
 * boot reads besides, the full catalog and the resources that run without
 * a scope. The input it takes and the runtime it makes are resource-core's
 * contract (SPEC 12.10).
 * @packageDocumentation
 */
import type { Catalog } from '@nizam-os/catalog-core';
import type {
  DomainEvent,
  DomainShape,
  Quota,
  QuotaContext,
  RuntimeResources,
  Scope,
} from '@nizam-os/resource-core/server';

import type { KyselyStorage } from '../storage/types';

/** A hook after commit: what an operation recorded, when it recorded anything (SPEC 18.6). */
type AfterCommit = (events: ReadonlyArray<DomainEvent>) => void | Promise<void>;

/** What the domain of an application runs with. */
export interface DomainOptions<TDomain extends DomainShape> {
  readonly storage: KyselyStorage;
  /** What `defineResource` returned for each resource, keyed by its type. */
  readonly resources: RuntimeResources<TDomain>;
  /** A binding per scope of the definer (SPEC 12.5). */
  readonly scopes: Readonly<Record<string, Scope<string, TDomain['actor']>>>;
  /** A quota per name a create's behavior names (SPEC 12.6). */
  readonly quotas: Readonly<
    Record<string, Quota<QuotaContext<TDomain['actor'], TDomain['services']>>>
  >;
  /** Handed to policies, values, rules, quotas, and effects. */
  readonly services: TDomain['services'];
  /** The application's codes, for the error of a rule's rejection (SPEC 12.4). */
  readonly errors: TDomain['errors'];
  readonly afterCommit?: AfterCommit | undefined;
  /** Receives what `afterCommit` threw, which never reaches the operation's caller. */
  readonly report?: ((error: unknown) => void | Promise<void>) | undefined;
}

/** What `checkResourceRuntime` and `createResourceRuntime` take (SPEC 18.3). */
export interface RuntimeOptions<
  TDomain extends DomainShape,
  TResources extends RuntimeResources<TDomain> = RuntimeResources<TDomain>,
> extends DomainOptions<TDomain> {
  /** Typed as both, so `TDomain` is inferred from the behaviors and `TResources` keeps each one's resource. */
  readonly resources: TResources & RuntimeResources<TDomain>;
  /** The full catalog `pg-catalog extract` writes: row security, indexes, and the outbox table. */
  readonly catalog: Catalog;
  /** The resources that run without a scope, by type; every other resource needs one. */
  readonly unscoped?: ReadonlyArray<string> | undefined;
}
