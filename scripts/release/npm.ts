import type { RunNpm } from './publisher.ts';

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/**
 * Runs npm for the publish job with nothing of the job's npm configuration:
 * from the release directory, with a user and a global configuration file of
 * its own and without the job's `npm_config_*` variables, so a `.npmrc` of the
 * repository or the runner cannot change the registry or the credentials. The
 * bootstrap token is offered only where asked for, through a configuration
 * line that reads it from `NODE_AUTH_TOKEN` when npm loads it, so it is never
 * written to disk; everywhere else npm has no credential but the one trusted
 * publishing exchanges. Node's builtins only.
 * @ref https://docs.npmjs.com/cli/v11/configuring-npm/npmrc#files
 * @ref https://docs.npmjs.com/cli/v11/using-npm/config#environment-variables
 * @packageDocumentation
 */
import type { SpawnSyncReturns } from 'node:child_process';

/** The configuration line that hands npm the bootstrap token from the environment. */
export const TOKEN_LINE = `//registry.npmjs.org/:_authToken=\${NODE_AUTH_TOKEN}\n`;

/** The oldest npm with `npm stage`, which trusted publishing needs here. */
const OLDEST_NPM = [11, 15, 0] as const;

/** The environment npm runs in: without npm configuration, and without the token unless it is offered. */
export function npmEnvironment(
  env: NodeJS.ProcessEnv,
  withToken: boolean,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        !/^npm_config_/iu.test(key) && (withToken || key !== 'NODE_AUTH_TOKEN'),
    ),
  );
}

/** Why an npm version cannot publish this release, or `undefined` when it can. */
export function npmVersionProblem(version: string): string | undefined {
  const parts = /^(\d+)\.(\d+)\.(\d+)/u
    .exec(version.trim())
    ?.slice(1)
    .map(Number);
  if (parts === undefined) {
    return `npm reported ${JSON.stringify(version.trim())}, which is not a version`;
  }
  for (const [index, oldest] of OLDEST_NPM.entries()) {
    const part = parts[index] ?? 0;
    if (part !== oldest) {
      return part > oldest
        ? undefined
        : `npm ${version.trim()} has no \`npm stage\`; ${OLDEST_NPM.join('.')} or later is needed`;
    }
  }
  return undefined;
}

type Spawn = (
  command: string,
  args: ReadonlyArray<string>,
  options: {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly encoding: 'utf8';
    readonly stdio: ['ignore', 'pipe', 'inherit'];
  },
) => Pick<SpawnSyncReturns<string>, 'status' | 'stdout'>;

/**
 * An npm runner whose working directory is the release `directory`, with its
 * configuration files in the empty `scratch` directory.
 */
export function npmRunner(
  directory: string,
  scratch: string,
  spawn: Spawn = spawnSync,
): RunNpm {
  const token = join(scratch, 'token.npmrc');
  const none = join(scratch, 'none.npmrc');
  const global = join(scratch, 'global.npmrc');
  writeFileSync(token, TOKEN_LINE);
  writeFileSync(none, '');
  writeFileSync(global, '');
  return (args, withToken) => {
    const result = spawn(
      'npm',
      [
        ...args,
        `--userconfig=${withToken ? token : none}`,
        `--globalconfig=${global}`,
      ],
      {
        cwd: directory,
        env: npmEnvironment(process.env, withToken),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );
    return { status: result.status, stdout: result.stdout };
  };
}
