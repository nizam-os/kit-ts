/**
 * The probe of a case (SPEC 10.3), built in a session whose catalog was
 * just read, under the `search_path` reading pinned: a copy of a table's
 * columns holding the CHECKs the case names, and the columns' NOT NULL
 * when the case keeps it, or a column of a domain. A
 * table, column, CHECK, or domain the replayed database does not hold is
 * the case's problem, reported instead of run: the declarations read a
 * catalog the migrations no longer give.
 * @ref https://www.postgresql.org/docs/18/sql-createtable.html (TEMPORARY)
 * @packageDocumentation
 */
import type { Catalog } from '@nizam-os/catalog-core';
import type { OracleProbe } from '@nizam-os/resource-core/testing';

import type { SqlSession } from '../target/session';

import { failureMessage } from '../target/failure';
import {
  createProbe,
  insertTemplate,
  PROBE_SOURCE_QUERY,
  PROBE_TABLE,
  quoteIdentifier,
} from './probe-sql';

/** A built probe and the template that writes a fixture into it, or why it could not be built. */
export type BuiltProbe =
  | { readonly built: true; readonly template: string }
  | { readonly built: false; readonly problem: string };

interface SourceColumn {
  readonly name: string;
  readonly type: string;
  readonly collation: string | null;
  readonly notNull: boolean;
}

interface SourceCheck {
  readonly name: string;
  readonly expression: string;
}

/** The column a domain probe writes. */
const DOMAIN_COLUMN = 'value';

function unbuilt(problem: string): BuiltProbe {
  return { built: false, problem };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isSourceColumn(value: unknown): value is SourceColumn {
  return (
    isRecord(value) &&
    typeof value['name'] === 'string' &&
    typeof value['type'] === 'string' &&
    (value['collation'] === null || typeof value['collation'] === 'string') &&
    typeof value['notNull'] === 'boolean'
  );
}

function isSourceCheck(value: unknown): value is SourceCheck {
  return (
    isRecord(value) &&
    typeof value['name'] === 'string' &&
    typeof value['expression'] === 'string'
  );
}

/** The rows of a JSON array every element of which `is` accepts. */
function rowsOf<TRow>(
  text: string | undefined,
  is: (value: unknown) => value is TRow,
): ReadonlyArray<TRow> {
  const value: unknown = JSON.parse(text ?? '[]');
  if (!Array.isArray(value) || !value.every((item: unknown) => is(item))) {
    throw new TypeError('a probe query returned malformed rows');
  }
  return value;
}

/** The copy of a column; with `keepNotNull`, its NOT NULL too. */
function columnDefinition(column: SourceColumn, keepNotNull: boolean): string {
  const collation =
    column.collation === null ? '' : ` collate ${column.collation}`;
  const notNull = keepNotNull && column.notNull ? ' not null' : '';
  return `${quoteIdentifier(column.name)} ${column.type}${collation}${notNull}`;
}

/** Creates the probe, or gives PostgreSQL's reason it could not. */
async function create(
  session: SqlSession,
  definitions: ReadonlyArray<string>,
  columns: ReadonlyArray<string>,
): Promise<BuiltProbe> {
  try {
    await session.exec(createProbe(definitions));
  } catch (error) {
    return unbuilt(`the probe could not be built: ${failureMessage(error)}`);
  }
  return { built: true, template: insertTemplate(columns) };
}

async function buildColumns(
  session: SqlSession,
  catalog: Catalog,
  probe: Extract<OracleProbe, { readonly kind: 'columns' }>,
): Promise<BuiltProbe> {
  const table = Object.hasOwn(catalog.tables, probe.table)
    ? catalog.tables[probe.table]
    : undefined;
  if (table === undefined) {
    return unbuilt(`the replayed database has no table ${probe.table}`);
  }
  const [row] = await session.query<{ columns: string; checks: string }>(
    PROBE_SOURCE_QUERY,
    [table.schema, table.name, probe.columns, probe.checks],
  );
  const columns = rowsOf(row?.columns, isSourceColumn);
  const checks = rowsOf(row?.checks, isSourceCheck);
  const missingColumn = probe.columns.find(
    (name) => !columns.some((column) => column.name === name),
  );
  if (missingColumn !== undefined) {
    return unbuilt(
      `the replayed database has no column ${probe.table}.${missingColumn}`,
    );
  }
  const missingCheck = probe.checks.find(
    (name) => !checks.some((check) => check.name === name),
  );
  if (missingCheck !== undefined) {
    return unbuilt(
      `the replayed database has no CHECK ${missingCheck} on ${probe.table}`,
    );
  }
  // In the case's order, so the stored texts line up with the fixture's.
  const ordered = probe.columns.flatMap((name) =>
    columns.filter((column) => column.name === name),
  );
  return create(
    session,
    [
      ...ordered.map((column) => columnDefinition(column, probe.notNull)),
      ...checks.map(
        (check) =>
          `constraint ${quoteIdentifier(check.name)} check (${check.expression})`,
      ),
    ],
    probe.columns,
  );
}

async function buildDomain(
  session: SqlSession,
  catalog: Catalog,
  key: string,
): Promise<BuiltProbe> {
  const domain = Object.hasOwn(catalog.domains, key)
    ? catalog.domains[key]
    : undefined;
  if (domain === undefined) {
    return unbuilt(`the replayed database has no domain ${key}`);
  }
  const type = `${quoteIdentifier(domain.schema)}.${quoteIdentifier(domain.name)}`;
  return create(
    session,
    [`${quoteIdentifier(DOMAIN_COLUMN)} ${type}`],
    [DOMAIN_COLUMN],
  );
}

/** Builds the probe of a case; `dropProbe` removes it. */
export async function buildProbe(
  session: SqlSession,
  catalog: Catalog,
  probe: OracleProbe,
): Promise<BuiltProbe> {
  return probe.kind === 'columns'
    ? buildColumns(session, catalog, probe)
    : buildDomain(session, catalog, probe.domain);
}

/** Drops the probe, if one was built. */
export async function dropProbe(session: SqlSession): Promise<void> {
  await session.exec(`drop table if exists ${PROBE_TABLE}`);
}
