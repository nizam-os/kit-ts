/**
 * runCli (SPEC 11.2) against real extractions in PGlite and a live database
 * behind a socket server: output, exit codes, and the messages of usage and
 * configuration errors.
 */
import type { TestDatabase } from '../test-support/live-database';

import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { drift } from '../commands/drift';
import { loadConfigFile } from '../config-file';
import { pgliteDatabase } from '../test-support/live-database';
import { USAGE } from './arguments';
import { runCli } from './main';

const MIGRATION =
  'create table people (id int primary key, name text not null);';
const OUTPUTS = { catalog: 'generated/catalog.ts', types: 'generated/db.ts' };
const HELP_HINT = 'Run pg-catalog --help for usage.\n';

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function cli(cwd: string, ...args: ReadonlyArray<string>): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

/** A project in a new directory: the migration, and a configuration that writes the catalog and the types. */
async function createProject(
  environments: Readonly<Record<string, string>> = {},
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pg-catalog-cli-'));
  await mkdir(join(dir, 'migrations'));
  await writeFile(join(dir, 'migrations', 'V1__people.sql'), MIGRATION);
  const members = Object.entries(environments).map(
    ([name, url]) => `${name}: { url: ${JSON.stringify(url)} }`,
  );
  await writeFile(
    join(dir, 'pg-catalog.config.mjs'),
    `export default {
  migrations: 'migrations',
  out: ${JSON.stringify(OUTPUTS)},
  drift: { ${members.join(', ')} },
};
`,
  );
  return dir;
}

describe('runCli: usage (SPEC 11.2)', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pg-catalog-cli-usage-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('prints the usage to standard output for --help', async () => {
    expect(await cli(dir, '--help')).toEqual({
      code: 0,
      stdout: USAGE,
      stderr: '',
    });
  });

  it('prints the version of the package for --version', async () => {
    const manifest = createRequire(import.meta.url)('../../package.json') as {
      version: string;
    };
    expect(await cli(dir, '--version')).toEqual({
      code: 0,
      stdout: `${manifest.version}\n`,
      stderr: '',
    });
  });

  it('reports a usage error with exit code 2 and a pointer to --help', async () => {
    for (const [args, message] of [
      [['generate'], 'unknown command generate'],
      [['extract', '--force'], "Unknown option '--force'"],
    ] as const) {
      const run = await cli(dir, ...args);
      expect(run.code).toBe(2);
      expect(run.stdout).toBe('');
      expect(run.stderr.startsWith(`pg-catalog: ${message}`)).toBe(true);
      expect(run.stderr.endsWith(`\n${HELP_HINT}`)).toBe(true);
    }
  });
});

describe('runCli: extract (SPEC 10.1, 11.2)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createProject();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the files, reports them unchanged on the next run, and --check fails only once a migration changes them', async () => {
    expect(await cli(dir, 'extract')).toEqual({
      code: 0,
      stdout: 'written   generated/catalog.ts\nwritten   generated/db.ts\n',
      stderr: '',
    });
    const unchanged =
      'unchanged generated/catalog.ts\nunchanged generated/db.ts\n';
    expect(await cli(dir, 'extract')).toEqual({
      code: 0,
      stdout: unchanged,
      stderr: '',
    });
    expect(await cli(dir, 'extract', '--check')).toEqual({
      code: 0,
      stdout: unchanged,
      stderr: '',
    });

    const before = await readFile(join(dir, OUTPUTS.catalog), 'utf8');
    await writeFile(
      join(dir, 'migrations', 'V2__email.sql'),
      'alter table people add column email text;',
    );
    expect(await cli(dir, 'extract', '--check')).toEqual({
      code: 1,
      stdout: 'stale     generated/catalog.ts\nstale     generated/db.ts\n',
      stderr: '',
    });
    expect(await readFile(join(dir, OUTPUTS.catalog), 'utf8')).toBe(before);
  });

  it('--check reports missing files with exit code 1 and writes nothing', async () => {
    expect(await cli(dir, 'extract', '--check')).toEqual({
      code: 1,
      stdout: 'missing   generated/catalog.ts\nmissing   generated/db.ts\n',
      stderr: '',
    });
    await expect(access(join(dir, 'generated'))).rejects.toThrow();
  });

  it('resolves paths against the directory of --config and prints them relative to the working directory', async () => {
    const parent = join(dir, '..');
    const run = await cli(
      parent,
      'extract',
      '--config',
      join(dir, 'pg-catalog.config.mjs'),
    );
    const name = dir.slice(parent.length + 1);
    expect(run).toEqual({
      code: 0,
      stdout: `written   ${name}/generated/catalog.ts\nwritten   ${name}/generated/db.ts\n`,
      stderr: '',
    });
  });

  it('fails with exit code 2 when there is no configuration file', async () => {
    await rm(join(dir, 'pg-catalog.config.mjs'));
    expect(await cli(dir, 'extract')).toEqual({
      code: 2,
      stdout: '',
      stderr: `pg-catalog: no configuration file in ${dir}: create pg-catalog.config.ts (or .mts, .js, .mjs), or pass --config <file>\n`,
    });
  });

  it('reports a migration that fails to replay with exit code 2, and writes nothing', async () => {
    await writeFile(
      join(dir, 'migrations', 'V2__typo.sql'),
      'alter table people add colum email text;',
    );
    const run = await cli(dir, 'extract');
    expect(run.code).toBe(2);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(
      /^pg-catalog: migration V2__typo\.sql failed at line 1, column \d+: syntax error/u,
    );
    await expect(access(join(dir, 'generated'))).rejects.toThrow();
  });

  it('reports an error a function of the configuration throws with its stack and exit code 2', async () => {
    await writeFile(
      join(dir, 'throwing.config.mjs'),
      `export default {
  migrations: () => { throw new Error('the migrations bucket is unreachable'); },
  out: { catalog: 'catalog.ts' },
};
`,
    );
    const run = await cli(dir, 'extract', '--config', 'throwing.config.mjs');
    expect(run.code).toBe(2);
    expect(run.stderr).toMatch(
      /^pg-catalog: Error: the migrations bucket is unreachable\n {4}at /u,
    );
  });
});

describe('runCli: drift (SPEC 10.2, 11.2)', () => {
  let live: TestDatabase;
  let dir: string;

  beforeAll(async () => {
    live = await pgliteDatabase();
    await live.run(MIGRATION);
    dir = await createProject({ local: live.url });
    expect((await cli(dir, 'extract')).code).toBe(0);
  });

  afterAll(async () => {
    await live.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('exits 0 with No differences, or the empty diff as JSON, when the database matches the committed catalog', async () => {
    expect(await cli(dir, 'drift', '--env', 'local')).toEqual({
      code: 0,
      stdout: 'No differences\n',
      stderr: '',
    });
    const json = await cli(dir, 'drift', '--env', 'local', '--json');
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual({ changes: [] });
  });

  it('fails with exit code 2 for an environment the configuration lacks', async () => {
    expect(await cli(dir, 'drift', '--env', 'staging')).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'pg-catalog: drift environment staging is not configured; the configuration has local\n',
    });
  });

  it('exits 1 and prints the differences, as text or as the CatalogDiff itself, after a hotfix', async () => {
    await live.run('alter table people add column fax text;');
    expect(await cli(dir, 'drift', '--env', 'local')).toEqual({
      code: 1,
      stdout: '1 object differs: 1 added\n\nColumns\n  + people.fax\n',
      stderr: '',
    });
    const json = await cli(dir, 'drift', '--env', 'local', '--json');
    expect(json.code).toBe(1);
    const config = await loadConfigFile(join(dir, 'pg-catalog.config.mjs'));
    const { diff } = await drift(config, 'local', { cwd: dir });
    expect(JSON.parse(json.stdout)).toEqual(diff);
    expect(json.stdout).toBe(`${JSON.stringify(diff, null, 2)}\n`);
  });
});
