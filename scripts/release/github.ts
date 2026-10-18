import { spawnSync } from 'node:child_process';

/**
 * The GitHub REST API through the `gh` CLI, which the runners have and which
 * reads its token from `GH_TOKEN`. A 404 reads as `undefined`; any other
 * failure is an error naming the call and the HTTP status. Node's builtins
 * only.
 * @ref https://cli.github.com/manual/gh_api
 * @packageDocumentation
 */
import type { SpawnSyncReturns } from 'node:child_process';

/** The calls the GitHub release job makes. */
export interface GitHub {
  /** A resource, or `undefined` when GitHub answers 404. */
  get: (path: string) => unknown;
  /** Every item of a paginated list. */
  list: (path: string) => Array<unknown>;
  post: (path: string, body: unknown) => unknown;
}

type Spawn = (
  command: string,
  args: ReadonlyArray<string>,
  options: { readonly input?: string; readonly encoding: 'utf8' },
) => Pick<SpawnSyncReturns<string>, 'status' | 'stdout' | 'stderr'>;

const HEADERS = [
  '-H',
  'Accept: application/vnd.github+json',
  '-H',
  'X-GitHub-Api-Version: 2022-11-28',
];

/**
 * A GitHub client over `gh api`.
 */
export function ghApi(spawn: Spawn = spawnSync): GitHub {
  const call = (
    method: string,
    path: string,
    extra: ReadonlyArray<string>,
    body?: unknown,
  ): { readonly found: boolean; readonly value: unknown } => {
    const result = spawn(
      'gh',
      [
        'api',
        '--method',
        method,
        ...HEADERS,
        ...extra,
        path,
        ...(body === undefined ? [] : ['--input', '-']),
      ],
      {
        ...(body === undefined ? {} : { input: JSON.stringify(body) }),
        encoding: 'utf8',
      },
    );
    if (result.status === 0) {
      const text = result.stdout.trim();
      return { found: true, value: text === '' ? null : JSON.parse(text) };
    }
    const status = /\(HTTP (\d{3})\)/u.exec(result.stderr)?.[1];
    if (status === '404') {
      return { found: false, value: undefined };
    }
    throw new Error(
      `gh api ${method} ${path} failed${status === undefined ? '' : ` with HTTP ${status}`}`,
    );
  };
  return {
    get: (path) => call('GET', path, []).value,
    list: (path) => {
      const { found, value } = call('GET', path, ['--paginate', '--slurp']);
      if (!found) {
        return [];
      }
      if (
        !Array.isArray(value) ||
        !value.every((page) => Array.isArray(page))
      ) {
        throw new TypeError(
          `gh api GET ${path} answered something other than pages of a list`,
        );
      }
      return (value as ReadonlyArray<ReadonlyArray<unknown>>).flat();
    },
    post: (path, body) => call('POST', path, [], body).value,
  };
}
