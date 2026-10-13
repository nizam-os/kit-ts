/**
 * The server target (SPEC 6.2) on PostgreSQL 14 to 18: with
 * `CATALOG_PG_URL` set, extraction replays into a throwaway database and
 * must produce the bytes PGlite (PostgreSQL 18) produced, then drop the
 * database. CI runs this file against PostgreSQL 14 and 18 services.
 */
import type { Project } from './support/project';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extract } from '@nizam-os/pg-catalog';

import {
  contactsConfig,
  EXPECTED_CATALOG,
  EXPECTED_PUBLIC,
  EXPECTED_TYPES,
} from './support/contacts';
import { createProject } from './support/project';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Client } = pg` for ESM
const { Client } = pg;
const url = process.env['CATALOG_PG_URL'];

async function throwawayDatabases(): Promise<Array<string>> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ datname: string }>(
      "select datname from pg_database where datname like 'nizam\\_catalog\\_%'",
    );
    return result.rows.map((row) => row.datname);
  } finally {
    await client.end();
  }
}

describe.skipIf(url === undefined)('extract on a PostgreSQL server', () => {
  let project: Project;

  beforeEach(async () => {
    project = await createProject();
  });

  afterEach(async () => {
    await project.remove();
  });

  it('writes the same bytes as PGlite and drops its throwaway database', async () => {
    const before = await throwawayDatabases();
    const report = await extract(
      {
        ...contactsConfig,
        database: { url: () => process.env['CATALOG_PG_URL'] },
      },
      { cwd: project.dir },
    );
    expect(report.files.map((file) => file.status)).toEqual([
      'written',
      'written',
      'written',
    ]);
    expect(
      (await readFile(join(project.dir, 'src/db/catalog.ts'))).equals(
        await readFile(EXPECTED_CATALOG),
      ),
    ).toBe(true);
    expect(
      (await readFile(join(project.dir, 'src/db/public-catalog.ts'))).equals(
        await readFile(EXPECTED_PUBLIC),
      ),
    ).toBe(true);
    expect(
      (await readFile(join(project.dir, 'src/db/db.ts'))).equals(
        await readFile(EXPECTED_TYPES),
      ),
    ).toBe(true);
    expect(
      (await throwawayDatabases()).filter((name) => !before.includes(name)),
    ).toEqual([]);
  });
});
