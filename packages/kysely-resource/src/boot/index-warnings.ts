/**
 * The warnings of boot (SPEC 18.3), about indexes. A page sorted by a
 * member reads its rows in order from a btree index that starts with the
 * scope column and then the member's column, so without one it sorts
 * every row of the scope. A unique index that leaves out the scope column
 * answers 409 for a value another scope holds, since PostgreSQL checks
 * uniqueness without row security, which tells the actor the value exists
 * there; the warning names each such index over a value the client
 * writes. An index keeps to one scope without the scope column when it
 * holds a reference the runtime looks up in the actor's scope, whose
 * every value names a row of that scope, or covers only rows without a
 * scope, which no scoped write makes.
 * @ref https://www.postgresql.org/docs/18/indexes-ordering.html
 * @ref https://www.postgresql.org/docs/18/ddl-rowsecurity.html (unique and primary key constraints always bypass row security)
 * @ref https://www.postgresql.org/docs/18/indexes-unique.html (NULLS NOT DISTINCT)
 * @packageDocumentation
 */
import type { CatalogIndex, CatalogTable } from '@nizam-os/catalog-core';
import type { DeclaredResource } from '@nizam-os/resource-core';

import type { BootContext } from './options';

import {
  relationshipTargets,
  scopeColumnOf,
} from '@nizam-os/resource-core/server';

import { ownValue } from '../internal/object';

const WRITES: ReadonlySet<string> = new Set([
  'readWrite',
  'immutable',
  'write',
]);

/** Whether `index` is a btree index without a predicate whose key columns begin with `leading`. */
function begins(index: CatalogIndex, leading: ReadonlyArray<string>): boolean {
  return (
    index.method === 'btree' &&
    index.predicate === null &&
    leading.every((column, position) => index.columns[position] === column)
  );
}

/** A warning per sortable member no index serves. */
function sortWarnings(
  resource: DeclaredResource,
  table: CatalogTable,
  scope: string | undefined,
): ReadonlyArray<string> {
  const indexes = Object.values(table.indexes);
  return Object.values(resource.fields)
    .filter((meta) => meta.sortable)
    .flatMap((meta) => {
      const leading =
        scope === undefined ? [meta.column] : [scope, meta.column];
      return indexes.some((index) => begins(index, leading))
        ? []
        : [
            `${resource.names.type}: no btree index on ${resource.table} begins with (${leading.join(', ')}), so a page sorted by ${meta.name} sorts every row${scope === undefined ? '' : ' of the scope'}`,
          ];
    });
}

/** The id a write names each relationship by below; `relationshipTargets` reads no id but to skip a self-reference. */
const NAMED = 'named';

/**
 * The columns whose every value names a row of the resource's own scope:
 * the relationships the runtime looks up in the actor's scope before a
 * write (SPEC 12.3), as `relationshipTargets` lists them for a write that
 * names each one, whose targets have the same scope.
 */
function scopedReferences(resource: DeclaredResource): ReadonlySet<string> {
  const relationships = Object.values(resource.fields).filter(
    (meta) => meta.kind === 'relationship',
  );
  const write = {
    attributes: {},
    relationships: Object.fromEntries(
      relationships.map((meta) => [meta.name, NAMED]),
    ),
  };
  const looked = new Set(
    relationshipTargets(resource, write)
      .filter(
        (target) =>
          target.resource.declaration.scope === resource.declaration.scope,
      )
      .map((target) => target.relationship),
  );
  return new Set(
    relationships
      .filter((meta) => looked.has(meta.name))
      .map((meta) => meta.column),
  );
}

/** Whether `predicate`, as `pg_get_expr` prints it, keeps only the rows whose scope column is null; a column that needs quotes is not matched, and warns. */
function unscopedOnly(predicate: string | null, scope: string): boolean {
  return predicate === `(${scope} IS NULL)`;
}

/** Whether `index` holds the values of one scope only. */
function keepsToScope(
  index: CatalogIndex,
  table: CatalogTable,
  scope: string,
  references: ReadonlySet<string>,
): boolean {
  return (
    index.columns.includes(scope) ||
    unscopedOnly(index.predicate, scope) ||
    // A null names no row: it keeps to the scope only while nulls never conflict.
    index.columns.some(
      (column) =>
        column !== null &&
        references.has(column) &&
        (index.nullsDistinct ||
          ownValue(table.columns, column)?.nullable === false),
    )
  );
}

/** A warning per unique index that does not keep to the scope and holds a value the client writes; a primary key over the id holds none, since the id is no member. */
function uniqueWarnings(
  resource: DeclaredResource,
  table: CatalogTable,
  scope: string,
): ReadonlyArray<string> {
  const written = new Set(
    Object.values(resource.fields)
      .filter((meta) => WRITES.has(meta.access))
      .map((meta) => meta.column),
  );
  const references = scopedReferences(resource);
  return Object.entries(table.indexes)
    .filter(
      ([, index]) =>
        index.unique &&
        !keepsToScope(index, table, scope, references) &&
        index.columns.some((column) => column === null || written.has(column)),
    )
    .map(
      ([name]) =>
        `${resource.names.type}: unique index ${name} on ${resource.table} leaves out ${scope}, so a create or an update answers its 409 for a value another scope holds`,
    );
}

/** Every index warning of the composition, in the order of `resources`. */
export function indexWarnings(boot: BootContext): ReadonlyArray<string> {
  return boot.resources.flatMap(([, { resource }]) => {
    const table = ownValue(boot.catalog.tables, resource.table);
    if (table === undefined) {
      return [];
    }
    const scope = scopeColumnOf(resource);
    return [
      ...sortWarnings(resource, table, scope),
      ...(scope === undefined ? [] : uniqueWarnings(resource, table, scope)),
    ];
  });
}
