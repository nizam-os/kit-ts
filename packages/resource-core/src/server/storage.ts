/**
 * The storage adapter contract (SPEC 12.8): what an adapter implements so a
 * runtime can run every declared operation over it, and what it promises.
 * An adapter MUST:
 *
 * 1. run each operation in one transaction that begins by setting every
 *    scope's parameter for that transaction only, rolls back when its run
 *    rejects, and rejects with what the run threw, unchanged, or with the
 *    error of a statement that failed when the run went on, since
 *    PostgreSQL turns the COMMIT of an aborted transaction into a rollback
 *    that reports no error;
 * 2. add each scope's predicate to every statement on a scoped table;
 * 3. return public rows in the read forms of SPEC 5, through the storage
 *    codecs for codec fields, and fail a read whose stored value has no
 *    read form instead of emitting another value;
 * 4. insert or update exactly the members present in the input, plus the
 *    scope column and the server values on create, and nothing else
 *    (ADR 0004): an update without members changes nothing;
 * 5. page `list` with the declared resource's keyset definition and
 *    `@nizam-os/keyset-core`'s planner, filters and sorts addressed by
 *    public names, every value of the plan a parameter of its column's
 *    type, a cursor's included, never by counting rows;
 * 6. let every PostgreSQL error raised inside an operation reach the
 *    runtime with its fields, as thrown or as the `cause` of what is
 *    thrown, so the runtime's `constraintError` (SPEC 9.5) maps it;
 * 7. treat a row outside the actor's scope as absent for `get`, `lock`,
 *    `update`, and `remove`;
 * 8. make `count` and the following insert atomic per quota and scope
 *    value;
 * 9. write recorded events in the operation's transaction;
 * 10. hold the row `lock` returns until the transaction ends, locked at
 *    least as the write it names will lock it: `FOR NO KEY UPDATE` before
 *    an update, `FOR UPDATE` before a remove, which also keeps another
 *    transaction from adding a reference to the row;
 * 11. answer `partitionRoot` outside any operation, as
 *    `PARTITION_ROOT_SQL` does: for a partition, the partitioned table at
 *    the top of its tree and that table's name for the constraint, when it
 *    has one; for any other table, `undefined`.
 *
 * `storageContract` (`@nizam-os/resource-core/testing`) checks them.
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/transam/xact.c (EndTransactionBlock: "Since COMMIT may actually do a ROLLBACK")
 * @ref https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/ (offset pages shift when a row of an earlier page goes away)
 * @packageDocumentation
 */
import type { KeysetRequest, NoRelations, Page } from '@nizam-os/keyset-core';

import type { DeclaredResource } from '../declare/declared-resource';
import type { DomainEvent } from './event';
import type { ScopeValue } from './scope';
import type { ViolationNames } from './violation-names';

/**
 * A row as the API reads it: `id`, each readable field, and each
 * relationship's target id or `null`, by public name, in the read forms of
 * SPEC 5. A `write` field is never read.
 */
export interface PublicRow {
  readonly id: string;
  readonly [member: string]: unknown;
}

/** A create's or an update's members, by public name: only those the request carried (ADR 0004). */
export interface StorageWrite {
  /** A create's client-generated id, when the declaration accepts one (SPEC 3.4). */
  readonly id?: string | undefined;
  /** Parsed field values (SPEC 6.2). */
  readonly attributes: Readonly<Record<string, unknown>>;
  /** Each relationship's target id, or `null` to clear it. */
  readonly relationships: Readonly<Record<string, string | null>>;
  /** A create's server values (SPEC 12.3), by column. */
  readonly values?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * A `list` request: filters, sorts, search, and page, addressed by public
 * names. It is what the declared resource's keyset definition plans, which
 * has no relations (SPEC 11.2), so no filter reaches through one.
 */
export type StorageListRequest = KeysetRequest<string, string, NoRelations>;

/** A page of public rows, with the cursors `@nizam-os/keyset-core` signs. */
export type StoragePage = Page<PublicRow>;

/** What an adapter implements; `TTransaction` is its own transaction handle. */
export interface StorageAdapter<TTransaction> {
  /** Runs `run` in one transaction that first sets each scope's parameter for that transaction only. */
  transaction<TResult>(
    scopes: ReadonlyArray<ScopeValue>,
    run: (tx: TTransaction) => Promise<TResult>,
  ): Promise<TResult>;
  list(
    tx: TTransaction,
    resource: DeclaredResource,
    request: StorageListRequest,
  ): Promise<StoragePage>;
  /** The row, or `undefined` when it does not exist in the actor's scope. */
  get(
    tx: TTransaction,
    resource: DeclaredResource,
    id: string,
  ): Promise<PublicRow | undefined>;
  /**
   * The row, locked until the transaction ends as `write` will lock it, or
   * `undefined` when it does not exist in the actor's scope. The runtime
   * reads the row of an update or a remove this way, so the row its
   * policy and rules decide on is the row the write changes.
   */
  lock(
    tx: TTransaction,
    resource: DeclaredResource,
    id: string,
    write: 'update' | 'remove',
  ): Promise<PublicRow | undefined>;
  /** Inserts the members of `input`, the scope column, and the server values; returns the stored row. */
  create(
    tx: TTransaction,
    resource: DeclaredResource,
    input: StorageWrite,
  ): Promise<PublicRow>;
  /** Updates the members of `input`; `undefined` when the row does not exist in the actor's scope. */
  update(
    tx: TTransaction,
    resource: DeclaredResource,
    id: string,
    input: StorageWrite,
  ): Promise<PublicRow | undefined>;
  /** Deletes the row; `false` when it does not exist in the actor's scope. */
  remove(
    tx: TTransaction,
    resource: DeclaredResource,
    id: string,
  ): Promise<boolean>;
  /** The resource's rows in the actor's scope, counted under the lock of `quota` and that scope's value. */
  count(
    tx: TTransaction,
    resource: DeclaredResource,
    quota: string,
  ): Promise<number>;
  /** Writes `events` to the outbox in the transaction. */
  record(tx: TTransaction, events: ReadonlyArray<DomainEvent>): Promise<void>;
  /**
   * What a violation a partition raised names in the partitioned table at
   * the top of the partition's tree: the table, and its constraint or
   * unique index that `names.constraint` was cloned from, is attached to,
   * or inherits, when there is one. `undefined` when `names.table` is not
   * a partition. The runtime calls it after the operation's transaction
   * ended, with what `partitionViolation` gave.
   */
  partitionRoot(names: ViolationNames): Promise<ViolationNames | undefined>;
}
