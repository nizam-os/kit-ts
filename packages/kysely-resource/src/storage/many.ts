/**
 * `many` (SPEC 18.4): the public rows whose key is any of the ids, in the
 * transaction's scope, in one statement,
 * `where "key" = any($1::text::<key type>[])`, for the targets of an
 * include. A row outside the scope is left out, as `get` would find no
 * row, and an id given twice selects its row once.
 * @ref https://www.postgresql.org/docs/18/functions-comparisons.html#FUNCTIONS-COMPARISONS-ANY-SOME
 * @packageDocumentation
 */
import type { DeclaredResource } from '@nizam-os/resource-core';
import type { PublicRow } from '@nizam-os/resource-core/server';

import type { KyselyTransaction } from './transaction';
import type { Row, ValueContext } from './values';

import { sql } from 'kysely';

import { arrayLiteral } from './array-literal';
import { scopePredicate } from './scope';
import { castType, columnOf, tableName, tableOf } from './sql';
import { selectList } from './statement';
import { readRow } from './values';

/** The rows of the resource whose key is any of `ids`, in the transaction's scope; none for no ids. */
export async function manyRows(
  context: ValueContext,
  tx: KyselyTransaction,
  resource: DeclaredResource,
  ids: ReadonlyArray<string>,
): Promise<ReadonlyArray<PublicRow>> {
  if (ids.length === 0) {
    return [];
  }
  const table = tableOf(context.catalog, resource);
  const key = resource.names.id;
  const keys = sql`${arrayLiteral(ids)}::text::${castType(context.catalog, columnOf(table, key))}[]`;
  const rows = await tx.execute((db) =>
    sql<Row>`select ${selectList(context, table, resource)} from ${tableName(table)} where ${sql.id(key)} = any(${keys}) and ${scopePredicate(context.catalog, table, resource, tx)}`.compile(
      db,
    ),
  );
  return rows.map((row) => readRow(context, table, resource, row));
}
