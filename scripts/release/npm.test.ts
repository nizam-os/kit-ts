import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { integrityOf } from './manifest.ts';
import {
  npmEnvironment,
  npmRunner,
  npmVersionProblem,
  TOKEN_LINE,
} from './npm.ts';
import { npmArgs, npmReport } from './publisher.ts';
import { packageEntries, releaseOf, tarballOf } from './test-support.ts';

/**
 * Whether the npm on the `PATH` is one the publish job runs: it refuses an
 * npm without `npm stage` (publish.ts), such as Node 22's.
 */
const npmOfTheJob = ((): boolean => {
  const npm = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  return npm.status === 0 && npmVersionProblem(npm.stdout) === undefined;
})();

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'kit-release-npm-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('npmEnvironment', () => {
  const env = {
    PATH: '/bin',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token',
    NODE_AUTH_TOKEN: 'secret',
    npm_config_registry: 'https://elsewhere',
    NPM_CONFIG_USERCONFIG: '/x',
  };

  it('drops the npm configuration and the token unless it is offered', () => {
    expect(npmEnvironment(env, false)).toEqual({
      PATH: '/bin',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token',
    });
    expect(npmEnvironment(env, true)).toEqual({
      PATH: '/bin',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token',
      NODE_AUTH_TOKEN: 'secret',
    });
  });
});

describe('npmVersionProblem', () => {
  it.each(['11.15.0', '11.19.1\n', '12.2.1', '11.15.0-pre.1'])(
    'takes npm %j',
    (version) => {
      expect(npmVersionProblem(version)).toBeUndefined();
    },
  );

  it('refuses an npm without npm stage, or no version at all', () => {
    expect(npmVersionProblem('11.14.9')).toBe(
      'npm 11.14.9 has no `npm stage`; 11.15.0 or later is needed',
    );
    expect(npmVersionProblem('10.99.0')).toBe(
      'npm 10.99.0 has no `npm stage`; 11.15.0 or later is needed',
    );
    expect(npmVersionProblem('')).toBe(
      'npm reported "", which is not a version',
    );
  });
});

describe('npmRunner', () => {
  it('runs npm from the release directory with configuration files of its own', () => {
    vi.stubEnv('NODE_AUTH_TOKEN', 'secret');
    vi.stubEnv('npm_config_registry', 'https://elsewhere');
    const seen: Array<{
      args: ReadonlyArray<string>;
      cwd: string;
      env: NodeJS.ProcessEnv;
    }> = [];
    const run = npmRunner('/release', scratch, (command, args, options) => {
      expect(command).toBe('npm');
      seen.push({ args, cwd: options.cwd, env: options.env });
      return { status: 0, stdout: '{}' };
    });
    expect(run(['stage', 'publish', 'a.tgz'], false)).toEqual({
      status: 0,
      stdout: '{}',
    });
    run(['publish', 'a.tgz'], true);
    const [staged, published] = seen;
    expect(staged?.cwd).toBe('/release');
    expect(staged?.args).toEqual([
      'stage',
      'publish',
      'a.tgz',
      `--userconfig=${join(scratch, 'none.npmrc')}`,
      `--globalconfig=${join(scratch, 'global.npmrc')}`,
    ]);
    expect(staged?.env['NODE_AUTH_TOKEN']).toBeUndefined();
    expect(staged?.env['npm_config_registry']).toBeUndefined();
    expect(published?.args).toContain(
      `--userconfig=${join(scratch, 'token.npmrc')}`,
    );
    expect(published?.env['NODE_AUTH_TOKEN']).toBe('secret');
    expect(readFileSync(join(scratch, 'token.npmrc'), 'utf8')).toBe(TOKEN_LINE);
    expect(TOKEN_LINE).toBe(
      `//registry.npmjs.org/:_authToken=\${NODE_AUTH_TOKEN}\n`,
    );
    expect(readFileSync(join(scratch, 'none.npmrc'), 'utf8')).toBe('');
    expect(readFileSync(join(scratch, 'global.npmrc'), 'utf8')).toBe('');
  });

  it.runIf(npmOfTheJob).each([
    { command: 'npm publish', stage: false },
    { command: 'npm stage publish', stage: true },
  ])(
    'runs npm itself, which reads $command as the publisher writes it',
    ({ stage }) => {
      // Should npm take the tarball for a repository again, git fails at once
      // instead of reaching out to GitHub.
      vi.stubEnv('GIT_ALLOW_PROTOCOL', 'file');
      vi.stubEnv('NODE_AUTH_TOKEN', 'npm_dry-run');
      const release = releaseOf('@nizam-os/ban-core', '0.1.0');
      const tarball = tarballOf(packageEntries(release.name, release.version));
      const directory = join(scratch, 'release');
      mkdirSync(join(directory, 'packages'), { recursive: true });
      writeFileSync(join(directory, release.file), tarball);
      const configuration = join(scratch, 'npm');
      mkdirSync(configuration);
      // A dry run offline: npm reads the arguments and the tarball they name
      // and reports what it would send, reaching no registry.
      const result = npmRunner(directory, configuration)(
        [
          ...npmArgs(release, stage),
          '--dry-run',
          '--offline',
          `--cache=${join(scratch, 'cache')}`,
          '--loglevel=error',
        ],
        !stage,
      );
      expect(result.status).toBe(0);
      expect(npmReport(result.stdout, release.name).integrity).toBe(
        integrityOf(tarball),
      );
    },
    60_000,
  );
});
