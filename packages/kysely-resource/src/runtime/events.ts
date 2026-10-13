/**
 * What an operation's effects return, and what becomes of it (SPEC 12.7,
 * 18.6): the effects run in order once the write succeeded, and the
 * adapter records their events in the operation's transaction, so an event
 * exists exactly when its write committed. After the commit the events go
 * to `afterCommit`, a best-effort wake-up for the relay, which is awaited
 * before the operation resolves; what it throws goes to `report`, and
 * never to the caller, whose write has committed.
 * @ref https://microservices.io/patterns/data/transactional-outbox.html
 * @packageDocumentation
 */
import type {
  DomainEvent,
  DomainShape,
  Effect,
} from '@nizam-os/resource-core/server';

import type { KyselyTransaction } from '../storage/transaction';
import type { KyselyStorage } from '../storage/types';
import type { DomainOptions } from './types';

/** Runs `effects` in order with `context` and records their events in the transaction; resolves to the events. */
export async function recordEffects<TContext>(
  storage: KyselyStorage,
  tx: KyselyTransaction,
  effects: ReadonlyArray<Effect<TContext>>,
  context: TContext,
): Promise<ReadonlyArray<DomainEvent>> {
  const events: Array<DomainEvent> = [];
  for (const effect of effects) {
    events.push(...(await effect(context)));
  }
  await storage.record(tx, events);
  return events;
}

/** Hands a committed operation's events to `afterCommit`, when it recorded any; what that throws goes to `report`. */
export async function afterCommit<TDomain extends DomainShape>(
  options: Pick<DomainOptions<TDomain>, 'afterCommit' | 'report'>,
  events: ReadonlyArray<DomainEvent>,
): Promise<void> {
  if (events.length === 0 || options.afterCommit === undefined) {
    return;
  }
  try {
    await options.afterCommit(events);
  } catch (error) {
    try {
      await options.report?.(error);
    } catch {
      // reason: the write has committed, so neither afterCommit nor report may fail the operation (SPEC 18.6)
    }
  }
}
