/**
 * The `pg-catalog` bin (SPEC 11.2, 13.1), run as a package manager runs it:
 * the built file package.json's `bin` names, in a Node.js process of its
 * own, inside a project whose configuration file imports
 * `defineExtraction` from the installed package. extract writes the
 * reviewed files byte for byte, extract --check gates a hand edit, and
 * drift reports a hotfix on PGlite over a socket and on the server
 * `CATALOG_PG_URL` names. A TypeScript configuration loads where Node.js
 * strips types, and fails with directions where it does not.
 * @ref https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bin
 */
import type { LiveDatabase } from './support/live-database';

import { spawn } from 'node:child_process';
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { drift } from '@nizam-os/pg-catalog';

import {
  contactsConfig,
  EXPECTED_CATALOG,
  EXPECTED_PUBLIC,
  EXPECTED_TYPES,
  HOTFIX,
  HOTFIX_REPORT,
  MIGRATIONS_DIR,
  PGLITE_EXTENSIONS,
  PUBLIC_TABLES,
} from './support/contacts';
import { liveDatabases } from './support/live-database';

/** Projects live under this package, so their configuration resolves `@nizam-os/pg-catalog` from its node_modules. */
const PROJECTS = fileURLToPath(new URL('.tmp/', import.meta.url));
const URL_VARIABLE = 'CONTACTS_DATABASE_URL';
const WRITTEN =
  'written   src/db/catalog.ts\nwritten   src/db/public-catalog.ts\nwritten   src/db/db.ts\n';
const UNCHANGED =
  'unchanged src/db/catalog.ts\nunchanged src/db/public-catalog.ts\nunchanged src/db/db.ts\n';
/** Node.js 24.12 and 25.2 name the flag `--strip-types`; earlier versions accept only the experimental name. */
const NO_STRIP_TYPES = process.allowedNodeEnvironmentFlags.has('--strip-types')
  ? '--no-strip-types'
  : '--no-experimental-strip-types';

interface Manifest {
  readonly version: string;
  readonly bin: Readonly<Record<string, string>>;
}

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

async function manifest(): Promise<{
  readonly path: string;
  readonly manifest: Manifest;
}> {
  const path = createRequire(import.meta.url).resolve(
    '@nizam-os/pg-catalog/package.json',
  );
  return {
    path,
    manifest: JSON.parse(await readFile(path, 'utf8')) as Manifest,
  };
}

const installed = await manifest();
const BIN = join(
  dirname(installed.path),
  installed.manifest.bin['pg-catalog'] ?? '',
);

/** Runs the bin in `cwd`; `env` adds to this process's environment, with `undefined` removing a variable. */
async function pgCatalog(
  cwd: string,
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string | undefined>> = {},
  nodeOptions: ReadonlyArray<string> = [],
): Promise<Run> {
  const child = spawn(process.execPath, [...nodeOptions, BIN, ...args], {
    cwd,
    env: { ...process.env, ...env },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  return { code, stdout, stderr };
}

/** The contacts configuration as an application writes it; `typed` adds what only TypeScript accepts. */
function configSource(typed: boolean): string {
  return `import { defineExtraction } from '@nizam-os/pg-catalog';
${typed ? "import type { ExtractionConfig } from '@nizam-os/pg-catalog';\n" : ''}
const schemas${typed ? ': ReadonlyArray<string>' : ''} = ['public', 'audit'];

export default defineExtraction({
  migrations: 'migrations',
  database: { pglite: { extensions: ${JSON.stringify(PGLITE_EXTENSIONS)} } },
  schemas,
  out: {
    catalog: 'src/db/catalog.ts',
    public: { file: 'src/db/public-catalog.ts', tables: ${JSON.stringify(PUBLIC_TABLES)} },
    types: 'src/db/db.ts',
  },
  drift: { production: { url: () => process.env.${URL_VARIABLE} } },
})${typed ? ' satisfies ExtractionConfig' : ''};
`;
}

async function createProject(
  configFile: 'pg-catalog.config.mjs' | 'pg-catalog.config.ts',
): Promise<string> {
  await mkdir(PROJECTS, { recursive: true });
  const dir = await mkdtemp(join(PROJECTS, 'cli-'));
  await cp(MIGRATIONS_DIR, join(dir, 'migrations'), { recursive: true });
  await writeFile(
    join(dir, configFile),
    configSource(configFile.endsWith('.ts')),
  );
  return dir;
}

async function sameBytes(path: string, expected: string): Promise<boolean> {
  return (await readFile(path)).equals(await readFile(expected));
}

afterAll(async () => {
  await rm(PROJECTS, { recursive: true, force: true });
});

describe('the pg-catalog bin with pg-catalog.config.mjs', () => {
  let project: string;

  beforeAll(async () => {
    project = await createProject('pg-catalog.config.mjs');
  });

  it('prints the installed version', async () => {
    expect(await pgCatalog(project, ['--version'])).toEqual({
      code: 0,
      stdout: `${installed.manifest.version}\n`,
      stderr: '',
    });
  });

  it('extract writes the reviewed catalog, public catalog, and types, byte for byte', async () => {
    expect(await pgCatalog(project, ['extract'])).toEqual({
      code: 0,
      stdout: WRITTEN,
      stderr: '',
    });
    expect(
      await sameBytes(join(project, 'src/db/catalog.ts'), EXPECTED_CATALOG),
    ).toBe(true);
    expect(
      await sameBytes(
        join(project, 'src/db/public-catalog.ts'),
        EXPECTED_PUBLIC,
      ),
    ).toBe(true);
    expect(await sameBytes(join(project, 'src/db/db.ts'), EXPECTED_TYPES)).toBe(
      true,
    );
  });

  it('extract --check passes on current files, fails on exactly the file edited by hand, and extract repairs it', async () => {
    expect(await pgCatalog(project, ['extract', '--check'])).toEqual({
      code: 0,
      stdout: UNCHANGED,
      stderr: '',
    });
    await appendFile(join(project, 'src/db/db.ts'), '// edited by hand\n');
    expect(await pgCatalog(project, ['extract', '--check'])).toEqual({
      code: 1,
      stdout:
        'unchanged src/db/catalog.ts\nunchanged src/db/public-catalog.ts\nstale     src/db/db.ts\n',
      stderr: '',
    });
    expect((await pgCatalog(project, ['extract'])).code).toBe(0);
    expect(await sameBytes(join(project, 'src/db/db.ts'), EXPECTED_TYPES)).toBe(
      true,
    );
  });

  it('drift fails with exit code 2 before connecting when the URL variable is not set', async () => {
    expect(
      await pgCatalog(project, ['drift', '--env', 'production'], {
        [URL_VARIABLE]: undefined,
      }),
    ).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'pg-catalog: drift.production.url returned no URL; set the environment variable it reads\n',
    });
  });
});

for (const [name, open] of liveDatabases()) {
  describe(`the pg-catalog bin: drift on ${name}`, () => {
    let project: string;
    let live: LiveDatabase;

    beforeAll(async () => {
      project = await createProject('pg-catalog.config.mjs');
      await mkdir(join(project, 'src/db'), { recursive: true });
      await cp(EXPECTED_CATALOG, join(project, 'src/db/catalog.ts'));
      live = await open();
    });

    afterAll(async () => {
      await live.close();
    });

    it('exits 0 on the database the migrations built, and 1 with the three objects a hotfix changed', async () => {
      const env = { [URL_VARIABLE]: live.url };
      expect(
        await pgCatalog(project, ['drift', '--env', 'production'], env),
      ).toEqual({ code: 0, stdout: 'No differences\n', stderr: '' });
      await live.pool.query(HOTFIX);
      expect(
        await pgCatalog(project, ['drift', '--env', 'production'], env),
      ).toEqual({ code: 1, stdout: `${HOTFIX_REPORT}\n`, stderr: '' });
      const json = await pgCatalog(
        project,
        ['drift', '--env', 'production', '--json'],
        env,
      );
      expect(json.code).toBe(1);
      const config = {
        ...contactsConfig,
        drift: { production: { url: live.url } },
      };
      expect(JSON.parse(json.stdout)).toEqual(
        (await drift(config, 'production', { cwd: project })).diff,
      );
    });
  });
}

describe('the pg-catalog bin with pg-catalog.config.ts', () => {
  let project: string;

  beforeAll(async () => {
    project = await createProject('pg-catalog.config.ts');
  });

  it.runIf(Boolean(process.features.typescript))(
    'loads it where Node.js strips types',
    async () => {
      expect(await pgCatalog(project, ['extract'])).toEqual({
        code: 0,
        stdout: WRITTEN,
        stderr: '',
      });
      expect(
        await sameBytes(join(project, 'src/db/catalog.ts'), EXPECTED_CATALOG),
      ).toBe(true);
    },
  );

  it('explains what to do where Node.js does not strip types', async () => {
    expect(
      await pgCatalog(project, ['extract', '--check'], {}, [NO_STRIP_TYPES]),
    ).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'pg-catalog: cannot load pg-catalog.config.ts: this Node.js does not strip TypeScript types; use Node.js 22.18 or later, set NODE_OPTIONS=--experimental-strip-types on Node.js 22.12 to 22.17, or write pg-catalog.config.mjs\n',
    });
  });
});
