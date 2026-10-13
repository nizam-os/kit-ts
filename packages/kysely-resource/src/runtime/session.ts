/**
 * One `transaction(actor, work)` (resource SPEC 12.10, 18.4): the storage
 * transaction its domain's operations share, the events they record, and
 * the first failure, which ends it. The operations run one at a time, as
 * a connection runs one statement at a time: a call while another is
 * pending, once one failed, or once `work` settled rejects with a
 * `TypeError`. A failed statement aborts a PostgreSQL transaction, so
 * nothing after the first failure could commit. The failure is kept as
 * the operation threw it, with the resource and the operation its
 * lifecycle raised it in, so it is mapped once the transaction ended, as
 * the operation alone maps it (SPEC 18.5).
 * @ref https://www.postgresql.org/docs/18/tutorial-transactions.html
 * @packageDocumentation
 */
import type { AnyDeclaredResource, Operation } from '@nizam-os/resource-core';
import type {
  DomainEvent,
  FilterParameter,
} from '@nizam-os/resource-core/server';

import type { KyselyTransaction } from '../storage/transaction';

/** The work of one operation: it pushes the events it records onto `recorded`. */
export type Work<TResult> = (
  tx: KyselyTransaction,
  recorded: Array<DomainEvent>,
) => Promise<TResult>;

/** Where an operation's lifecycle raised a failure, which is where it is mapped. */
interface Raised {
  readonly thrown: unknown;
  readonly resource: AnyDeclaredResource;
  readonly operation: Operation;
  /** A list's filter parameters, which name a refused value's parameter. */
  readonly parameters?: ReadonlyArray<FilterParameter> | undefined;
}

/** The first operation's failure: what it threw, and where its lifecycle raised it, when it did. */
export interface Failure {
  readonly thrown: unknown;
  readonly raised?: Omit<Raised, 'thrown'> | undefined;
}

/** Settles a promise's outcome without observing it. */
function ignore(): void {
  // reason: the call that awaits the operation observes its outcome
}

/** The domain's shared transaction and what its operations left in it. */
export class Session {
  /** The transaction every operation runs in. */
  public readonly tx: KyselyTransaction;
  /** The events every operation recorded, in their order. */
  public readonly recorded: Array<DomainEvent> = [];
  /** Resolves once the first operation failed. */
  public readonly failed: Promise<void>;
  #fail: () => void = ignore;
  #failure: Failure | undefined;
  #raised: Raised | undefined;
  #pending: Promise<unknown> | undefined;
  #closed = false;

  public constructor(tx: KyselyTransaction) {
    this.tx = tx;
    this.failed = new Promise((resolve) => {
      this.#fail = resolve;
    });
  }

  /** The first operation's failure, once one failed. */
  public get failure(): Failure | undefined {
    return this.#failure;
  }

  /** Refuses every call from now on: `work` settled. */
  public close(): void {
    this.#closed = true;
  }

  /** Resolves once no call is pending. */
  public async idle(): Promise<void> {
    await this.#pending?.then(ignore, ignore);
  }

  /**
   * Runs one call of an operation; rejects with a `TypeError`, running
   * nothing, while another call is pending, once one failed, or once
   * closed. The first call that fails rejects with what it threw and ends
   * the session.
   */
  public async call<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    this.#admit();
    const running = operation();
    this.#pending = running;
    try {
      return await running;
    } catch (thrown) {
      const raised = this.#raised;
      this.#failure = {
        thrown,
        raised:
          raised !== undefined && raised.thrown === thrown
            ? {
                resource: raised.resource,
                operation: raised.operation,
                parameters: raised.parameters,
              }
            : undefined,
      };
      this.#fail();
      throw thrown;
    } finally {
      this.#pending = undefined;
    }
  }

  /** Runs an operation's lifecycle in the transaction, noting where it raised what it throws. */
  public async inside<TResult>(
    resource: AnyDeclaredResource,
    operation: Operation,
    work: Work<TResult>,
    parameters?: ReadonlyArray<FilterParameter>,
  ): Promise<TResult> {
    try {
      return await work(this.tx, this.recorded);
    } catch (thrown) {
      this.#raised ??= { thrown, resource, operation, parameters };
      throw thrown;
    }
  }

  /** Throws the `TypeError` of a call the session refuses. */
  #admit(): void {
    if (this.#failure !== undefined) {
      throw new TypeError(
        'transaction: an operation was called after an earlier one failed, which ended the transaction',
      );
    }
    if (this.#closed) {
      throw new TypeError(
        'transaction: an operation was called after work settled',
      );
    }
    if (this.#pending !== undefined) {
      throw new TypeError(
        'transaction: an operation was called while another was pending; await each before the next',
      );
    }
  }
}
