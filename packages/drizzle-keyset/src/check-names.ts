import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

/**
 * The definition-time check of a keyset's names against the schema object
 * (SPEC 14.1, ADR 0011, ADR 0017). The types check the same names, but a
 * definition can reach the definer around them (JavaScript, a widened
 * schema type, a cast), and a name that resolves to nothing would only
 * fail when a request renders it. So every table, column, join pair, and
 * search column of the validated definition is resolved here, once, and a
 * column field over a column that is not `notNull` must be declared
 * `nullable: true`, since the seek trusts that declaration (ADR 0016).
 * Messages name the option at fault and the declared names in it.
 * @ref https://orm.drizzle.team/docs/column-types/pg#not-null
 * @packageDocumentation
 */
import type {
  ColumnField,
  Field,
  KeysetDefinition,
  Relation,
  SearchSpec,
} from '@nizam-os/keyset-core';

import type { KeysetSchema } from './types';

import { columnOf, tableOf } from './schema';

/** A table of the schema, with the key it was named by. */
interface Named {
  readonly key: string;
  readonly table: PgTable;
}

function requireTable(schema: KeysetSchema, what: string, key: string): Named {
  const table = tableOf(schema, key);
  if (table === undefined) {
    throw new TypeError(`${what}: the schema has no table ${key}`);
  }
  return { key, table };
}

function requireColumn(named: Named, what: string, key: string): PgColumn {
  const column = columnOf(named.table, key);
  if (column === undefined) {
    throw new TypeError(
      `${what}: the schema table ${named.key} has no column ${key}`,
    );
  }
  return column;
}

function checkColumnField(
  named: Named,
  what: string,
  field: ColumnField,
): void {
  const column = requireColumn(named, `${what}.column`, field.column);
  if (!column.notNull && !field.nullable) {
    throw new TypeError(
      `${what}.nullable must be true: ${named.key}.${field.column} is nullable`,
    );
  }
}

function checkRelation(
  schema: KeysetSchema,
  main: Named,
  name: string,
  relation: Relation,
): Named {
  const what = `relations.${name}`;
  const related = requireTable(schema, `${what}.table`, relation.table);
  for (const [relatedColumn, mainColumn] of relation.on) {
    requireColumn(related, `${what}.on`, relatedColumn);
    requireColumn(main, `${what}.on.${relatedColumn}`, mainColumn);
  }
  for (const [fieldName, field] of relation.fields) {
    checkColumnField(related, `${what}.fields.${fieldName}`, field);
  }
  return related;
}

function checkField(
  main: Named,
  related: ReadonlyMap<string, Named>,
  name: string,
  field: Field,
): void {
  if (field.kind === 'column') {
    checkColumnField(main, `fields.${name}`, field);
    return;
  }
  const relation = related.get(field.relation);
  // The core refused an aggregate over an undeclared relation already.
  if (relation === undefined) {
    throw new TypeError(`fields.${name}.aggregate.relation is not declared`);
  }
  if (field.column !== null) {
    requireColumn(relation, `fields.${name}.aggregate.column`, field.column);
  }
}

function checkSearchColumns(main: Named, columns: ReadonlyArray<string>): void {
  for (const column of columns) {
    requireColumn(main, 'search.columns', column);
  }
}

function checkSearch(main: Named, search: SearchSpec | null): void {
  if (search === null) {
    return;
  }
  if (search.mode === 'like') {
    checkSearchColumns(main, search.columns);
    return;
  }
  if ('vector' in search.source) {
    requireColumn(main, 'search.vector', search.source.vector);
    return;
  }
  checkSearchColumns(main, search.source.columns);
}

/**
 * Resolves every name of a validated definition in `schema`, throwing
 * `TypeError` at the first one that does not resolve.
 */
export function checkNames(
  definition: KeysetDefinition,
  schema: KeysetSchema,
): void {
  const main = requireTable(schema, 'table', definition.table);
  const related = new Map<string, Named>();
  for (const [name, relation] of definition.relations) {
    related.set(name, checkRelation(schema, main, name, relation));
  }
  for (const [name, field] of definition.fields) {
    checkField(main, related, name, field);
  }
  checkSearch(main, definition.search);
}
