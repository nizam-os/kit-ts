/**
 * runCli rules --check (SPEC 11.2) on a project whose configuration
 * imports its registry lazily, as an application's does: the report on
 * standard output, and exit 0 when the declarations and the database
 * agree, 1 when they disagree, 2 when the command cannot run.
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { ORACLE_MIGRATIONS } from '../test-support/oracle-registry';
import { runCli } from './main';

const REGISTRY_MODULE = new URL(
  '../test-support/oracle-registry.ts',
  import.meta.url,
).href;

/** A storage codec for `slots` that writes the upper bound inclusive, which PostgreSQL moves. */
const FAULTY_SLOTS = `{ read: slotsText.read, write: ({ from, to }) => \`[\${from},\${to}]\` }`;

let project: string;

async function cli(...args: ReadonlyArray<string>): Promise<{
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    cwd: project,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

function configFile(slots: string | null): string {
  const resources =
    slots === null
      ? ''
      : `resources: {
    registry: async () => (await import(${JSON.stringify(REGISTRY_MODULE)})).extractedRegistry(),
    storage: { slots: ${slots} },
  },`;
  return `import { slotsText } from ${JSON.stringify(REGISTRY_MODULE)};

export default {
  migrations: 'migrations',
  out: { catalog: 'catalog.ts', public: { file: 'public.ts', tables: ['members', 'teams', 'notes'] } },
  ${resources}
};
`;
}

beforeAll(async () => {
  project = await mkdtemp(join(tmpdir(), 'pg-catalog-rules-'));
  await mkdir(join(project, 'migrations'));
  for (const migration of ORACLE_MIGRATIONS) {
    await writeFile(join(project, 'migrations', migration.name), migration.sql);
  }
  await writeFile(join(project, 'pg-catalog.config.mjs'), configFile('slotsText'));
  await writeFile(join(project, 'faulty.config.mjs'), configFile(FAULTY_SLOTS));
  await writeFile(join(project, 'bare.config.mjs'), configFile(null));
});

describe('pg-catalog rules --check (SPEC 11.2)', () => {
  it('prints the report and exits 0 when the declarations and the database agree', async () => {
    const run = await cli('rules', '--check');
    expect(run.stderr).toBe('');
    expect(run.stdout).toMatch(
      /^9 cases, \d+ fixtures: no disagreements\n\nwarning: out\.public\.tables lists notes, which no declared resource reads\n$/u,
    );
    expect(run.code).toBe(0);
  });

  it('prints each disagreement and exits 1 when they disagree', async () => {
    const run = await cli('rules', '--check', '--config', 'faulty.config.mjs');
    expect(run.stdout).toContain(
      'teams.slots (codec slots)\n  fixtures[0] {"from":1,"to":5}: the database stores [1,6), which reads back as {"from":1,"to":6}\n',
    );
    expect(run.code).toBe(1);
  });

  it('exits 2 when the configuration has no resources', async () => {
    const run = await cli('rules', '--check', '--config', 'bare.config.mjs');
    expect(run).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'pg-catalog: resources is not configured: set resources.registry to a function that returns the declared resources\n',
    });
  });

  it('exits 2 with a pointer to --help when --check is missing', async () => {
    const run = await cli('rules');
    expect(run).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'pg-catalog: rules needs --check\nRun pg-catalog --help for usage.\n',
    });
  });
});
