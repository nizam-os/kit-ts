import type { GitHub } from './github.ts';
import type { ReleaseManifest } from './manifest.ts';
import type { ReadRegistry, RegistryState } from './registry.ts';

import { describe, expect, it } from 'vitest';

import { createReleases, waitUntilLive } from './releaser.ts';
import { INTEGRITY, releaseOf } from './test-support.ts';

const COMMIT = 'c'.repeat(40);

const CORE = releaseOf('@nizam-os/ban-core', '0.1.0');
const NEXT = releaseOf('@nizam-os/hono-ban', '2.0.0-next.0', true);
const MANIFEST: ReleaseManifest = {
  version: 1,
  commit: COMMIT,
  releases: [CORE, NEXT],
};

/** A clock whose sleep moves its time on, and remembers each sleep. */
function clock(): {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  slept: Array<number>;
} {
  let time = 0;
  const slept: Array<number> = [];
  return {
    now: () => time,
    sleep: async (ms) => {
      slept.push(ms);
      time += ms;
      await Promise.resolve();
    },
    slept,
  };
}

/** A registry that answers every read with `state`. */
function registryHolding(state: RegistryState): ReadRegistry {
  return async () => {
    await Promise.resolve();
    return state;
  };
}

/** A log that keeps nothing. */
function quiet(): void {
  // The tests that pass it assert on outcomes, not on lines.
}

describe('waitUntilLive', () => {
  it('returns at once when npm holds every version', async () => {
    const { now, sleep, slept } = clock();
    const registry = registryHolding({
      exists: true,
      versions: new Map([
        ['0.1.0', INTEGRITY],
        ['2.0.0-next.0', INTEGRITY],
      ]),
    });
    expect(
      await waitUntilLive(
        [CORE, NEXT],
        { registry, now, sleep, log: quiet },
        60_000,
        30_000,
      ),
    ).toEqual([]);
    expect(slept).toEqual([]);
  });

  it('reads again until a staged version is approved', async () => {
    const { now, sleep, slept } = clock();
    const lines: Array<string> = [];
    let reads = 0;
    const registry = async (name: string): Promise<RegistryState> => {
      await Promise.resolve();
      if (name === NEXT.name) {
        reads += 1;
      }
      return {
        exists: true,
        versions: new Map(
          name === NEXT.name && reads < 3
            ? []
            : [[name === CORE.name ? '0.1.0' : '2.0.0-next.0', INTEGRITY]],
        ),
      };
    };
    expect(
      await waitUntilLive(
        [CORE, NEXT],
        {
          registry,
          now,
          sleep,
          log: (line) => {
            lines.push(line);
          },
        },
        60_000,
        30_000,
      ),
    ).toEqual([]);
    expect(slept).toEqual([30_000, 30_000]);
    expect(lines).toEqual([
      'waiting for npm to hold @nizam-os/hono-ban@2.0.0-next.0',
      'waiting for npm to hold @nizam-os/hono-ban@2.0.0-next.0',
    ]);
  });

  it('returns what is still waiting when the time runs out', async () => {
    const { now, sleep } = clock();
    const registry = registryHolding({ exists: false });
    expect(
      await waitUntilLive(
        [CORE],
        { registry, now, sleep, log: quiet },
        60_000,
        30_000,
      ),
    ).toEqual([CORE]);
  });

  it('stops when npm holds a version with other content', async () => {
    const { now, sleep } = clock();
    const registry = registryHolding({
      exists: true,
      versions: new Map([['0.1.0', 'sha512-other']]),
    });
    await expect(
      waitUntilLive(
        [CORE],
        { registry, now, sleep, log: quiet },
        60_000,
        30_000,
      ),
    ).rejects.toThrow(
      'npm holds @nizam-os/ban-core@0.1.0 with other content than this release built',
    );
  });
});

/** A GitHub holding `refs` and `releases`, which remembers each read and post. */
function githubWith(
  refs: Readonly<Record<string, unknown>>,
  releases: ReadonlyArray<unknown> = [],
): GitHub & {
  posts: Array<{ path: string; body: unknown }>;
  gets: Array<string>;
} {
  const posts: Array<{ path: string; body: unknown }> = [];
  const gets: Array<string> = [];
  return {
    posts,
    gets,
    get: (path) => {
      gets.push(path);
      return refs[path];
    },
    list: (path) => {
      expect(path).toBe('repos/nizam-os/kit-ts/releases?per_page=100');
      return [...releases];
    },
    post: (path, body) => {
      posts.push({ path, body });
      return {};
    },
  };
}

function deps(github: GitHub): Parameters<typeof createReleases>[1] {
  return { github, repository: 'nizam-os/kit-ts', log: quiet };
}

describe('createReleases', () => {
  it('creates one release per package, tagged at the commit, none of them latest', () => {
    const github = githubWith({});
    expect(
      createReleases(MANIFEST, deps(github)).map(({ result }) => result),
    ).toEqual(['released', 'released']);
    expect(github.gets).toEqual([
      'repos/nizam-os/kit-ts/git/ref/tags/@nizam-os/ban-core@0.1.0',
      'repos/nizam-os/kit-ts/git/ref/tags/@nizam-os/hono-ban@2.0.0-next.0',
    ]);
    expect(github.posts).toEqual([
      {
        path: 'repos/nizam-os/kit-ts/releases',
        body: {
          tag_name: '@nizam-os/ban-core@0.1.0',
          target_commitish: COMMIT,
          name: '@nizam-os/ban-core@0.1.0',
          body: 'notes of 0.1.0',
          prerelease: false,
          make_latest: 'false',
        },
      },
      {
        path: 'repos/nizam-os/kit-ts/releases',
        body: {
          tag_name: '@nizam-os/hono-ban@2.0.0-next.0',
          target_commitish: COMMIT,
          name: '@nizam-os/hono-ban@2.0.0-next.0',
          body: 'notes of 2.0.0-next.0',
          prerelease: true,
          make_latest: 'false',
        },
      },
    ]);
  });

  it('leaves a release that is already there, and creates the release of a tag without one', () => {
    const tagged = { object: { type: 'commit', sha: COMMIT } };
    const github = githubWith(
      {
        'repos/nizam-os/kit-ts/git/ref/tags/@nizam-os/ban-core@0.1.0': tagged,
        'repos/nizam-os/kit-ts/git/ref/tags/@nizam-os/hono-ban@2.0.0-next.0':
          tagged,
      },
      [
        { tag_name: '@nizam-os/ban-core@0.1.0' },
        { tag_name: 'hono-ban@1.3.0' },
        null,
      ],
    );
    expect(
      createReleases(MANIFEST, deps(github)).map(({ result }) => result),
    ).toEqual(['already released', 'released']);
    expect(github.posts).toHaveLength(1);
  });

  it('stops at a tag that points elsewhere, is annotated, or is not one GitHub describes', () => {
    for (const reference of [
      { object: { type: 'commit', sha: 'd'.repeat(40) } },
      { object: { type: 'tag', sha: COMMIT } },
      { object: { type: 'commit', sha: 42 } },
      {},
      'a reference',
    ]) {
      const github = githubWith({
        'repos/nizam-os/kit-ts/git/ref/tags/@nizam-os/ban-core@0.1.0':
          reference,
      });
      expect(() => createReleases(MANIFEST, deps(github))).toThrow(
        `the tag @nizam-os/ban-core@0.1.0 exists and does not point to ${COMMIT}`,
      );
      expect(github.posts).toEqual([]);
    }
  });

  it('stops at a release whose tag is gone', () => {
    const github = githubWith({}, [{ tag_name: '@nizam-os/ban-core@0.1.0' }]);
    expect(() => createReleases(MANIFEST, deps(github))).toThrow(
      'the release @nizam-os/ban-core@0.1.0 exists without its tag',
    );
  });
});
