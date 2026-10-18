import type { PlannedRelease } from './plan.ts';

import { describe, expect, it } from 'vitest';

import { plannedReleases, versionProblems } from './plan.ts';

const INTEGRITY = `sha256-${'A'.repeat(43)}=`;

function entry(
  name: string,
  version = '0.1.0',
  changes: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: 'publish',
    name,
    version,
    access: 'public',
    tag: 'latest',
    tarball: {
      path: `packages/${name.slice(1).replace('/', '-')}-${version}.tgz`,
      integrity: INTEGRITY,
    },
    ...changes,
  };
}

function release(version: string, tag: string): PlannedRelease {
  return {
    name: '@nizam-os/a',
    version,
    tag,
    tarball: 'packages/a.tgz',
    integrity: INTEGRITY,
  };
}

describe('plannedReleases', () => {
  it('lists every release of every chunk, chunk by chunk', () => {
    const plan = {
      version: 1,
      plan: [
        [entry('@nizam-os/ban-core'), entry('@nizam-os/keyset-core')],
        [entry('@nizam-os/hono-ban', '1.4.0')],
      ],
    };
    expect(plannedReleases(plan)).toEqual([
      {
        name: '@nizam-os/ban-core',
        version: '0.1.0',
        tag: 'latest',
        tarball: 'packages/nizam-os-ban-core-0.1.0.tgz',
        integrity: INTEGRITY,
      },
      {
        name: '@nizam-os/keyset-core',
        version: '0.1.0',
        tag: 'latest',
        tarball: 'packages/nizam-os-keyset-core-0.1.0.tgz',
        integrity: INTEGRITY,
      },
      {
        name: '@nizam-os/hono-ban',
        version: '1.4.0',
        tag: 'latest',
        tarball: 'packages/nizam-os-hono-ban-1.4.0.tgz',
        integrity: INTEGRITY,
      },
    ]);
    expect(plannedReleases({ version: 1, plan: [] })).toEqual([]);
  });

  it.each([
    [null, 'the publish plan is not version 1 of the format'],
    [
      { version: 2, plan: [] },
      'the publish plan is not version 1 of the format',
    ],
    [{ version: 1 }, 'the publish plan holds no list of chunks'],
    [{ version: 1, plan: [{}] }, 'the publish plan holds no list of chunks'],
    [
      { version: 1, plan: [['x']] },
      'release 1 of the publish plan is not an object',
    ],
    [
      { version: 1, plan: [[{ kind: 'publish' }]] },
      'release 1 of the publish plan has no name',
    ],
    [
      {
        version: 1,
        plan: [[{ kind: 'tag-only', name: '@nizam-os/a', version: '1.0.0' }]],
      },
      'the publish plan would tag @nizam-os/a without publishing it',
    ],
    [
      {
        version: 1,
        plan: [[entry('@nizam-os/a', '0.1.0', { access: 'restricted' })]],
      },
      'the publish plan gives @nizam-os/a restricted access',
    ],
    [
      {
        version: 1,
        plan: [[entry('@nizam-os/a', '0.1.0', { tarball: undefined })]],
      },
      'the publish plan packed no tarball for @nizam-os/a',
    ],
    [
      {
        version: 1,
        plan: [
          [
            entry('@nizam-os/a', '0.1.0', {
              tarball: { path: '../a.tgz', integrity: INTEGRITY },
            }),
          ],
        ],
      },
      'the publish plan records the tarball of @nizam-os/a in a shape it never writes',
    ],
    [
      {
        version: 1,
        plan: [
          [
            entry('@nizam-os/a', '0.1.0', {
              tarball: { path: 'packages/a.tgz', integrity: 'sha512-x' },
            }),
          ],
        ],
      },
      'the publish plan records the tarball of @nizam-os/a in a shape it never writes',
    ],
  ])('refuses a plan of another shape: %j', (plan, message) => {
    expect(() => plannedReleases(plan)).toThrow(message);
  });
});

describe('versionProblems', () => {
  it('lets a release go to latest and a prerelease to its own tag', () => {
    expect(versionProblems(release('1.0.0', 'latest'), false)).toEqual([]);
    expect(versionProblems(release('1.0.0-next.0', 'next'), true)).toEqual([]);
    expect(versionProblems(release('1.0.0-next.0', 'next'), false)).toEqual([]);
  });

  it('lets a prerelease become latest in pre mode only', () => {
    expect(versionProblems(release('1.0.0-next.1', 'latest'), true)).toEqual(
      [],
    );
    expect(versionProblems(release('1.0.0-next.1', 'latest'), false)).toEqual([
      'it is a prerelease and would become latest outside pre mode',
    ]);
  });

  it('refuses a release under another tag than latest', () => {
    expect(versionProblems(release('1.0.0', 'next'), true)).toEqual([
      'it is a release and would go to the next dist-tag instead of latest',
    ]);
  });

  it.each(['1', 'v1', '1.x', '', 'Next', 'beta tag'])(
    'refuses the dist-tag %j',
    (tag) => {
      expect(versionProblems(release('1.0.0-beta.0', tag), false)).toEqual([
        `its dist-tag ${JSON.stringify(tag)} is not a tag npm can install by`,
      ]);
    },
  );

  it('refuses a version that is not semantic', () => {
    expect(versionProblems(release('v1.0.0', 'latest'), false)).toEqual([
      'its version "v1.0.0" is not a semantic version',
    ]);
  });
});
