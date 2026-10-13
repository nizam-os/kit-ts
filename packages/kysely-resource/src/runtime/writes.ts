/**
 * The writing operations (SPEC 12.3, 18.4), each the same lifecycle in one
 * transaction: the policy, the rules, the relationship targets, the quota
 * of a create, the write, and the effects, whose events the adapter
 * records with the write, so any failure rolls back everything. The input
 * is validated before the transaction. An update and a remove read their
 * row with `lock`, so the row the policy and the rules decide on is the
 * row the write changes: under READ COMMITTED a plain read takes no lock,
 * and another transaction could change or remove the row in between. The
 * targets are looked up after the policy and the rules, so an actor the
 * policy refuses learns nothing of them, and before the quota's lock, which
 * serializes the creates of one scope.
 * @ref https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED
 * @packageDocumentation
 */
import type { DeclaredResource } from '@nizam-os/resource-core';
import type {
  DomainShape,
  PublicRow,
  ResourceBehavior,
  ResourceInput,
} from '@nizam-os/resource-core/server';

import type { KyselyTransaction } from '../storage/transaction';
import type { Run } from './operation';

import { quotaExceeded, reject } from '@nizam-os/resource-core/server';

import { ownValue } from '../internal/object';
import { recordEffects } from './events';
import { knownId, notFound, writeOf } from './input';
import { transact } from './operation';
import { checkTargets } from './targets';

/** Resolves while one more row of the resource fits the quota `name` in the actor's scope; `QUOTA_EXCEEDED` otherwise. */
async function checkQuota<TDomain extends DomainShape>(
  run: Run<TDomain>,
  tx: KyselyTransaction,
  resource: DeclaredResource,
  name: string,
): Promise<void> {
  const { storage, quotas, services } = run.options;
  const quota = ownValue(quotas, name);
  if (quota === undefined) {
    throw new TypeError(
      `${resource.names.type}: options.quotas has no quota ${name}`,
    );
  }
  const limit = await quota.limit({ actor: run.actor, services });
  const exceeded = quotaExceeded(
    await storage.count(tx, resource, name),
    limit,
  );
  if (exceeded !== undefined) {
    throw exceeded;
  }
}

/** Creates a row of the resource from `input`; resolves to the row as stored. */
export async function createRow<TDomain extends DomainShape>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
  input: ResourceInput,
): Promise<PublicRow> {
  const { storage, services } = run.options;
  const { resource, policy, operations } = behavior;
  const write = writeOf(resource, 'create', input);
  const create = operations.create;
  return transact(run, behavior, 'create', async (tx, recorded) => {
    const context = { actor: run.actor, services, input: write };
    await policy.authorize('create', context);
    for (const rule of create?.rules ?? []) {
      await rule({ ...context, reject });
    }
    await checkTargets(run.config, tx, resource, write);
    if (create?.quota !== undefined) {
      await checkQuota(run, tx, resource, create.quota);
    }
    const values = create?.values?.(context);
    const row = await storage.create(
      tx,
      resource,
      values === undefined ? write : { ...write, values },
    );
    const effects = create?.effects ?? [];
    recorded.push(
      ...(await recordEffects(storage, tx, effects, { ...context, row })),
    );
    return row;
  });
}

/** Updates the row whose id is `id` with `input`; resolves to the row as stored. */
export async function updateRow<TDomain extends DomainShape>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
  id: string,
  input: ResourceInput,
): Promise<PublicRow> {
  const { storage, services } = run.options;
  const { resource, policy, operations } = behavior;
  const write = writeOf(resource, 'update', input);
  const known = knownId(resource, id);
  const update = operations.update;
  return transact(run, behavior, 'update', async (tx, recorded) => {
    const previous = await storage.lock(tx, resource, known, 'update');
    if (previous === undefined) {
      throw notFound();
    }
    const context = { actor: run.actor, services, input: write };
    await policy.authorize('update', { ...context, row: previous });
    for (const rule of update?.rules ?? []) {
      await rule({ ...context, row: previous, reject });
    }
    await checkTargets(run.config, tx, resource, write);
    const row = await storage.update(tx, resource, known, write);
    if (row === undefined) {
      throw notFound();
    }
    const effects = update?.effects ?? [];
    recorded.push(
      ...(await recordEffects(storage, tx, effects, {
        ...context,
        row,
        previous,
      })),
    );
    return row;
  });
}

/** Removes the row whose id is `id`. */
export async function removeRow<TDomain extends DomainShape>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
  id: string,
): Promise<void> {
  const { storage, services } = run.options;
  const { resource, policy, operations } = behavior;
  const known = knownId(resource, id);
  const remove = operations.remove;
  await transact(run, behavior, 'remove', async (tx, recorded) => {
    const row = await storage.lock(tx, resource, known, 'remove');
    if (row === undefined) {
      throw notFound();
    }
    const context = { actor: run.actor, services, row };
    await policy.authorize('remove', context);
    for (const rule of remove?.rules ?? []) {
      await rule({ ...context, reject });
    }
    if (!(await storage.remove(tx, resource, known))) {
      throw notFound();
    }
    const effects = remove?.effects ?? [];
    recorded.push(...(await recordEffects(storage, tx, effects, context)));
  });
}
