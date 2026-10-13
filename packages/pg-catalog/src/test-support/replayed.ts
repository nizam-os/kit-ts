/**
 * Opens PGlite with the contrib extensions the test schema creates and
 * replays migrations into it, for tests that read real catalogs.
 */
import type { Catalog } from '@nizam-os/catalog-core';

import type { Migration } from '../migrations/load';
import type { SqlSession } from '../target/session';

import { readCatalog } from '../extract/read-catalog';
import { replay } from '../replay';
import { openPglite } from '../target/pglite';
import { useSession } from '../target/session';

const SCHEMA_EXTENSIONS: ReadonlyArray<string> = [
  'pg_trgm',
  'btree_gist',
  'cube',
  'earthdistance',
];

/** A PGlite session with `migrations` replayed; the caller closes it. */
export async function replayedPglite(
  migrations: ReadonlyArray<Migration>,
): Promise<SqlSession> {
  const session = await openPglite(SCHEMA_EXTENSIONS);
  try {
    await replay(session, migrations);
  } catch (error) {
    await session.close();
    throw error;
  }
  return session;
}

/** Replays `migrations` into a fresh PGlite and reads `schemas`. */
export async function readReplayed(
  migrations: ReadonlyArray<Migration>,
  schemas: ReadonlyArray<string>,
): Promise<Catalog> {
  return useSession(await replayedPglite(migrations), async (session) =>
    readCatalog(session, schemas),
  );
}
