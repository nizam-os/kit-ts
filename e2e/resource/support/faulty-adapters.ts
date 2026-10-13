/**
 * The reference adapter with one defect each, for the faults of
 * `contract-faults.ts` (resource SPEC 12.9): built over statements that
 * pass through a rewrite, wrapped, or handed past its guard.
 */
import type { DefineDefaultedKeyset } from '@nizam-os/keyset-core';
import type {
  DomainEvent,
  StorageAdapter,
  StorageWrite,
} from '@nizam-os/resource-core/server';

import type { ContractDatabase } from './contract-database.ts';
import type { Transact } from './reference-adapter.ts';
import type { ReferenceTransaction, Row, SqlClient } from './reference-sql.ts';

import { contractFixture } from '@nizam-os/resource-core/testing';

import { OUTBOX, POINT_TEXT } from './contract-database.ts';
import { DEFINE_KEYSET } from './keyset-definer.ts';
import { referenceAdapter } from './reference-adapter.ts';

/** The reference adapter's type. */
export type Adapter = StorageAdapter<ReferenceTransaction>;

/** A statement as sent, rewritten, or `undefined` to skip it. */
export type Rewrite = (sql: string) => string | undefined;

/** Builds the adapter with a defect over a database. */
export type FaultyAdapter = (database: ContractDatabase) => Adapter;

const NO_ROWS: ReadonlyArray<Row> = [];
/** The writable attributes of tasks but the title. */
const NULLABLE = [
  'estimate',
  'points',
  'dueOn',
  'startsAt',
  'tags',
  'details',
  'done',
  'location',
  'secret',
];

export function reference(
  transact: Transact,
  defineKeyset: DefineDefaultedKeyset = DEFINE_KEYSET,
): Adapter {
  return referenceAdapter({
    catalog: contractFixture.catalog,
    codecs: { point: POINT_TEXT },
    outbox: OUTBOX,
    defineKeyset,
    transact,
  });
}

/** The suite's keyset definer, whose keysets plan without the caller's context. */
export const CONTEXTLESS: DefineDefaultedKeyset = (init) => {
  const keyset = DEFINE_KEYSET(init);
  return { ...keyset, plan: async (request) => keyset.plan(request) };
};

function rewritten(client: SqlClient, rewrite: Rewrite): SqlClient {
  return {
    query: async (sql, parameters) => {
      const statement = rewrite(sql);
      return statement === undefined
        ? NO_ROWS
        : client.query(statement, parameters);
    },
  };
}

/** The reference adapter whose statements pass through `rewrite`. */
export function rewriting(rewrite: Rewrite): FaultyAdapter {
  return (database) =>
    reference(async (run) =>
      database.transact(async (client) => run(rewritten(client, rewrite))),
    );
}

/** The reference adapter, wrapped. */
export function wrapping(wrap: (adapter: Adapter) => Adapter): FaultyAdapter {
  return (database) => wrap(reference(database.transact));
}

/** `input` with every writable attribute of tasks it leaves out set to `null`. */
export function withNulls(input: StorageWrite): StorageWrite {
  return {
    ...input,
    attributes: {
      ...Object.fromEntries(NULLABLE.map((name) => [name, null])),
      ...input.attributes,
    },
  };
}

/** Records into a list kept per transaction, written in a transaction of its own after the run, whatever its outcome. */
export function outboxAfterRun(adapter: Adapter): Adapter {
  const pending = new WeakMap<ReferenceTransaction, Array<DomainEvent>>();
  return {
    ...adapter,
    transaction: async (scopes, run) => {
      const events: Array<DomainEvent> = [];
      try {
        return await adapter.transaction(scopes, async (tx) => {
          pending.set(tx, events);
          return run(tx);
        });
      } finally {
        await adapter.transaction([], async (tx) => adapter.record(tx, events));
      }
    },
    record: async (tx, events) => {
      await Promise.resolve();
      pending.get(tx)?.push(...events);
    },
  };
}

/** Hands each run the database's own client, past the guard that sees a statement fail. */
export function unguarded(database: ContractDatabase): Adapter {
  const clients: Array<SqlClient> = [];
  const adapter = reference(async (run) =>
    database.transact(async (client) => {
      clients.push(client);
      return run(client);
    }),
  );
  return {
    ...adapter,
    transaction: async (scopes, run) =>
      adapter.transaction(scopes, async (tx) =>
        run({ ...tx, client: clients.at(-1) ?? tx.client }),
      ),
  };
}
