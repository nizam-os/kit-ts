/**
 * What the field metadata says about a create (resource SPEC 6.3, 8), on
 * the contacts application's schema: a row that carries the members marked
 * `required`, each with a value the metadata admits, and the server's own
 * values, is inserted; leaving out any one of them fails with 23502
 * (`not_null_violation`); and a member left out holds the `default` the
 * metadata states: its constant, a value for an expression, or `NULL`
 * without one. On PGlite and on the server `RESOURCE_PG_URL` names.
 * @ref https://www.postgresql.org/docs/18/errcodes-appendix.html
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';
import type { DeclaredResource, FieldMeta } from '@nizam-os/resource-core';

import type { OracleDatabase } from './support/oracle-database.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { publicCatalog } from './fixtures/contacts/public-catalog.ts';
import { Contacts } from './resources/contacts.ts';
import { Organizations } from './resources/organizations.ts';
import { columnType } from './support/column-type.ts';
import { fieldProbes } from './support/meta-probes.ts';
import { CONTACTS_SCHEMA, liveDatabases } from './support/oracle-database.ts';
import { parameterText } from './support/pg-text.ts';
import { readForm } from './support/read-form.ts';
import { sameValue } from './support/same-value.ts';

const NOT_NULL_VIOLATION = '23502';

type Row = Readonly<Record<string, string | null>>;

function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** The catalog with its literal types widened, for lookups by name. */
const catalog: PublicCatalog = publicCatalog;

function typeOf(table: string, column: string) {
  const definition = catalog.tables[table]?.columns[column];
  if (definition === undefined) {
    throw new Error(`${table}.${column} is not in the contacts catalog`);
  }
  return columnType(catalog, definition);
}

const attributes = (resource: DeclaredResource): ReadonlyArray<FieldMeta> =>
  Object.values(resource.fields).filter((meta) => meta.kind === 'attribute');

/** The values besides `null` that the metadata admits, in probe order. */
function admittedValues(meta: FieldMeta): ReadonlyArray<unknown> {
  const values = fieldProbes(meta)
    .probes.filter(({ admitted, value }) => admitted && value !== null)
    .map(({ value }) => value);
  if (values.length === 0) {
    throw new Error(`no admitted value for ${meta.name}`);
  }
  return values;
}

/** Inserts `values` into `table` and returns every member's column as text. */
async function insert(
  database: OracleDatabase,
  resource: DeclaredResource,
  values: Readonly<Record<string, unknown>>,
): Promise<Row> {
  const columns = Object.keys(values);
  const parameters = columns.map((column) =>
    parameterText(values[column], typeOf(resource.table, column)),
  );
  const returned = attributes(resource).map(
    ({ column }) => `${identifier(column)}::text as ${identifier(column)}`,
  );
  const [row] = await database.query(
    `insert into ${identifier(resource.table)} (${columns.map((column) => identifier(column)).join(', ')}) values (${columns.map((_column, index) => `$${String(index + 1)}`).join(', ')}) returning ${returned.join(', ')}`,
    parameters,
  );
  return row as Row;
}

/** The SQLSTATE an insert of `values` fails with, rolled back to a savepoint, or `undefined` when it succeeds. */
async function failure(
  database: OracleDatabase,
  resource: DeclaredResource,
  values: Readonly<Record<string, unknown>>,
): Promise<string | undefined> {
  await database.query('savepoint probe');
  try {
    await insert(database, resource, values);
    return undefined;
  } catch (error) {
    return (error as { readonly code?: string }).code;
  } finally {
    await database.query('rollback to savepoint probe');
  }
}

/** Whether a member left out holds what its metadata's `default` states. */
function holdsDefault(
  resource: DeclaredResource,
  meta: FieldMeta,
  stored: string | null,
): boolean {
  if (meta.default === null) {
    return stored === null;
  }
  const { literal } = meta.default;
  if (literal === null || stored === null) {
    return literal === null && stored !== null;
  }
  const type = typeOf(resource.table, meta.column);
  return sameValue(readForm(stored, type), readForm(literal, type), type);
}

/** Each resource, and the server's values a create of it needs beyond its members. */
const CASES: ReadonlyArray<
  readonly [
    DeclaredResource,
    (organization: string) => Readonly<Record<string, string>>,
  ]
> = [
  [Organizations, () => ({})],
  [Contacts, (organization) => ({ organization_id: organization })],
];

for (const [name, open] of liveDatabases(CONTACTS_SCHEMA)) {
  describe(`a create the field metadata describes, on ${name}`, () => {
    let database: OracleDatabase;
    let organization: string;

    beforeAll(async () => {
      database = await open();
      await database.query('begin');
      const required = attributes(Organizations).filter(
        (meta) => meta.required,
      );
      const row = await database.query(
        `insert into organizations (${required.map(({ column }) => identifier(column)).join(', ')}) values (${required.map((_meta, index) => `$${String(index + 1)}`).join(', ')}) returning id::text as id`,
        required.map((meta) =>
          parameterText(
            admittedValues(meta).at(-1),
            typeOf('organizations', meta.column),
          ),
        ),
      );
      organization = String(row[0]?.['id']);
    });

    afterAll(async () => {
      await database.query('rollback');
      await database.close();
    });

    it.each(
      CASES.map(([resource, server]) => [resource.table, resource, server]),
    )(
      '%s: the required members are exactly the ones PostgreSQL needs, and the defaults are the ones it applies',
      async (_table, resource, server) => {
        const required = attributes(resource).filter((meta) => meta.required);
        expect(required.length).toBeGreaterThan(0);
        expect(
          Object.values(resource.fields).filter(
            (meta) => meta.kind === 'relationship' && meta.required,
          ),
        ).toEqual([]);
        const values = {
          ...server(organization),
          ...Object.fromEntries(
            required.map((meta) => [meta.column, admittedValues(meta)[0]]),
          ),
        };
        for (const meta of required) {
          const { [meta.column]: _left, ...without } = values;
          expect([
            meta.name,
            await failure(database, resource, without),
          ]).toEqual([meta.name, NOT_NULL_VIOLATION]);
        }
        await database.query('savepoint carried');
        const row = await insert(database, resource, values);
        await database.query('rollback to savepoint carried');
        const wrong = attributes(resource)
          .filter(
            (meta) =>
              !meta.required &&
              !holdsDefault(resource, meta, row[meta.column] ?? null),
          )
          .map(
            (meta) =>
              `${meta.name}: ${JSON.stringify(meta.default)} but ${String(row[meta.column])}`,
          );
        expect(wrong).toEqual([]);
      },
    );
  });
}
