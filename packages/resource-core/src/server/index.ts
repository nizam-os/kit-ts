/**
 * `@nizam-os/resource-core/server`: what only a server composes, typed by
 * the application's registries (SPEC 12, ADR 0008): the domain definers,
 * policies, behavior, scopes, quotas, events, `reject`, the database
 * rejections of SPEC 9.5, the storage adapter contract, and the runtime
 * contract hosts take (SPEC 12.10). Nothing here touches a database;
 * adapters and runtimes implement the contracts.
 * @packageDocumentation
 */
export type {
  CreateBehavior,
  Effect,
  RemoveBehavior,
  ResourceBehavior,
  Rule,
  RuleContext,
  UpdateBehavior,
  ValuesContext,
} from './behavior-types';
export type { ConstraintErrorOptions } from './constraint-options';
export type { DomainDefiners } from './domain';
export type {
  Actor,
  AppCodeOf,
  DomainContext,
  DomainShape,
} from './domain-types';
export type { DomainEvent, EventDefinition } from './event';
export type { Policy, PolicyContexts, PolicyInit } from './policy';
export type { Quota, QuotaContext } from './quota';
export type { Reject, RejectionErrorOptions, RejectOptions } from './reject';
export type {
  RelationshipTarget,
  RelationshipTargetsOptions,
} from './relationship-targets';
export type {
  CreateInputOf,
  IncludableOf,
  MemberNameOf,
  OperationOf,
  PublicRowOf,
  UpdateInputOf,
} from './resource-types';
export type {
  Domain,
  FilterParameter,
  ListOptions,
  ResourceInput,
  ResourceOperations,
  ResourceRuntime,
  RuntimeResources,
} from './runtime';
export type { Scope, ScopeBindings, ScopeKey, ScopeValue } from './scope';
export type { ServerValuesOf } from './server-values';
export type { ViolationNames } from './violation-names';
export type {
  PublicRow,
  StorageAdapter,
  StorageListRequest,
  StoragePage,
  StorageWrite,
} from './storage';

export { constraintError } from './constraint-error';
export { isResourceBehavior } from './define-resource';
export { createDomainDefiners } from './domain';
export { defineEvent } from './event';
export { filterParameters, keysetRequest } from './keyset-request';
export { PARTITION_ROOT_SQL, partitionViolation } from './partition';
export { denyAll } from './policy';
export { defineQuota, quotaExceeded } from './quota';
export { reject, Rejection, rejectionError } from './reject';
export { relationshipTargets } from './relationship-targets';
export { defineScope, scopeColumnOf, scopeValues } from './scope';
