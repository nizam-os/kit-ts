/**
 * `extract` on a realistic application (SPEC 10.1, 13.1): the contacts
 * fixture's Flyway migrations replay into PGlite through the built package,
 * and the three generated files must equal `fixtures/contacts/expected/`
 * byte for byte, on every run.
 */
import type { Project } from './support/project';

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extract } from '@nizam-os/pg-catalog';

import {
  contactsConfig,
  EXPECTED_CATALOG,
  EXPECTED_PUBLIC,
  EXPECTED_TYPES,
} from './support/contacts';
import { createProject } from './support/project';

let project: Project;

beforeEach(async () => {
  project = await createProject();
});

afterEach(async () => {
  await project.remove();
});

async function generated(path: string): Promise<Buffer> {
  return readFile(join(project.dir, path));
}

describe('extract on the contacts application', () => {
  it('writes catalog.ts, public-catalog.ts, and db.ts equal to the reviewed files, byte for byte', async () => {
    const report = await extract(contactsConfig, { cwd: project.dir });
    expect(report.files.map((file) => [file.kind, file.status])).toEqual([
      ['catalog', 'written'],
      ['public', 'written'],
      ['types', 'written'],
    ]);
    expect(
      (await generated('src/db/catalog.ts')).equals(
        await readFile(EXPECTED_CATALOG),
      ),
    ).toBe(true);
    expect(
      (await generated('src/db/public-catalog.ts')).equals(
        await readFile(EXPECTED_PUBLIC),
      ),
    ).toBe(true);
    expect(
      (await generated('src/db/db.ts')).equals(await readFile(EXPECTED_TYPES)),
    ).toBe(true);
  });

  it('produces the same bytes on a second run in a fresh database, and leaves the files untouched', async () => {
    await extract(contactsConfig, { cwd: project.dir });
    const first = await generated('src/db/catalog.ts');
    const report = await extract(contactsConfig, { cwd: project.dir });
    expect(report.files.map((file) => file.status)).toEqual([
      'unchanged',
      'unchanged',
      'unchanged',
    ]);
    expect((await generated('src/db/catalog.ts')).equals(first)).toBe(true);
  });

  it('check passes on current files and fails on exactly the file a new migration changes', async () => {
    await extract(contactsConfig, { cwd: project.dir });
    const current = await extract(contactsConfig, {
      cwd: project.dir,
      check: true,
    });
    expect(current.files.map((file) => file.status)).toEqual([
      'unchanged',
      'unchanged',
      'unchanged',
    ]);

    // audit.changes is not a public table, so public-catalog.ts stays current.
    // V100 runs after every fixture migration, however many there are.
    await writeFile(
      join(project.dir, 'migrations/V100__actor.sql'),
      'alter table audit.changes add column actor text;',
    );
    const stale = await extract(contactsConfig, {
      cwd: project.dir,
      check: true,
    });
    expect(stale.files.map((file) => file.status)).toEqual([
      'stale',
      'unchanged',
      'stale',
    ]);
    expect(
      stale.catalog.tables['audit.changes']?.columns['actor']?.nullable,
    ).toBe(true);
    // check never writes.
    expect(
      (await generated('src/db/catalog.ts')).equals(
        await readFile(EXPECTED_CATALOG),
      ),
    ).toBe(true);
  });

  it('reports missing files under check, without creating them', async () => {
    const report = await extract(contactsConfig, {
      cwd: project.dir,
      check: true,
    });
    expect(report.files.map((file) => file.status)).toEqual([
      'missing',
      'missing',
      'missing',
    ]);
    await expect(generated('src/db/catalog.ts')).rejects.toThrow();
  });

  it('names the failing migration, line, and column when a migration breaks', async () => {
    await writeFile(
      join(project.dir, 'migrations/V100__broken.sql'),
      'alter table contacts\n  add column notes txt;',
    );
    await expect(extract(contactsConfig, { cwd: project.dir })).rejects.toThrow(
      expect.objectContaining({
        code: 'migration_failed',
        message:
          'migration V100__broken.sql failed at line 2, column 20: type "txt" does not exist (SQLSTATE 42704)',
      }),
    );
  });
});
