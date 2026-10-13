/**
 * The reference storage adapter (resource SPEC 12.9): the obligations of
 * SPEC 12.8 in plain SQL, over a client that runs one parameterized
 * statement at a time, which shows the contract implementable before
 * `@nizam-os/kysely-resource` exists. Each transaction runs in UTC with ISO
 * dates, so values print one way, and first sets each scope's parameter
 * for the transaction only. Every statement on a scoped table carries the
 * scope's predicate; a create writes the scope column and the server
 * values; `lock` reads the row `FOR NO KEY UPDATE` before an update and
 * `FOR UPDATE` before a remove, as those writes lock it; `count` takes a
 * transaction-scoped advisory lock keyed by the resource, the quota, and
 * the scope value; `record` writes to an outbox table in the transaction;
 * `partitionRoot` runs resource-core's `PARTITION_ROOT_SQL` in a
 * transaction of its own. PostgreSQL's errors reach the caller as the
 * driver raised them, and a transaction whose run went on after a failed
 * statement rejects with that statement's error, since PostgreSQL turns
 * the COMMIT of an aborted transaction into a rollback that reports no
 * error. `list` plans the request with the declared resource's keyset
 * definition, defined once per resource with the server's configured
 * definer, and renders the plan as plain SQL (`reference-list.ts`).
 * @ref https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SET
 * @ref https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS
 * @ref https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/transam/xact.c (EndTransactionBlock: "Since COMMIT may actually do a ROLLBACK")
 */
import type { DefineDefaultedKeyset, Keyset } from '@nizam-os/keyset-core';
import type { DeclaredResource } from '@nizam-os/resource-core';
import type {
  PublicRow,
  StorageAdapter,
  ViolationNames,
} from '@nizam-os/resource-core/server';

import type {
  ReferenceTransaction,
  Row,
  SqlClient,
  SqlContext,
} from './reference-sql.ts';

import { PARTITION_ROOT_SQL } from '@nizam-os/resource-core/server';

import { keysetPage } from './reference-list.ts';
import { quoted, readRow, selectList } from './reference-sql.ts';
import { guarded, scopeOf, Statement } from './reference-statement.ts';

/** Runs `run` in one transaction: commits when it resolves, rolls back and rejects with its error when it rejects. */
export type Transact = <TResult>(
  run: (client: SqlClient) => Promise<TResult>,
) => Promise<TResult>;

/** What the adapter is built from. */
export interface ReferenceOptions extends SqlContext {
  readonly transact: Transact;
  /** The outbox: a table with `name text`, `version int4`, and `payload jsonb`. */
  readonly outbox: string;
  /** The server's configured definer, which holds the cursor secret (resource SPEC 11.2). */
  readonly defineKeyset: DefineDefaultedKeyset;
}

const SESSION =
  "select set_config('TimeZone', 'UTC', true), set_config('DateStyle', 'ISO, YMD', true)";
const SET_PARAMETER = 'select set_config($1, $2, true)';
const LOCK = 'select pg_advisory_xact_lock(hashtextextended($1::text, 0))';
/** The row lock each write takes, which `lock` takes first. */
const ROW_LOCKS = {
  update: ' for no key update',
  remove: ' for update',
} as const;

/** The names a row of `PARTITION_ROOT_SQL` holds, without a constraint when it has none. */
function rootNames(row: Row): ViolationNames {
  const { schema, table, constraint } = row;
  if (typeof schema !== 'string' || typeof table !== 'string') {
    throw new TypeError('partitionRoot: the query returned no table');
  }
  return typeof constraint === 'string'
    ? { schema, table, constraint }
    : { schema, table };
}

/** The adapter over `options.transact`. */
export function referenceAdapter(
  options: ReferenceOptions,
): StorageAdapter<ReferenceTransaction> {
  const context: SqlContext = options;
  const keysets = new WeakMap<DeclaredResource, Keyset>();
  const keysetOf = (resource: DeclaredResource): Keyset => {
    const known = keysets.get(resource);
    if (known !== undefined) {
      return known;
    }
    const keyset = options.defineKeyset(resource.keyset);
    keysets.set(resource, keyset);
    return keyset;
  };
  const one = async (
    tx: ReferenceTransaction,
    resource: DeclaredResource,
    sql: string,
    statement: Statement,
  ): Promise<PublicRow | undefined> => {
    const [row] = await tx.client.query(sql, statement.parameters.values);
    return row === undefined ? undefined : readRow(context, resource, row);
  };
  const read = async (
    tx: ReferenceTransaction,
    resource: DeclaredResource,
    id: string,
    locking = '',
  ): Promise<PublicRow | undefined> => {
    const statement = new Statement(context, resource, tx);
    const where = statement.row(id);
    const sql = `select ${selectList(context, resource)} from ${statement.name} where ${where}${locking}`;
    return one(tx, resource, sql, statement);
  };
  const get = async (
    tx: ReferenceTransaction,
    resource: DeclaredResource,
    id: string,
  ): Promise<PublicRow | undefined> => read(tx, resource, id);
  return {
    transaction: async (scopes, run) =>
      options.transact(async (connection) => {
        const { client, failures } = guarded(connection);
        await client.query(SESSION, []);
        for (const scope of scopes) {
          await client.query(SET_PARAMETER, [
            scope.session,
            String(scope.value),
          ]);
        }
        const result = await run({ client, scopes });
        const [failure] = failures;
        if (failures.length > 0) {
          throw failure;
        }
        return result;
      }),
    list: async (tx, resource, request) =>
      keysetPage(context, keysetOf(resource), tx, resource, request),
    get,
    lock: async (tx, resource, id, write) =>
      read(tx, resource, id, ROW_LOCKS[write]),
    create: async (tx, resource, input) => {
      const statement = new Statement(context, resource, tx);
      const pairs = statement.assignments(input, true);
      const values =
        pairs.length === 0
          ? 'default values'
          : `(${pairs.map(([column]) => column).join(', ')}) values (${pairs.map(([, value]) => value).join(', ')})`;
      const sql = `insert into ${statement.name} ${values} returning ${selectList(context, resource)}`;
      const row = await one(tx, resource, sql, statement);
      if (row === undefined) {
        throw new Error(`${resource.names.type}: the insert returned no row`);
      }
      return row;
    },
    update: async (tx, resource, id, input) => {
      const statement = new Statement(context, resource, tx);
      const pairs = statement.assignments(input, false);
      if (pairs.length === 0) {
        return get(tx, resource, id);
      }
      const set = pairs
        .map(([column, value]) => `${column} = ${value}`)
        .join(', ');
      const where = statement.row(id);
      const sql = `update ${statement.name} set ${set} where ${where} returning ${selectList(context, resource)}`;
      return one(tx, resource, sql, statement);
    },
    remove: async (tx, resource, id) => {
      const statement = new Statement(context, resource, tx);
      const sql = `delete from ${statement.name} where ${statement.row(id)} returning 1 as "removed"`;
      const rows = await tx.client.query(sql, statement.parameters.values);
      return rows.length > 0;
    },
    count: async (tx, resource, quota) => {
      const statement = new Statement(context, resource, tx);
      const scope = scopeOf(resource, tx);
      const key = JSON.stringify([
        resource.names.type,
        quota,
        scope?.value ?? null,
      ]);
      await tx.client.query(LOCK, [key]);
      const sql = `select count(*)::text as "count" from ${statement.name} where ${statement.scoped()}`;
      const [row] = await tx.client.query(sql, statement.parameters.values);
      return Number(row?.['count']);
    },
    partitionRoot: async (names) =>
      options.transact(async (client) => {
        const [row] = await client.query(PARTITION_ROOT_SQL, [
          names.schema,
          names.table,
          names.constraint ?? null,
        ]);
        return row === undefined ? undefined : rootNames(row);
      }),
    record: async (tx, events) => {
      const sql = `insert into ${quoted(options.outbox)} (name, version, payload) values ($1::text, $2::text::int4, $3::text::jsonb)`;
      for (const event of events) {
        await tx.client.query(sql, [
          event.name,
          String(event.version),
          JSON.stringify(event.payload),
        ]);
      }
    },
  };
}
