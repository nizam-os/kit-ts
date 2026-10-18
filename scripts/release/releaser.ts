/**
 * The GitHub releases of a published release (root ADR 0013): one per
 * package, tagged `<name>@<version>` at the commit the tarballs were built
 * from, with the package's changelog section as its notes. A staged version
 * goes live only when a maintainer approves it on npm, so the job first waits
 * until npm holds every version with the tarball's integrity, and stops
 * (to be rerun) when the wait runs out. A tag or release already there is
 * left as it is when it is this release's, and stops the job when it points
 * elsewhere. The repository's releases are immutable and its tags are never
 * moved or deleted (root ADR 0014). Node's builtins only.
 * @ref https://docs.github.com/en/rest/releases/releases#create-a-release
 * @ref https://docs.github.com/en/rest/git/refs#get-a-reference
 * @packageDocumentation
 */
import type { GitHub } from './github.ts';
import type { Release, ReleaseManifest } from './manifest.ts';
import type { ReadRegistry } from './registry.ts';

/** What the GitHub release job needs from outside. */
export interface ReleaseDeps {
  readonly registry: ReadRegistry;
  readonly github: GitHub;
  /** `owner/name`. */
  readonly repository: string;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly now: () => number;
  readonly log: (line: string) => void;
}

/** What happened to one release on GitHub. */
export interface ReleaseOutcome {
  readonly release: Release;
  readonly result: 'released' | 'already released';
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Waits until npm holds every release, reading the registry every `interval`
 * milliseconds for at most `timeout` milliseconds, and returns the releases npm
 * does not hold yet: none when every one is live.
 */
export async function waitUntilLive(
  releases: ReadonlyArray<Release>,
  deps: Pick<ReleaseDeps, 'registry' | 'sleep' | 'now' | 'log'>,
  timeout: number,
  interval: number,
): Promise<Array<Release>> {
  const deadline = deps.now() + timeout;
  let waiting = [...releases];
  for (;;) {
    const still: Array<Release> = [];
    for (const release of waiting) {
      const state = await deps.registry(release.name);
      if (!state.exists || !state.versions.has(release.version)) {
        still.push(release);
      } else if (state.versions.get(release.version) !== release.integrity) {
        throw new Error(
          `npm holds ${release.gitTag} with other content than this release built`,
        );
      }
    }
    waiting = still;
    if (waiting.length === 0 || deps.now() >= deadline) {
      return waiting;
    }
    deps.log(
      `waiting for npm to hold ${waiting.map(({ gitTag }) => gitTag).join(', ')}`,
    );
    await deps.sleep(interval);
  }
}

/** The commit a tag reference points to, or `undefined` when it is not a lightweight tag. */
function taggedCommit(reference: unknown): string | undefined {
  const target: unknown = isObject(reference)
    ? Reflect.get(reference, 'object')
    : undefined;
  if (!isObject(target) || Reflect.get(target, 'type') !== 'commit') {
    return undefined;
  }
  const sha: unknown = Reflect.get(target, 'sha');
  return typeof sha === 'string' ? sha : undefined;
}

/**
 * Creates the GitHub release of every package of a checked manifest, in order,
 * and returns what happened to each.
 */
export function createReleases(
  manifest: ReleaseManifest,
  deps: Pick<ReleaseDeps, 'github' | 'repository' | 'log'>,
): Array<ReleaseOutcome> {
  const base = `repos/${deps.repository}`;
  const released = new Set(
    deps.github
      .list(`${base}/releases?per_page=100`)
      .map((release): unknown =>
        isObject(release) ? Reflect.get(release, 'tag_name') : undefined,
      ),
  );
  return manifest.releases.map((release) => {
    const reference = deps.github.get(`${base}/git/ref/tags/${release.gitTag}`);
    if (
      reference !== undefined &&
      taggedCommit(reference) !== manifest.commit
    ) {
      throw new Error(
        `the tag ${release.gitTag} exists and does not point to ${manifest.commit}`,
      );
    }
    if (released.has(release.gitTag)) {
      if (reference === undefined) {
        throw new Error(`the release ${release.gitTag} exists without its tag`);
      }
      deps.log(`${release.gitTag}: already released`);
      return { release, result: 'already released' };
    }
    deps.github.post(`${base}/releases`, {
      tag_name: release.gitTag,
      target_commitish: manifest.commit,
      name: release.gitTag,
      body: release.notes,
      prerelease: release.prerelease,
      // One repository releases many packages; none of them is the
      // repository's latest release.
      make_latest: 'false',
    });
    deps.log(`${release.gitTag}: released`);
    return { release, result: 'released' };
  });
}
