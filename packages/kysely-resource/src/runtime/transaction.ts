/**
 * `transaction(actor, work)` (resource SPEC 12.10, 18.4): one storage
 * transaction with every scope the actor has, whose domain's operations
 * share it, one at a time (`session.ts`). It ends when `work` settles and
 * no call is pending, or at once when an operation fails, so a failure
 * releases its locks and its connection however long `work` goes on:
 *
 * - `work` resolved and no operation failed: it commits, the events go to
 *   `afterCommit` once, and `transaction` resolves to what `work` did;
 * - an operation failed: it rolls back, and `transaction` rejects with the
 *   failure mapped as the operation alone maps it, once the transaction
 *   ended, since a partition's names are read on another connection
 *   (SPEC 18.5); or with what `work` rejected with, when that is another
 *   value, such as an error `work` built from the failure;
 * - `work` rejected and no operation failed: it rolls back, and
 *   `transaction` rejects with what `work` rejected with.
 *
 * What the commit itself throws, which no operation threw, rejects as it
 * is, and so does a failure to open the transaction, before `work` runs.
 * @ref https://jsonapi.org/ext/atomic/#processing ("all operations MUST be performed atomically")
 * @ref https://kysely-org.github.io/kysely-apidoc/classes/Kysely.html#transaction (rolls back when the callback throws)
 * @packageDocumentation
 */
import type { DomainShape } from '@nizam-os/resource-core/server';

import type { Failure } from './session';
import type { DomainOptions } from './types';

import { scopeValues } from '@nizam-os/resource-core/server';

import { afterCommit } from './events';
import { operationFailure } from './failure';
import { Session } from './session';

/** How `work` settled. */
type Outcome<TResult> =
  | { readonly ok: true; readonly value: TResult }
  | { readonly ok: false; readonly error: unknown };

/** What the transaction's callback throws to roll back after a failure: the failure and how `work` settles. */
class Rollback extends Error {
  public readonly failure: Failure;
  public readonly outcome: Promise<Outcome<unknown>>;

  public constructor(failure: Failure, outcome: Promise<Outcome<unknown>>) {
    super('transaction: an operation failed');
    this.failure = failure;
    this.outcome = outcome;
  }
}

/** How `work` settles with the session's domain; the session refuses every call once it has. */
async function outcomeOf<TDomainOperations, TResult>(
  session: Session,
  domain: TDomainOperations,
  work: (domain: TDomainOperations) => Promise<TResult>,
): Promise<Outcome<TResult>> {
  try {
    return { ok: true, value: await work(domain) };
  } catch (error) {
    return { ok: false, error };
  } finally {
    session.close();
  }
}

/**
 * What `transaction` rejects with once a failure rolled it back: the
 * failure, mapped where its lifecycle raised it, unless `work` rejected
 * with another value.
 */
async function rolledBack<TDomain extends DomainShape>(
  options: DomainOptions<TDomain>,
  rollback: Rollback,
): Promise<unknown> {
  const { failure } = rollback;
  const outcome = await rollback.outcome;
  if (!outcome.ok && outcome.error !== failure.thrown) {
    return outcome.error;
  }
  if (failure.raised === undefined) {
    return failure.thrown;
  }
  const { storage, errors } = options;
  return operationFailure(failure.thrown, {
    storage,
    errors,
    ...failure.raised,
  });
}

/**
 * Runs `work` with the domain `domainOf` makes of the transaction's
 * session. Throws `TypeError` for a `work` that is not a function and for
 * an actor without a value for every scope, before any statement.
 */
export async function runTransaction<
  TDomain extends DomainShape,
  TDomainOperations,
  TResult,
>(
  options: DomainOptions<TDomain>,
  actor: TDomain['actor'],
  domainOf: (session: Session) => TDomainOperations,
  work: (domain: TDomainOperations) => Promise<TResult>,
): Promise<TResult> {
  if (typeof work !== 'function') {
    throw new TypeError('transaction: work must be a function');
  }
  const { storage, scopes } = options;
  const values = scopeValues(scopes, actor);
  try {
    const { recorded, value } = await storage.transaction(
      values,
      async (tx) => {
        const session = new Session(tx);
        const outcome = outcomeOf(session, domainOf(session), work);
        await Promise.race([outcome, session.failed]);
        await session.idle();
        if (session.failure !== undefined) {
          throw new Rollback(session.failure, outcome);
        }
        const settled = await outcome;
        if (!settled.ok) {
          throw settled.error;
        }
        return { recorded: session.recorded, value: settled.value };
      },
    );
    await afterCommit(options, recorded);
    return value;
  } catch (thrown) {
    throw thrown instanceof Rollback
      ? await rolledBack(options, thrown)
      : thrown;
  }
}
