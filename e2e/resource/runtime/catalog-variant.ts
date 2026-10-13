/**
 * The full catalog `pg-catalog extract` writes for the contacts
 * application's migrations followed by one more (resource SPEC 18.3), as
 * the application's CI would extract it after that migration: what boot's
 * tests check a composition against when the schema differs from the
 * application's own. The extraction's PGlite gets the extensions and
 * schemas `fixtures/contacts/pg-catalog.config.mjs` names.
 * @ref https://documentation.red-gate.com/fd/migrations-271585107.html (versioned migrations run in version order, repeatable ones after them)
 */
import type { Catalog, Migration } from '@nizam-os/pg-catalog';

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { extractCatalog } from '@nizam-os/pg-catalog';

import { CONTACTS_DIR } from '../support/paths.ts';

const MIGRATIONS = join(CONTACTS_DIR, 'migrations');
const VERSIONED = /^V(\d+)__.+\.sql$/u;
const REPEATABLE = /^R__.+\.sql$/u;
/** A version after every migration the application has. */
const VARIANT = 'V999__variant.sql';

function version(name: string): number {
  return Number(VERSIONED.exec(name)?.[1]);
}

async function migration(name: string): Promise<Migration> {
  return { name, sql: await readFile(join(MIGRATIONS, name), 'utf8') };
}

/** The application's migrations with `sql` after the versioned ones, in the order Flyway runs them. */
async function migrationsWith(sql: string): Promise<ReadonlyArray<Migration>> {
  const names = await readdir(MIGRATIONS);
  const versioned = names
    .filter((name) => VERSIONED.test(name))
    .toSorted((left, right) => version(left) - version(right));
  const repeatable = names.filter((name) => REPEATABLE.test(name)).toSorted();
  return [
    ...(await Promise.all(versioned.map(async (name) => migration(name)))),
    { name: VARIANT, sql },
    ...(await Promise.all(repeatable.map(async (name) => migration(name)))),
  ];
}

/** The full catalog of the application's schema after `sql`. */
export async function catalogAfter(sql: string): Promise<Catalog> {
  return extractCatalog({
    migrations: async () => migrationsWith(sql),
    database: { pglite: { extensions: ['pg_trgm', 'btree_gist', 'citext'] } },
    schemas: ['public', 'audit'],
  });
}
