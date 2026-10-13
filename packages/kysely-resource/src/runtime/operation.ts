/**
 * What every operation runs in (SPEC 12.3, 18.4, 18.5): one transaction
 * of the storage, with every scope the actor has, for an unscoped
 * resource too, since a policy on its table may read them. What the
 * transaction rejects with becomes the client's error once it has ended
 * (`operationFailure`), and the events it recorded go to `afterCommit`
 * once it has committed. Inside `transaction(actor, work)` the operation
 * runs in the session's transaction instead, which maps, commits, and
 * hands the events over once for every operation (`transaction.ts`).
 * @packageDocumentation
 */
import type { Operation } from '@nizam-os/resource-core';
import type {
  DomainEvent,
  DomainShape,
  FilterParameter,
  ResourceBehavior,
} from '@nizam-os/resource-core/server';

import type { StorageConfig } from '../storage/options';
import type { KyselyTransaction } from '../storage/transaction';
import type { Session, Work } from './session';
import type { DomainOptions } from './types';

import { scopeValues } from '@nizam-os/resource-core/server';

import { afterCommit } from './events';
import { operationFailure } from './failure';

/** What the operations of `as(actor)` run with. */
export interface Run<TDomain extends DomainShape> {
  readonly options: DomainOptions<TDomain>;
  /** The options the storage was made with, for the adapter's statements beyond the contract. */
  readonly config: StorageConfig;
  readonly actor: TDomain['actor'];
  /** The session of `transaction(actor, work)` the operations run in, when they run in one. */
  readonly session?: Session | undefined;
}

/** Runs `work` in one transaction scoped to the actor; rejects with the client's error of what it threw. */
async function scoped<TDomain extends DomainShape, TResult>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
  operation: Operation,
  work: (tx: KyselyTransaction) => Promise<TResult>,
  parameters: ReadonlyArray<FilterParameter> | undefined,
): Promise<TResult> {
  const { storage, scopes, errors } = run.options;
  const values = scopeValues(scopes, run.actor);
  try {
    return await storage.transaction(values, work);
  } catch (thrown) {
    throw await operationFailure(thrown, {
      storage,
      resource: behavior.resource,
      operation,
      errors,
      parameters,
    });
  }
}

/**
 * Runs `work` as `operation` on `behavior`'s resource; once committed,
 * hands what it recorded to `afterCommit`. In a session, runs it in the
 * session's transaction. A list passes its filter `parameters`, which its
 * failure is mapped with.
 */
export async function transact<TDomain extends DomainShape, TResult>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
  operation: Operation,
  work: Work<TResult>,
  parameters?: ReadonlyArray<FilterParameter>,
): Promise<TResult> {
  if (run.session !== undefined) {
    return run.session.inside(behavior.resource, operation, work, parameters);
  }
  const recorded: Array<DomainEvent> = [];
  const result = await scoped(
    run,
    behavior,
    operation,
    async (tx) => work(tx, recorded),
    parameters,
  );
  await afterCommit(run.options, recorded);
  return result;
}
