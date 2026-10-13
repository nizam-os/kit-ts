/**
 * runCli surface (SPEC 11.2) on a project whose configuration imports its
 * registry lazily, as an application's does: `surface` writes the snapshot
 * and says so; `surface --check` prints the changes from it and exits 1 on
 * a breaking one or a missing file, 0 otherwise, and 2 when it cannot run.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { runCli } from './main';

const REGISTRY_MODULE = new URL(
  '../test-support/oracle-registry.ts',
  import.meta.url,
).href;

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

/** A configuration whose registry gives `teams` the fields `teamFields`, its surface in `surface`. */
function configFile(surface: string, teamFields?: object): string {
  const edits = teamFields === undefined ? '' : JSON.stringify(teamFields);
  return `export default {
  migrations: 'migrations',
  out: { catalog: 'catalog.ts' },
  resources: {
    registry: async () => (await import(${JSON.stringify(REGISTRY_MODULE)})).extractedRegistry(${edits}),
    surface: ${JSON.stringify(surface)},
  },
};
`;
}

beforeAll(async () => {
  project = await mkdtemp(join(tmpdir(), 'pg-catalog-surface-cli-'));
  const files: Readonly<Record<string, string>> = {
    'pg-catalog.config.mjs': configFile('api-surface.json'),
    'fresh.config.mjs': configFile('fresh/api-surface.json'),
    'safe.config.mjs': configFile('api-surface.json', {
      name: { access: 'readWrite', filter: ['eq'] },
    }),
    'breaking.config.mjs': configFile('api-surface.json', {
      name: { access: 'read' },
    }),
    'bare.config.mjs': `export default { migrations: 'migrations', out: { catalog: 'catalog.ts' } };\n`,
  };
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(project, name), text);
  }
  expect((await cli('surface')).code).toBe(0);
});

describe('pg-catalog surface (SPEC 11.2)', () => {
  it('writes the snapshot, then finds it current', async () => {
    expect(
      await cli('surface', '--check', '--config', 'fresh.config.mjs'),
    ).toEqual({
      code: 1,
      stdout:
        'fresh/api-surface.json: missing; write it with pg-catalog surface\n',
      stderr: '',
    });
    expect(await cli('surface', '--config', 'fresh.config.mjs')).toEqual({
      code: 0,
      stdout: 'written   fresh/api-surface.json\n',
      stderr: '',
    });
    expect(await cli('surface', '--config', 'fresh.config.mjs')).toEqual({
      code: 0,
      stdout: 'unchanged fresh/api-surface.json\n',
      stderr: '',
    });
    expect(await cli('surface', '--check')).toEqual({
      code: 0,
      stdout: 'api-surface.json: no changes\n',
      stderr: '',
    });
  });

  it('exits 0 when every change is safe, and 1 on a breaking one', async () => {
    expect(
      await cli('surface', '--check', '--config', 'safe.config.mjs'),
    ).toEqual({
      code: 0,
      stdout: [
        'api-surface.json: 1 change, none breaking',
        '',
        'Safe',
        '  + teams.fields.name.operators.eq',
        '',
        'Run pg-catalog surface to record them.',
        '',
      ].join('\n'),
      stderr: '',
    });
    expect(
      await cli('surface', '--check', '--config', 'breaking.config.mjs'),
    ).toEqual({
      code: 1,
      stdout: [
        'api-surface.json: 3 changes, 2 breaking',
        '',
        'Breaking',
        '  ~ teams.fields.name.access: "readWrite" -> "read"',
        '  - teams.codes.TEAMS_NAME_NOT_NULL',
        '',
        'Safe',
        '  ~ teams.fields.name.required: true -> false',
        '',
        'Run pg-catalog surface to record them.',
        '',
      ].join('\n'),
      stderr: '',
    });
  });

  it('exits 2 when it cannot run', async () => {
    expect(await cli('surface', '--config', 'bare.config.mjs')).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'pg-catalog: resources is not configured: set resources.registry to a function that returns the declared resources\n',
    });
    expect(await cli('surface', '--json')).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'pg-catalog: surface does not take --json\nRun pg-catalog --help for usage.\n',
    });
  });
});
