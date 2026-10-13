/**
 * Quotas (SPEC 18.2, obligation 8 of resource SPEC 12.8): `count` takes a
 * transaction-scoped advisory lock keyed by the resource's type, the
 * quota, and the scope's value, then counts the resource's rows in the
 * scope. The lock holds until the transaction ends, so a second count of
 * the same quota and scope value waits for the first transaction's insert
 * to commit or roll back: the count and the insert after it are atomic.
 * @ref https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/hash/hashfunc.c (hashtextextended: a 64-bit hash of text with a seed)
 * @packageDocumentation
 */
import type { DeclaredResource } from '@nizam-os/resource-core';

import type { KyselyTransaction } from './transaction';
import type { ValueContext } from './values';

import { sql } from 'kysely';

import { scopeOf, scopePredicate } from './scope';
import { tableName, tableOf } from './sql';

/** The resource's rows in the transaction's scope, counted under the lock of `quota` and the scope's value. */
export async function countRows(
  context: ValueContext,
  tx: KyselyTransaction,
  resource: DeclaredResource,
  quota: string,
): Promise<number> {
  const table = tableOf(context.catalog, resource);
  const key = JSON.stringify([
    resource.names.type,
    quota,
    scopeOf(resource, tx)?.value ?? null,
  ]);
  await tx.execute((db) =>
    sql`select pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`.compile(
      db,
    ),
  );
  const [row] = await tx.execute((db) =>
    sql<{
      count: string;
    }>`select count(*)::text as "count" from ${tableName(table)} where ${scopePredicate(context.catalog, table, resource, tx)}`.compile(
      db,
    ),
  );
  return Number(row?.count);
}
