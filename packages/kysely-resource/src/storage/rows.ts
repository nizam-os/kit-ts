import type { RawBuilder } from 'kysely';

/**
 * The row operations (SPEC 18.2, obligations 4, 7, and 10 of resource SPEC
 * 12.8). `get` and `lock` select the public row by its key within the
 * scope; `lock` appends the row lock its write will take, `FOR NO KEY
 * UPDATE` before an update and `FOR UPDATE` before a remove, which also
 * keeps another transaction from adding a reference to the row. `create`
 * inserts exactly the members present, the client id, the server values,
 * and the scope column, so the database's defaults apply to the rest;
 * `update` sets exactly the members present. Both return the public row
 * the database holds after the write, through `returning`. A row outside
 * the scope is absent.
 * @ref https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS
 * @ref https://www.postgresql.org/docs/18/sql-insert.html (DEFAULT VALUES; RETURNING)
 * @packageDocumentation
 */
import type { DeclaredResource } from '@nizam-os/resource-core';
import type { PublicRow, StorageWrite } from '@nizam-os/resource-core/server';

import type { KyselyTransaction } from './transaction';
import type { Row, ValueContext } from './values';

import { sql } from 'kysely';

import { scopeOf, scopePredicate } from './scope';
import { tableName, tableOf } from './sql';
import { assignments, keyPredicate, selectList } from './statement';
import { readRow } from './values';

/** The row lock each write takes, which `lock` takes first. */
const ROW_LOCKS: Readonly<Record<'update' | 'remove', RawBuilder<unknown>>> = {
  update: sql`for no key update`,
  remove: sql`for update`,
};

/** The row of the resource whose key is `id` in the transaction's scope, locked as `write` will lock it when given. */
export async function selectRow(
  context: ValueContext,
  tx: KyselyTransaction,
  resource: DeclaredResource,
  id: string,
  write?: 'update' | 'remove',
): Promise<PublicRow | undefined> {
  const table = tableOf(context.catalog, resource);
  const lock = write === undefined ? sql`` : sql` ${ROW_LOCKS[write]}`;
  const [row] = await tx.execute((db) =>
    sql<Row>`select ${selectList(context, table, resource)} from ${tableName(table)} where ${keyPredicate(context, table, resource, id)} and ${scopePredicate(context.catalog, table, resource, tx)}${lock}`.compile(
      db,
    ),
  );
  return row === undefined ? undefined : readRow(context, table, resource, row);
}

/**
 * Whether the row of the resource whose key is `id` exists in the
 * transaction's scope, as the actor sees it: under the scope's predicate
 * and the table's row security, which a foreign key's check bypasses. It
 * reads no column, so a row with a value that has no read form is found
 * too.
 */
export async function rowExists(
  context: ValueContext,
  tx: KyselyTransaction,
  resource: DeclaredResource,
  id: string,
): Promise<boolean> {
  const table = tableOf(context.catalog, resource);
  const rows = await tx.execute((db) =>
    sql`select 1 as "found" from ${tableName(table)} where ${keyPredicate(context, table, resource, id)} and ${scopePredicate(context.catalog, table, resource, tx)}`.compile(
      db,
    ),
  );
  return rows.length > 0;
}

/** Inserts the members of `input`, its client id, its server values, and the scope column; returns the stored row. */
export async function insertRow(
  context: ValueContext,
  tx: KyselyTransaction,
  resource: DeclaredResource,
  input: StorageWrite,
): Promise<PublicRow> {
  const table = tableOf(context.catalog, resource);
  const pairs = assignments(context, table, resource, input, {
    scope: scopeOf(resource, tx),
  });
  const values =
    pairs.length === 0
      ? sql`default values`
      : sql`(${sql.join(pairs.map((pair) => pair.column))}) values (${sql.join(pairs.map((pair) => pair.value))})`;
  const [row] = await tx.execute((db) =>
    sql<Row>`insert into ${tableName(table)} ${values} returning ${selectList(context, table, resource)}`.compile(
      db,
    ),
  );
  if (row === undefined) {
    throw new Error(`${resource.names.type}: the insert returned no row`);
  }
  return readRow(context, table, resource, row);
}

/** Sets the members of `input` on the row whose key is `id` in the scope; `undefined` when there is none. */
export async function updateRow(
  context: ValueContext,
  tx: KyselyTransaction,
  resource: DeclaredResource,
  id: string,
  input: StorageWrite,
): Promise<PublicRow | undefined> {
  const table = tableOf(context.catalog, resource);
  const pairs = assignments(context, table, resource, input);
  if (pairs.length === 0) {
    return selectRow(context, tx, resource, id);
  }
  const set = sql.join(
    pairs.map((pair) => sql`${pair.column} = ${pair.value}`),
  );
  const [row] = await tx.execute((db) =>
    sql<Row>`update ${tableName(table)} set ${set} where ${keyPredicate(context, table, resource, id)} and ${scopePredicate(context.catalog, table, resource, tx)} returning ${selectList(context, table, resource)}`.compile(
      db,
    ),
  );
  return row === undefined ? undefined : readRow(context, table, resource, row);
}

/** Deletes the row whose key is `id` in the scope; whether there was one. */
export async function deleteRow(
  context: ValueContext,
  tx: KyselyTransaction,
  resource: DeclaredResource,
  id: string,
): Promise<boolean> {
  const table = tableOf(context.catalog, resource);
  const rows = await tx.execute((db) =>
    sql`delete from ${tableName(table)} where ${keyPredicate(context, table, resource, id)} and ${scopePredicate(context.catalog, table, resource, tx)} returning 1 as "removed"`.compile(
      db,
    ),
  );
  return rows.length > 0;
}
