import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  npmEnvironment,
  npmRunner,
  npmVersionProblem,
  TOKEN_LINE,
} from './npm.ts';

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
});
