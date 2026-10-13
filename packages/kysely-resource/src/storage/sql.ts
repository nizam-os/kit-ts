import type { RawBuilder } from 'kysely';

/**
 * The names of the adapter's statements (SPEC 18.2): a resource's table and
 * columns looked up in the catalog by own member, a table as
 * `"schema"."name"`, and the type a parameter is cast to. Identifiers are
 * `sql.id` parts, which Kysely's PostgreSQL compiler quotes by doubling
 * `"`, so any name PostgreSQL holds is written as it is.
 * @ref https://www.postgresql.org/docs/18/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS
 * @ref https://kysely-org.github.io/kysely-apidoc/interfaces/Sql.html#id
 * @packageDocumentation
 */
import type {
  PublicCatalog,
  PublicColumn,
  PublicTable,
} from '@nizam-os/catalog-core';
import type { DeclaredResource } from '@nizam-os/resource-core';

import { sql } from 'kysely';

import { ownValue } from '../internal/object';

/** The catalog table a resource is declared over; throws for a table the catalog does not hold. */
export function tableOf(
  catalog: PublicCatalog,
  resource: DeclaredResource,
): PublicTable {
  const table = ownValue(catalog.tables, resource.table);
  if (table === undefined) {
    throw new Error(
      `${resource.names.type}: the catalog has no table ${resource.table}`,
    );
  }
  return table;
}

/** A column of a table; throws for a name the table does not have. */
export function columnOf(table: PublicTable, name: string): PublicColumn {
  const column = ownValue(table.columns, name);
  if (column === undefined) {
    throw new Error(`${table.name} has no column ${name}`);
  }
  return column;
}

/** A table as `"schema"."name"`. */
export function tableName(table: PublicTable): RawBuilder<unknown> {
  return sql.id(table.schema, table.name);
}

/**
 * The type a parameter of `column` is cast to, so the type's input
 * function reads the text as it would read a literal: a domain by its
 * schema and name, any other type by its reference name, whose schema
 * part a type outside the default schema has (catalog SPEC 2.1), and `[]`
 * for an array column. A type of the default schema is named without its
 * schema, as the catalog names it, so it resolves through `search_path`.
 */
export function castType(
  catalog: PublicCatalog,
  column: PublicColumn,
): RawBuilder<unknown> {
  const name = typeName(catalog, column.type);
  return column.array ? sql`${name}[]` : name;
}

/** A type by its reference name: a domain by its own schema and name, any other split at its first dot. */
function typeName(
  catalog: PublicCatalog,
  reference: string,
): RawBuilder<unknown> {
  const domain = ownValue(catalog.domains, reference);
  if (domain !== undefined) {
    return sql.id(domain.schema, domain.name);
  }
  const dot = reference.indexOf('.');
  return dot === -1
    ? sql.id(reference)
    : sql.id(reference.slice(0, dot), reference.slice(dot + 1));
}

/** `text` as a parameter cast to `column`'s type: `$n::text::<type>`. */
export function typed(
  catalog: PublicCatalog,
  column: PublicColumn,
  text: string,
): RawBuilder<unknown> {
  return sql`${text}::text::${castType(catalog, column)}`;
}
