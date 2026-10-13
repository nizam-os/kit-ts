/**
 * What a failed operation is to the client (resource SPEC 18.5): a rule's
 * `Rejection` is its code's error (12.4); a keyset refusal is the Cursor
 * Pagination profile's error (`keyset-refusal.ts`); a PostgreSQL integrity
 * violation is the declared code `constraintError` finds (9.5), after the
 * storage adapter names the partitioned table of a violation a partition
 * raised, which it answers outside any transaction (12.8, obligation 11).
 * Anything else stays as thrown: a `BanError` the lifecycle raised, such
 * as `QUOTA_EXCEEDED`, is already the client's, and a lost connection or a
 * statement the adapter got wrong is the host's 500, rendered without
 * detail by its ban.
 * @packageDocumentation
 */
import type { Catalog } from '@nizam-os/ban-core';
import type { AnyDeclaredResource, Operation } from '@nizam-os/resource-core';
import type {
  FilterParameter,
  StorageAdapter,
} from '@nizam-os/resource-core/server';

import {
  constraintError,
  partitionViolation,
  Rejection,
  rejectionError,
} from '@nizam-os/resource-core/server';

import { keysetRefusal } from './keyset-refusal';

/** Where a failure arose, and where its error looks codes up. */
export interface FailureContext {
  /** The adapter the operation ran on, which names a partition's partitioned table. */
  readonly storage: Pick<StorageAdapter<unknown>, 'partitionRoot'>;
  /** The declared resource the operation ran on. */
  readonly resource: AnyDeclaredResource;
  readonly operation: Operation;
  /** The application's errors, where a rule's code is looked up. */
  readonly errors: Catalog;
  /** The RFC 6901 pointer of the operation's resource object; default `/data`. */
  readonly pointer?: string | undefined;
  /** A list's filter parameters (`ListOptions`), which name a refused value's parameter as the request spelled it. */
  readonly parameters?: ReadonlyArray<FilterParameter> | undefined;
}

/**
 * The client's error for what an operation threw, or the thrown value
 * itself when it is not the operation's to map. Call it once the
 * operation's transaction has ended: a partition's names are read on a
 * connection of their own.
 */
export async function operationFailure(
  thrown: unknown,
  context: FailureContext,
): Promise<unknown> {
  const { storage, resource, operation, errors, pointer, parameters } = context;
  if (thrown instanceof Rejection) {
    return rejectionError(thrown, { resource, errors, pointer });
  }
  const refusal = keysetRefusal(thrown, parameters);
  if (refusal !== undefined) {
    return refusal;
  }
  const options = { resource, operation, pointer };
  const raised = partitionViolation(thrown, options);
  const partition =
    raised === undefined ? undefined : await storage.partitionRoot(raised);
  return constraintError(thrown, { ...options, partition }) ?? thrown;
}
