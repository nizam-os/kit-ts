/**
 * introspectCatalog and drift (SPEC 10.2, ADR 0008) on live databases:
 * PGlite behind a socket server always, and the server `CATALOG_PG_URL`
 * names when it is set. The committed catalog is extracted with PGlite, as
 * applications do, so the server run also proves that a PostgreSQL 14
 * production database shows no false drift. Configuration and file errors
 * fail before any connection is made.
 */
import type { Catalog } from '@nizam-os/catalog-core';

import type { ExtractionConfig } from '../config';
import type { TestDatabase } from '../test-support/live-database';

import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { renderCatalogModule } from '../render/catalog-module';
import { catalogOf } from '../test-support/kysely-catalog';
import { pgliteDatabase, serverDatabase } from '../test-support/live-database';
import { drift, introspectCatalog } from './drift';
import { extractCatalog } from './extract';
import { formatDiff } from './format-diff';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Client } = pg` for ESM
const { Client } = pg;

const SERVER = process.env['CATALOG_PG_URL'];
const SCHEMAS = ['public', 'audit'];
const UNREACHABLE = 'postgres://127.0.0.1:1/never';
const SECRET_BYTES = 12;

const MIGRATION = `create schema audit;
create schema reports;
create table audit.events (
  id bigint generated always as identity primary key,
  kind text not null
);
create table notes (
  id int primary key,
  owner text not null,
  body text not null constraint notes_body_length check (char_length(body) <= 200)
);
alter table notes enable row level security;
create policy notes_owner on notes using (owner = current_user);`;

/** What a hotfix outside the migrations leaves behind: a column, a dropped policy, a changed CHECK. */
const HOTFIX = `alter table notes add column pinned boolean;
drop policy notes_owner on notes;
alter table notes drop constraint notes_body_length,
  add constraint notes_body_length check (char_length(body) <= 100);`;

/** A URL function as an application writes it, reading a variable this process lacks. */
function unsetVariable(): string | undefined {
  return process.env['PG_CATALOG_TEST_UNSET_VARIABLE'];
}

function withDrift(
  environments: NonNullable<ExtractionConfig['drift']>,
): ExtractionConfig {
  return {
    migrations: '.',
    out: { catalog: 'catalog.ts' },
    drift: environments,
  };
}

describe('drift before connecting (SPEC 10.2, 12)', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pg-catalog-drift-'));
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('fails with config_invalid for an environment the configuration does not define', async () => {
    await expect(
      drift({ migrations: '.', out: { catalog: 'c.ts' } }, 'production'),
    ).rejects.toMatchObject({
      code: 'config_invalid',
      message:
        'drift environment production is not configured; the configuration has no drift environments',
    });
    // An inherited member of the record is not an environment.
    await expect(
      drift(withDrift({ staging: { url: UNREACHABLE } }), 'constructor'),
    ).rejects.toMatchObject({
      code: 'config_invalid',
      message:
        'drift environment constructor is not configured; the configuration has staging',
    });
  });

  it('fails with config_invalid when the URL function returns nothing', async () => {
    for (const url of [unsetVariable, () => '', '']) {
      await expect(
        drift(withDrift({ production: { url } }), 'production'),
      ).rejects.toMatchObject({
        code: 'config_invalid',
        message:
          'drift.production.url returned no URL; set the environment variable it reads',
      });
    }
  });

  it('fails with catalog_unreadable or catalog_format for the committed file', async () => {
    const config = withDrift({ production: { url: UNREACHABLE } });
    await expect(
      drift(config, 'production', { cwd: directory }),
    ).rejects.toMatchObject({
      code: 'catalog_unreadable',
      message:
        'cannot read the committed catalog catalog.ts; run pg-catalog extract and commit it',
    });
    const named = { ...config, out: { catalog: { file: 'named.ts' } } };
    await expect(
      drift(named, 'production', { cwd: directory }),
    ).rejects.toMatchObject({
      message:
        'cannot read the committed catalog named.ts; run pg-catalog extract and commit it',
    });
    const current = renderCatalogModule(catalogOf({}));
    await writeFile(
      join(directory, 'catalog.ts'),
      current.replace('"format": 3', '"format": 4'),
    );
    await expect(
      drift(config, 'production', { cwd: directory }),
    ).rejects.toMatchObject({
      code: 'catalog_format',
      message:
        'the catalog module was written in format 4; this version reads format 3, so run pg-catalog extract again',
    });
  });
});

const DATABASES: ReadonlyArray<readonly [string, () => Promise<TestDatabase>]> =
  [
    ['PGlite over a socket', pgliteDatabase],
    ...(SERVER === undefined
      ? []
      : [['a PostgreSQL server', async () => serverDatabase(SERVER)] as const]),
  ];

for (const [name, open] of DATABASES) {
  describe(`introspectCatalog and drift on ${name}`, () => {
    let live: TestDatabase;
    let directory: string;
    let committed: Catalog;
    let config: ExtractionConfig;

    beforeAll(async () => {
      live = await open();
      await live.run(MIGRATION);
      committed = await extractCatalog({
        migrations: () => [{ name: 'V1__init.sql', sql: MIGRATION }],
        schemas: SCHEMAS,
      });
      directory = await mkdtemp(join(tmpdir(), 'pg-catalog-drift-'));
      await writeFile(
        join(directory, 'catalog.ts'),
        renderCatalogModule(committed),
      );
      config = {
        migrations: '.',
        schemas: SCHEMAS,
        out: { catalog: 'catalog.ts' },
        drift: { production: { url: () => live.url } },
      };
    });

    afterAll(async () => {
      await live.close();
      await rm(directory, { recursive: true, force: true });
    });

    it('reads the catalog extract writes for the same migrations', async () => {
      expect(
        await introspectCatalog({ url: live.url, schemas: SCHEMAS }),
      ).toEqual(committed);
    });

    it('finds no drift in a database built from the migrations', async () => {
      expect(await drift(config, 'production', { cwd: directory })).toEqual({
        environment: 'production',
        diff: { changes: [] },
      });
    });

    it('reads the default schema, and resolves against the working directory, when the configuration names neither', async () => {
      const publicOnly = await extractCatalog({
        migrations: () => [{ name: 'V1__init.sql', sql: MIGRATION }],
      });
      expect(await introspectCatalog({ url: live.url })).toEqual(publicOnly);
      const file = join(directory, 'public-catalog.ts');
      await writeFile(file, renderCatalogModule(publicOnly));
      const report = await drift(
        {
          migrations: '.',
          out: { catalog: file },
          drift: { production: { url: live.url } },
        },
        'production',
      );
      expect(report.diff.changes).toEqual([]);
    });

    it("reports exactly a hotfix's column, dropped policy, and changed CHECK", async () => {
      await live.run(HOTFIX);
      const report = await drift(config, 'production', { cwd: directory });
      expect(formatDiff(report.diff)).toBe(
        [
          '3 objects differ: 1 added, 1 removed, 1 changed',
          '',
          'Columns',
          '  + notes.pinned',
          '',
          'Constraints',
          '  ~ notes.notes_body_length',
          '      expression: expected "(char_length(body) <= 200)", actual "(char_length(body) <= 100)"',
          '      rule.max: expected 200, actual 100',
          '      definition: expected "CHECK ((char_length(body) <= 200))", actual "CHECK ((char_length(body) <= 100))"',
          '',
          'Policies',
          '  - notes.notes_owner',
        ].join('\n'),
      );
    });
  });
}

describe.skipIf(SERVER === undefined)(
  'introspectCatalog as a read-only role on CATALOG_PG_URL',
  () => {
    const role = `nizam_drift_${randomBytes(SECRET_BYTES).toString('hex')}`;
    let live: TestDatabase;
    let roleUrl: string;

    beforeAll(async () => {
      live = await serverDatabase(SERVER ?? '');
      await live.run(MIGRATION);
      const password = randomBytes(SECRET_BYTES).toString('hex');
      await live.run(`create role ${role} login password '${password}'`);
      const url = new URL(live.url);
      url.username = role;
      url.password = password;
      roleUrl = url.toString();
    });

    afterAll(async () => {
      await live.close();
      const admin = new Client({ connectionString: SERVER });
      await admin.connect();
      try {
        await admin.query(`drop role if exists ${role}`);
      } finally {
        await admin.end();
      }
    });

    it('refuses with schema_usage while the role cannot use a configured schema', async () => {
      await expect(
        introspectCatalog({ url: roleUrl, schemas: SCHEMAS }),
      ).rejects.toMatchObject({
        code: 'schema_usage',
        message:
          'the role lacks USAGE on schema audit; without it PostgreSQL qualifies every name in that schema, which would read as drift',
      });
      await expect(
        introspectCatalog({
          url: roleUrl,
          schemas: [...SCHEMAS, 'reports', 'missing'],
        }),
      ).rejects.toMatchObject({
        code: 'schema_usage',
        message:
          'the role lacks USAGE on schemas audit, reports; without it PostgreSQL qualifies every name in those schemas, which would read as drift',
      });
    });

    it('reads the whole catalog with CONNECT and USAGE alone', async () => {
      await live.run(`grant usage on schema audit to ${role}`);
      expect(
        await introspectCatalog({ url: roleUrl, schemas: SCHEMAS }),
      ).toEqual(await introspectCatalog({ url: live.url, schemas: SCHEMAS }));
    });
  },
);
