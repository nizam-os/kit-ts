/**
 * A table with a constant default for every type with a wire form
 * (resource SPEC 5.1), one constant outside the read form, and one
 * expression, added to the contacts application by one more migration and
 * extracted as its CI would extract it: what a default's `value` (SPEC 8)
 * and a create form's start (SPEC 20.3) are checked against, on the
 * database the migration ran on. `numeric(6,2)`, `char(4)`, and the
 * `percentage` domain apply a type modifier after the default.
 * @ref https://www.postgresql.org/docs/18/ddl-default.html
 * @ref https://www.postgresql.org/docs/18/arrays.html#ARRAYS-INPUT
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';
import type { DeclaredResource, FieldMeta } from '@nizam-os/resource-core';

import type { ColumnType } from './column-type.ts';
import type { OracleDatabase } from './oracle-database.ts';

import { toPublicCatalog } from '@nizam-os/catalog-core';
import { createDeclareResource } from '@nizam-os/resource-core';

import { catalogAfter } from '../runtime/catalog-variant.ts';
import { columnType } from './column-type.ts';
import { readForm } from './read-form.ts';

const DEFAULTS_TABLE = 'field_defaults';

/** Each column's type and default, in table order. */
const COLUMNS: Readonly<Record<string, string>> = {
  label: "text not null default 'plain'",
  code: "varchar(8) not null default 'ab'",
  padded: "char(4) not null default 'ab'",
  small: 'smallint not null default -3',
  seats: 'integer not null default 5',
  big: 'bigint not null default 9007199254740993',
  price: 'numeric(6, 2) not null default 1',
  ratio: 'numeric not null default 0.50',
  weight: 'real not null default 1.5',
  score: 'double precision not null default -2.25',
  flag: 'boolean not null default true',
  token: "uuid not null default 'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11'",
  due_on: "date not null default '2026-01-31'",
  starts_at: "timestamp not null default '2026-01-31 09:30:00.5'",
  occurs_at: "timestamptz not null default '2026-01-31 09:30:00+02'",
  config: `jsonb not null default '{"theme": "light", "sizes": [1, 2]}'`,
  kind: "contact_kind not null default 'company'",
  discount: 'percentage not null default 12.5',
  tags: String.raw`text[] not null default '{"a b","c,d","","NULL","q\"uote"}'`,
  open_days: "boolean[] not null default '{t,t,t,t,t,f,f}'",
  sizes: "integer[] not null default '{1,2,3}'",
  kinds: "contact_kind[] not null default '{person,company}'",
  reminders: `timestamptz[] not null default '{"2026-01-31 09:30:00+02"}'`,
  expires_on: "date default 'infinity'",
  noted_at: 'timestamptz not null default now()',
};

function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** The migration that adds the table. */
export const DEFAULTS_MIGRATION = `create table ${DEFAULTS_TABLE} (id bigint generated always as identity primary key, ${Object.entries(
  COLUMNS,
)
  .map(([column, definition]) => `${identifier(column)} ${definition}`)
  .join(', ')})`;

/** The table's public catalog and the resource declared over it, every column `readWrite`. */
export interface DefaultsFixture {
  readonly catalog: PublicCatalog;
  readonly resource: DeclaredResource;
}

/** Extracts the contacts application with the table added, and declares the resource. */
export async function defaultsFixture(): Promise<DefaultsFixture> {
  const catalog = toPublicCatalog(await catalogAfter(DEFAULTS_MIGRATION), [
    DEFAULTS_TABLE,
  ]);
  const declaration = {
    operations: ['get', 'create', 'update'],
    fields: Object.fromEntries(
      Object.keys(COLUMNS).map((column) => [column, { access: 'readWrite' }]),
    ),
  };
  // A catalog extracted at run time has no literal types to check a
  // declaration against, so the definer is called as JavaScript calls it
  // (resource SPEC 14): it returns the resource it declares, or throws.
  const declared: unknown = Reflect.apply(
    createDeclareResource({ catalog }),
    undefined,
    [DEFAULTS_TABLE, declaration],
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the definer returned it, and a definer returns a DeclaredResource or throws
  const resource = declared as DeclaredResource;
  return { catalog, resource };
}

/** A stored row: its id and each column as PostgreSQL prints it, `null` for SQL `NULL`. */
export type StoredRow = Readonly<Record<string, string | null>>;

/**
 * Inserts a row holding `texts`, by column, as each column's input
 * function reads them, and its defaults elsewhere, as a create that
 * carries only those members stores it. Returns each column as its type's
 * output function prints it, which `format('%s')` calls, since `::text`
 * would drop a `char(n)` value's padding; `format` prints `NULL` as an
 * empty string, so a `NULL` is selected as itself.
 * @ref https://www.postgresql.org/docs/18/functions-string.html#FUNCTIONS-STRING-FORMAT
 * @ref https://www.postgresql.org/docs/18/datatype-character.html
 */
export async function storeRow(
  database: OracleDatabase,
  texts: Readonly<Record<string, string>> = {},
): Promise<StoredRow> {
  const columns = Object.keys(texts);
  const values =
    columns.length === 0
      ? 'default values'
      : `(${columns.map((column) => identifier(column)).join(', ')}) values (${columns.map((_column, index) => `$${String(index + 1)}`).join(', ')})`;
  const printed = ['id', ...Object.keys(COLUMNS)].map((column) => {
    const name = identifier(column);
    return `case when ${name} is null then null else format('%s', ${name}) end as ${name}`;
  });
  const [row = {}] = await database.query(
    `insert into ${DEFAULTS_TABLE} ${values} returning ${printed.join(', ')}`,
    Object.values(texts),
  );
  return Object.fromEntries(
    Object.entries(row).map(([column, text]) => [column, textOf(column, text)]),
  );
}

/** A selected value, every one of which `format` prints as text. */
function textOf(column: string, value: unknown): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new TypeError(`${column} was not selected as text`);
  }
  return value;
}

/** The type of the column `meta` names. */
export function typeOf(catalog: PublicCatalog, meta: FieldMeta): ColumnType {
  const column = catalog.tables[DEFAULTS_TABLE]?.columns[meta.column];
  if (column === undefined) {
    throw new Error(`${meta.column} is not a column of ${DEFAULTS_TABLE}`);
  }
  return columnType(catalog, column);
}

/** The read form (resource SPEC 5.4) of what `row` holds for `meta`, by the suite's own reader. */
export function storedValue(
  catalog: PublicCatalog,
  row: StoredRow,
  meta: FieldMeta,
): unknown {
  const text = row[meta.column];
  if (text === undefined || text === null) {
    throw new Error(`${meta.column} holds no value`);
  }
  return readForm(text, typeOf(catalog, meta));
}
