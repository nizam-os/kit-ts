/**
 * `defineQuota({ limit })` (SPEC 12.6): how many rows of a resource one
 * scope may hold. On create the runtime counts the rows in the actor's
 * scope under the quota's lock (`StorageAdapter.count`) and refuses an
 * insert that would exceed the limit with `QUOTA_EXCEEDED`, resource-core's
 * own code (SPEC 9.2): 403, the server understood the request and refuses
 * it, which JSON:API allows for a create.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.5.4
 * @ref https://jsonapi.org/format/1.1/#crud-creating-responses-403
 * @packageDocumentation
 */
import { BanError } from '@nizam-os/ban-core';

import {
  QUOTA_EXCEEDED_CATALOG,
  QUOTA_EXCEEDED_CODE,
} from '../errors/quota-exceeded';
import { isRecord } from '../internal/object';

/** What a quota's limit reads. */
export interface QuotaContext<TActor = unknown, TServices = unknown> {
  readonly actor: TActor;
  readonly services: TServices;
}

/** A quota: the most rows of a resource one scope may hold. */
export interface Quota<TContext = never> {
  readonly limit: (context: TContext) => number | Promise<number>;
}

const EXHAUSTED = 'The quota for this resource is used up.';

/** A quota, frozen; throws `TypeError` when `limit` is not a function. */
export function defineQuota<TContext>(quota: Quota<TContext>): Quota<TContext> {
  const value: unknown = quota;
  if (!isRecord(value) || typeof value['limit'] !== 'function') {
    throw new TypeError('defineQuota: limit must be a function');
  }
  return Object.freeze({ limit: quota.limit });
}

/**
 * `QUOTA_EXCEEDED` when one more row would exceed `limit`, the count taken
 * under the quota's lock; `undefined` while the insert fits. A limit that
 * is not a non-negative integer refuses every insert, so a misconfigured
 * quota fails closed.
 */
export function quotaExceeded(
  count: number,
  limit: number,
): BanError | undefined {
  if (Number.isSafeInteger(limit) && limit >= 0 && count < limit) {
    return undefined;
  }
  return new BanError({
    ...QUOTA_EXCEEDED_CATALOG.QUOTA_EXCEEDED,
    code: QUOTA_EXCEEDED_CODE,
    detail: EXHAUSTED,
  });
}
