/**
 * `introspectCatalog` and `drift` (SPEC 10.2, ADR 0008): read a live
 * database's catalog with the queries `extract` uses, inside a read-only
 * snapshot, and compare it with the committed catalog.
 * @packageDocumentation
 */
import type { Catalog, CatalogDiff } from '@nizam-os/catalog-core';

import type { ExtractionConfig } from '../config';
import type { SqlSession } from '../target/session';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { diffCatalogs } from '@nizam-os/catalog-core';

import { catalogFile, DEFAULT_SCHEMAS } from '../config';
import { PgCatalogError } from '../errors';
import { readCatalog } from '../extract/read-catalog';
import { parseCatalogModule } from '../render/catalog-module';
import { openLiveDatabase } from '../target/server';
import { useSession } from '../target/session';

/**
 * Every query sees one snapshot, taken at the first query after `BEGIN`,
 * and nothing can be written, whatever the role may do.
 * @ref https://www.postgresql.org/docs/18/sql-set-transaction.html
 */
const READ_ONLY_SNAPSHOT = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY';

/**
 * The configured schemas that exist but the role cannot use. PostgreSQL
 * silently leaves such a schema out of the effective `search_path`, so
 * every name in it would deparse qualified.
 * @ref https://www.postgresql.org/docs/18/runtime-config-client.html#GUC-SEARCH-PATH
 * @ref https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-INFO-ACCESS
 */
const SCHEMAS_WITHOUT_USAGE_QUERY = `select n.nspname as name
from pg_catalog.pg_namespace n
where n.nspname = any($1::text[])
  and not pg_catalog.has_schema_privilege(n.oid, 'USAGE')`;

export interface IntrospectOptions {
  /** A `postgres://` or `postgresql://` URL, meant for a read-only role. */
  readonly url: string;
  /** Default `['public']`; the first is the default schema. */
  readonly schemas?: ReadonlyArray<string>;
}

export interface DriftOptions {
  /** The directory `out.catalog` resolves against; default the process's working directory. */
  readonly cwd?: string;
}

export interface DriftReport {
  readonly environment: string;
  /** The committed catalog is `expected`, the live database's `actual`. */
  readonly diff: CatalogDiff;
}

async function assertSchemaUsage(
  session: SqlSession,
  schemas: ReadonlyArray<string>,
): Promise<void> {
  const rows = await session.query<{ name: string }>(
    SCHEMAS_WITHOUT_USAGE_QUERY,
    [schemas],
  );
  const missing = schemas.filter((schema) =>
    rows.some((row) => row.name === schema),
  );
  if (missing.length === 1) {
    throw new PgCatalogError(
      'schema_usage',
      `the role lacks USAGE on schema ${missing.join('')}; without it PostgreSQL qualifies every name in that schema, which would read as drift`,
    );
  }
  if (missing.length > 1) {
    throw new PgCatalogError(
      'schema_usage',
      `the role lacks USAGE on schemas ${missing.join(', ')}; without it PostgreSQL qualifies every name in those schemas, which would read as drift`,
    );
  }
}

/**
 * Reads the catalog of a live database: connects to the URL, opens a
 * read-only `REPEATABLE READ` transaction, checks that the role can use
 * every configured schema that exists, reads the catalog with the queries
 * `extract` uses (SPEC 7), rolls back, and disconnects. It replays nothing
 * and cannot write. Fails with `schema_usage` for a schema the role cannot
 * use, and as `extract` does for the connection and the server.
 */
export async function introspectCatalog(
  options: IntrospectOptions,
): Promise<Catalog> {
  const schemas = options.schemas ?? DEFAULT_SCHEMAS;
  return useSession(await openLiveDatabase(options.url), async (session) => {
    await session.exec(READ_ONLY_SNAPSHOT);
    await assertSchemaUsage(session, schemas);
    const catalog = await readCatalog(session, schemas);
    await session.exec('ROLLBACK');
    return catalog;
  });
}

function environmentUrl(config: ExtractionConfig, environment: string): string {
  const environments = config.drift ?? {};
  const target = Object.hasOwn(environments, environment)
    ? environments[environment]
    : undefined;
  if (target === undefined) {
    const known = Object.keys(environments);
    throw new PgCatalogError(
      'config_invalid',
      known.length === 0
        ? `drift environment ${environment} is not configured; the configuration has no drift environments`
        : `drift environment ${environment} is not configured; the configuration has ${known.join(', ')}`,
    );
  }
  const url = typeof target.url === 'function' ? target.url() : target.url;
  if (url === undefined || url === '') {
    throw new PgCatalogError(
      'config_invalid',
      `drift.${environment}.url returned no URL; set the environment variable it reads`,
    );
  }
  return url;
}

async function readCommitted(path: string, shown: string): Promise<Catalog> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new PgCatalogError(
      'catalog_unreadable',
      `cannot read the committed catalog ${shown}; run pg-catalog extract and commit it`,
      { cause: error },
    );
  }
  return parseCatalogModule(text);
}

/**
 * Compares the live database of `environment` with the committed catalog:
 * reads `out.catalog`, then introspects the environment's URL with the
 * configured schemas. Fails with `config_invalid` for an unknown
 * environment or a URL function that returns nothing,
 * `catalog_unreadable` or `catalog_format` for the committed file, and as
 * `introspectCatalog` does for the database.
 */
export async function drift(
  config: ExtractionConfig,
  environment: string,
  options: DriftOptions = {},
): Promise<DriftReport> {
  const url = environmentUrl(config, environment);
  const { file } = catalogFile(config.out.catalog);
  const committed = await readCommitted(
    resolve(options.cwd ?? process.cwd(), file),
    file,
  );
  const live = await introspectCatalog({
    url,
    schemas: config.schemas ?? DEFAULT_SCHEMAS,
  });
  return { environment, diff: diffCatalogs(committed, live) };
}
