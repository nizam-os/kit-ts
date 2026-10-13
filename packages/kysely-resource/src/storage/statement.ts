import type { RawBuilder, SqlBool } from 'kysely';

/**
 * The fragments of the adapter's statements on one resource (SPEC 18.2):
 * the select list of its public row, the key's predicate, and the
 * assignments of a write. Every value is a parameter sent as text and cast
 * to its column's type; every selected value is read as text under its
 * public name, and the key as `"id"`.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';
import type { DeclaredResource, FieldMeta } from '@nizam-os/resource-core';
import type { ScopeValue, StorageWrite } from '@nizam-os/resource-core/server';

import type { ValueContext } from './values';

import { sql } from 'kysely';

import { ownValue } from '../internal/object';
import { columnType } from './column-type';
import { columnOf, typed } from './sql';
import { readable, writeText } from './values';

/** One column a write sets, and its value as a cast parameter, or `NULL`. */
export interface Assignment {
  readonly column: RawBuilder<unknown>;
  readonly value: RawBuilder<unknown>;
}

/**
 * `column` as text under `alias`: cast to text, except a `bpchar`, which
 * the cast strips of the trailing spaces its read form keeps (SPEC 5.1).
 * `format('%s')` prints it by the type's output rules, padded, and prints
 * `NULL` as the empty string, so a null stays null by a `case`. An array
 * of `bpchar` prints its elements padded either way.
 * @ref https://www.postgresql.org/docs/18/datatype-character.html ("Trailing spaces are removed when converting a character value to one of the other string types")
 * @ref https://www.postgresql.org/docs/18/functions-string.html#FUNCTIONS-STRING-FORMAT ("A null value is treated as an empty string")
 */
function selected(
  context: ValueContext,
  table: PublicTable,
  column: string,
  alias: string,
): RawBuilder<unknown> {
  const name = sql.id(column);
  const { base, array } = columnType(context.catalog, columnOf(table, column));
  const text =
    base === 'bpchar' && !array
      ? sql`case when ${name} is null then null else format('%s', ${name}) end`
      : sql`${name}::text`;
  return sql`${text} as ${sql.id(alias)}`;
}

/** The select list of the resource's public row. */
export function selectList(
  context: ValueContext,
  table: PublicTable,
  resource: DeclaredResource,
): RawBuilder<unknown> {
  return sql.join([
    selected(context, table, resource.names.id, 'id'),
    ...readable(resource).map((meta) =>
      selected(context, table, meta.column, meta.name),
    ),
  ]);
}

/** `"key" = $n::text::<type>` for `id`. */
export function keyPredicate(
  context: ValueContext,
  table: PublicTable,
  resource: DeclaredResource,
  id: string,
): RawBuilder<SqlBool> {
  const key = resource.names.id;
  return sql<SqlBool>`${sql.id(key)} = ${typed(context.catalog, columnOf(table, key), id)}`;
}

/** The member a write names; throws for a name the resource does not have. */
function memberOf(resource: DeclaredResource, name: string): FieldMeta {
  const meta = ownValue(resource.fields, name);
  if (meta === undefined) {
    throw new Error(`${resource.names.type} has no member ${name}`);
  }
  return meta;
}

/**
 * The assignments of `input`: each member it carries, by its column, and
 * on a create, `scope` given, its client id, its server values, and the
 * scope column with the transaction's value.
 */
export function assignments(
  context: ValueContext,
  table: PublicTable,
  resource: DeclaredResource,
  input: StorageWrite,
  create?: { readonly scope: ScopeValue | undefined },
): ReadonlyArray<Assignment> {
  const pairs: Array<Assignment> = [];
  const put = (
    columnName: string,
    meta: FieldMeta | undefined,
    value: unknown,
  ): void => {
    const column = columnOf(table, columnName);
    const text = writeText(context, column, meta, value);
    pairs.push({
      column: sql.id(columnName),
      value: text === null ? sql`null` : typed(context.catalog, column, text),
    });
  };
  for (const [name, value] of Object.entries(input.attributes)) {
    const meta = memberOf(resource, name);
    put(meta.column, meta, value);
  }
  for (const [name, id] of Object.entries(input.relationships)) {
    const meta = memberOf(resource, name);
    put(meta.column, meta, id);
  }
  if (create !== undefined) {
    if (input.id !== undefined) {
      put(resource.names.id, undefined, input.id);
    }
    for (const [column, value] of Object.entries(input.values ?? {})) {
      put(column, undefined, value);
    }
    if (create.scope !== undefined) {
      put(create.scope.column, undefined, String(create.scope.value));
    }
  }
  return pairs;
}
