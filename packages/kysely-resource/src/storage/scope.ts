import type { RawBuilder, SqlBool } from 'kysely';

/**
 * The scope predicate (SPEC 18.2, obligation 2 of resource SPEC 12.8):
 * every statement on a scoped table carries `"column" = $n::text::<type>`
 * for the transaction's value of the resource's scope, so a row of another
 * scope is out of reach even where no row security policy applies; with
 * one, the predicate and the policy both hold. A resource without a scope
 * gets `true`, and runs only when boot allowed it (SPEC 18.3).
 * @packageDocumentation
 */
import type { PublicCatalog, PublicTable } from '@nizam-os/catalog-core';
import type { DeclaredResource } from '@nizam-os/resource-core';
import type { ScopeValue } from '@nizam-os/resource-core/server';

import type { KyselyTransaction } from './transaction';

import { sql } from 'kysely';

import { columnOf, typed } from './sql';

/**
 * The transaction's value of the resource's scope; `undefined` for a
 * resource without one. Throws when the transaction has none, since a
 * statement without its predicate would reach every scope.
 */
export function scopeOf(
  resource: DeclaredResource,
  tx: KyselyTransaction,
): ScopeValue | undefined {
  const name = resource.declaration.scope;
  if (name === undefined) {
    return undefined;
  }
  const scope = tx.scopes.find((value) => value.scope === name);
  if (scope === undefined) {
    throw new Error(
      `${resource.names.type}: the transaction has no value for scope ${name}`,
    );
  }
  return scope;
}

/** `"column" = $n::text::<type>` for the resource's scope in `tx`, or `true` for a resource without one. */
export function scopePredicate(
  catalog: PublicCatalog,
  table: PublicTable,
  resource: DeclaredResource,
  tx: KyselyTransaction,
): RawBuilder<SqlBool> {
  const scope = scopeOf(resource, tx);
  if (scope === undefined) {
    return sql<SqlBool>`true`;
  }
  const column = columnOf(table, scope.column);
  return sql<SqlBool>`${sql.id(scope.column)} = ${typed(catalog, column, String(scope.value))}`;
}
