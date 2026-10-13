/**
 * The SQL of the reference storage adapter (resource SPEC 12.9): quoted
 * names, a resource's public row selected in PostgreSQL's text forms, and
 * parameters cast as `$n::text::<type>`, which runs the type's input
 * function on the text as a literal would, so every driver sends the same
 * UTF-8 text. Rows come back through `readForm` (SPEC 5.1) or the field's
 * storage codec, and a value with no read form fails the read.
 * @ref https://www.postgresql.org/docs/18/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS
 * @ref https://www.postgresql.org/docs/18/sql-createcast.html (I/O conversion casts from text)
 */
import type {
  PublicCatalog,
  PublicColumn,
  PublicTable,
} from '@nizam-os/catalog-core';
import type { DeclaredResource, FieldMeta } from '@nizam-os/resource-core';
import type { PublicRow, ScopeValue } from '@nizam-os/resource-core/server';

import { columnType } from './column-type.ts';
import { parameterText } from './pg-text.ts';
import { readForm, UNREPRESENTABLE } from './read-form.ts';

/** One row of a result, by column alias. */
export type Row = Readonly<Record<string, unknown>>;

/** A client inside one transaction. */
export interface SqlClient {
  readonly query: (
    sql: string,
    parameters: ReadonlyArray<string | null>,
  ) => Promise<ReadonlyArray<Row>>;
}

/** The adapter's transaction: the client and the scopes it was opened with. */
export interface ReferenceTransaction {
  readonly client: SqlClient;
  readonly scopes: ReadonlyArray<ScopeValue>;
}

/**
 * A storage codec between a wire value and PostgreSQL's text (SPEC 7.1).
 * It takes the value as `unknown`, since a write's members are untyped at
 * runtime, and checks it with the codec's public schema.
 */
export interface TextCodec {
  readonly read: (text: string) => unknown;
  readonly write: (value: unknown) => string;
}

/** Storage codecs by codec name. */
type TextCodecs = Readonly<Record<string, TextCodec>>;

/** What the SQL of a resource is built from. */
export interface SqlContext {
  readonly catalog: PublicCatalog;
  readonly codecs: TextCodecs;
}

/** `name` as a quoted identifier. */
export function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** The catalog table a resource is declared over. */
export function tableOf(
  context: SqlContext,
  resource: DeclaredResource,
): PublicTable {
  const table = context.catalog.tables[resource.table];
  if (table === undefined) {
    throw new Error(
      `${resource.names.type}: the catalog has no table ${resource.table}`,
    );
  }
  return table;
}

/** The schema-qualified name of a table. */
export function tableName(table: PublicTable): string {
  return `${quoted(table.schema)}.${quoted(table.name)}`;
}

/** A column of a table; throws for a name the table does not have. */
export function columnOf(table: PublicTable, name: string): PublicColumn {
  const column = table.columns[name];
  if (column === undefined) {
    throw new Error(`${table.name} has no column ${name}`);
  }
  return column;
}

/** The type a parameter of `column` is cast to: its type reference, quoted part by part. */
function castType(column: PublicColumn): string {
  const name = column.type
    .split('.')
    .map((part) => quoted(part))
    .join('.');
  return column.array ? `${name}[]` : name;
}

/** Statement parameters, each sent as text and cast to its column's type. */
export class Parameters {
  public readonly values: Array<string | null> = [];

  /** Adds `text` and returns its placeholder cast to `column`'s type. */
  public add(text: string | null, column: PublicColumn): string {
    return `${this.text(text)}::${castType(column)}`;
  }

  /** Adds `text` and returns its placeholder as `text`. */
  public text(text: string | null): string {
    this.values.push(text);
    return `$${String(this.values.length)}::text`;
  }
}

/** The fields and relationships a row shows: every member but a `write` field. */
function readable(resource: DeclaredResource): ReadonlyArray<FieldMeta> {
  return Object.values(resource.fields).filter(
    (meta) => meta.access !== 'write',
  );
}

/**
 * A column as PostgreSQL prints it, under `alias`: cast to text, but a
 * `bpchar` through `format('%s')`, which prints it padded where the cast
 * drops its trailing spaces, and prints `NULL` as the empty string, so a
 * null stays null by a `case`.
 * @ref https://www.postgresql.org/docs/18/datatype-character.html ("Trailing spaces are removed when converting a character value to one of the other string types")
 * @ref https://www.postgresql.org/docs/18/functions-string.html#FUNCTIONS-STRING-FORMAT ("A null value is treated as an empty string")
 */
function printed(
  context: SqlContext,
  table: PublicTable,
  column: string,
  alias: string,
): string {
  const name = quoted(column);
  const { base, array } = columnType(context.catalog, columnOf(table, column));
  const text =
    base === 'bpchar' && !array
      ? `case when ${name} is null then null else format('%s', ${name}) end`
      : `${name}::text`;
  return `${text} as ${quoted(alias)}`;
}

/** The select list of a resource's public row, each value as PostgreSQL prints it. */
export function selectList(
  context: SqlContext,
  resource: DeclaredResource,
): string {
  const table = tableOf(context, resource);
  return [
    printed(context, table, resource.names.id, 'id'),
    ...readable(resource).map((meta) =>
      printed(context, table, meta.column, meta.name),
    ),
  ].join(', ');
}

/** The wire value of a stored text; throws for a value with no read form. */
function readValue(
  context: SqlContext,
  table: PublicTable,
  meta: FieldMeta,
  text: unknown,
): unknown {
  if (text === null) {
    return null;
  }
  if (typeof text !== 'string') {
    throw new TypeError(
      `${meta.name}: the driver returned a value that is not text`,
    );
  }
  if (meta.kind === 'relationship') {
    return text;
  }
  if (meta.codec !== null) {
    return codecOf(context, meta.codec).read(text);
  }
  const value = readForm(
    text,
    columnType(context.catalog, columnOf(table, meta.column)),
  );
  if (value === UNREPRESENTABLE) {
    throw new Error(`${meta.name}: the stored value has no read form`);
  }
  return value;
}

/** The public row of a selected row. */
export function readRow(
  context: SqlContext,
  resource: DeclaredResource,
  row: Row,
  members: ReadonlyArray<FieldMeta> = readable(resource),
): PublicRow {
  const table = tableOf(context, resource);
  const entries = members.map((meta): readonly [string, unknown] => [
    meta.name,
    readValue(context, table, meta, row[meta.name]),
  ]);
  const id = row['id'];
  if (typeof id !== 'string') {
    throw new TypeError(
      `${resource.names.type}: the driver returned an id that is not text`,
    );
  }
  return { ...Object.fromEntries(entries), id };
}

/** The storage codec named `name`. */
function codecOf(context: SqlContext, name: string): TextCodec {
  const codec = context.codecs[name];
  if (codec === undefined) {
    throw new Error(`no storage codec ${name}`);
  }
  return codec;
}

/** The text of a member's wire value for its column, through its codec when it has one. */
export function writeText(
  context: SqlContext,
  column: PublicColumn,
  meta: FieldMeta | undefined,
  value: unknown,
): string | null {
  if (value === null) {
    return null;
  }
  if (meta?.codec != null) {
    return codecOf(context, meta.codec).write(value);
  }
  return parameterText(value, columnType(context.catalog, column));
}
