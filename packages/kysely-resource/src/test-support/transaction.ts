/**
 * What the tests of `transaction(actor, work)` share (resource SPEC
 * 18.4): a database with an outbox, the storage over it, the statements
 * Kysely ran, the events `afterCommit` received, and `runTransaction` as
 * the runtime calls it, with the domain a test calls by name.
 */
import type { DomainEvent } from '@nizam-os/resource-core/server';

import type { DomainOptions } from '../runtime/types';
import type { KyselyStorage } from '../storage/types';
import type { TestDatabase } from './database';
import type { Member, MemberApi, TestDomain } from './domain';

import { createDomain } from '../runtime/domain';
import { runTransaction } from '../runtime/transaction';
import { domainOptions, memberApi } from './domain';
import { domainDatabase, domainStorage, taskTitles } from './domain-database';

/** One test file's database and what it observed. */
export interface TransactionHarness {
  readonly database: TestDatabase;
  readonly storage: KyselyStorage;
  /** The domain's options, whose `afterCommit` pushes onto `committed`. */
  readonly options: DomainOptions<TestDomain>;
  readonly statements: Array<string>;
  readonly committed: Array<ReadonlyArray<DomainEvent>>;
  /** Runs `work` in a transaction as `actor`, over `options` or the harness's. */
  readonly transaction: <TResult>(
    actor: Member,
    work: (domain: MemberApi) => Promise<TResult>,
    options?: DomainOptions<TestDomain>,
  ) => Promise<TResult>;
  /** The titles of workspace 1's tasks, in title order. */
  readonly titles: () => Promise<ReadonlyArray<string>>;
  /** Seeds the database again and forgets what was observed. */
  readonly reset: () => Promise<void>;
}

/** A harness over a database of its own. */
export function transactionHarness(): TransactionHarness {
  const statements: Array<string> = [];
  const committed: Array<ReadonlyArray<DomainEvent>> = [];
  const database = domainDatabase((event) => {
    statements.push(event.query.sql);
  });
  const storage = domainStorage(database.db);
  const options = domainOptions(storage, {
    afterCommit: (events) => {
      committed.push(events);
    },
  });
  return {
    database,
    storage,
    options,
    statements,
    committed,
    transaction: async (actor, work, given = options) => {
      const as = createDomain(given);
      return runTransaction(
        given,
        actor,
        (session) => memberApi(as(actor, session)),
        work,
      );
    },
    titles: async () => taskTitles(database.db, '1'),
    reset: async () => {
      await database.reset();
      statements.length = 0;
      committed.length = 0;
    },
  };
}
