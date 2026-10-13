/**
 * `readCatalog`: one catalog from a database session (SPEC 7). The same
 * function reads replayed databases (`extract`) and live ones (`drift`).
 * @packageDocumentation
 */
import type { Catalog, CatalogDomain } from '@nizam-os/catalog-core';

import type { SqlSession } from '../target/session';
import type { DomainRow, EnumRow, TableRow } from './rows';

import { CATALOG_FORMAT } from '@nizam-os/catalog-core';

import { PgCatalogError } from '../errors';
import { compareCodeUnits } from '../internal/code-units';
import { recognizeCheck } from '../recognize/recognize';
import { SESSION_SETTINGS } from '../target/session';
import { buildTable } from './build-table';
import { referenceName, sortedRecord } from './names';
import {
  DOMAINS_QUERY,
  ENUMS_QUERY,
  EXTENSIONS_QUERY,
  SEARCH_PATH_QUERY,
  VERSION_QUERY,
  tablesQuery,
} from './queries';
import {
  checkSubject,
  defaultMember,
  modifierMembers,
  typeMembers,
} from './type-facts';

/** PostgreSQL 14, the oldest supported major (SPEC 15). */
const MINIMUM_SERVER_VERSION = 140_000;
const MAJOR_DIVISOR = 10_000;

async function serverVersion(session: SqlSession): Promise<number> {
  const [row] = await session.query<{ version: number }>(VERSION_QUERY);
  const version = row?.version ?? 0;
  if (version < MINIMUM_SERVER_VERSION) {
    throw new PgCatalogError(
      'unsupported_server',
      `@nizam-os/pg-catalog needs PostgreSQL 14 or later; the server is PostgreSQL ${Math.floor(version / MAJOR_DIVISOR)}`,
    );
  }
  return version;
}

/** Runs one of the `json_agg(...)::text` queries and parses its value. */
async function queryJson<TRow>(
  session: SqlSession,
  sql: string,
  schemas: ReadonlyArray<string>,
): Promise<ReadonlyArray<TRow>> {
  const [row] = await session.query<{ data: string }>(sql, [schemas]);
  const parsed: unknown = JSON.parse(row?.data ?? '[]');
  if (!Array.isArray(parsed)) {
    throw new TypeError(
      'an extraction query returned something other than a JSON array',
    );
  }
  // The query text fixes the row shape (rows.ts), so the assertion restates it.
  return parsed as ReadonlyArray<TRow>;
}

function buildDomain(row: DomainRow, defaultSchema: string): CatalogDomain {
  const name = referenceName(row.schema, row.name, defaultSchema);
  // Every domain CHECK is a candidate for a rule (SPEC 8.1).
  const subject = checkSubject(row, null);
  return {
    schema: row.schema,
    name: row.name,
    ...typeMembers(row, defaultSchema),
    sqlType: row.sqlType,
    ...modifierMembers(row),
    collation: row.collation,
    nullable: !row.notNull,
    default: defaultMember(row),
    constraints: sortedRecord(
      row.constraints.map(
        (constraint) =>
          [
            constraint.name,
            {
              kind: 'check',
              expression: constraint.expression,
              rule: recognizeCheck(constraint.expression, subject),
              validated: constraint.validated,
              definition: constraint.definition,
            },
          ] as const,
      ),
      'constraint',
      `domain ${name}`,
    ),
    comment: row.comment,
  };
}

/**
 * Reads the catalog of `schemas` (the first is the default schema) through
 * `session`: pins the session settings and `search_path`, then runs the
 * queries of SPEC 7.2 and orders everything in JavaScript (SPEC 2.10).
 * Fails with `unsupported_server` below PostgreSQL 14, `unsafe_name` for a
 * key named `__proto__`, and `duplicate_key` when two objects share a key.
 */
export async function readCatalog(
  session: SqlSession,
  schemas: ReadonlyArray<string>,
): Promise<Catalog> {
  const [defaultSchema] = schemas;
  if (defaultSchema === undefined) {
    throw new TypeError('readCatalog needs at least one schema');
  }
  const version = await serverVersion(session);
  await session.exec(SESSION_SETTINGS);
  await session.query(SEARCH_PATH_QUERY, [schemas]);
  const extensions = await queryJson<string>(
    session,
    EXTENSIONS_QUERY,
    schemas,
  );
  const enums = await queryJson<EnumRow>(session, ENUMS_QUERY, schemas);
  const domains = await queryJson<DomainRow>(session, DOMAINS_QUERY, schemas);
  const tables = await queryJson<TableRow>(
    session,
    tablesQuery(version),
    schemas,
  );
  return {
    format: CATALOG_FORMAT,
    schemas: [...schemas],
    extensions: extensions.toSorted((left, right) =>
      compareCodeUnits(left, right),
    ),
    enums: sortedRecord(
      enums.map(
        (row) =>
          [
            referenceName(row.schema, row.name, defaultSchema),
            row.labels,
          ] as const,
      ),
      'enum',
    ),
    domains: sortedRecord(
      domains.map(
        (row) =>
          [
            referenceName(row.schema, row.name, defaultSchema),
            buildDomain(row, defaultSchema),
          ] as const,
      ),
      'domain',
    ),
    tables: sortedRecord(
      tables.map(
        (row) =>
          [
            referenceName(row.schema, row.name, defaultSchema),
            buildTable(row, defaultSchema),
          ] as const,
      ),
      'table',
    ),
  };
}
