import type { TarEntry } from './tarball.ts';

import { describe, expect, it } from 'vitest';

import { tarballProblems } from './contents.ts';
import { tarEntries } from './tarball.ts';
import { packageEntries, tarballOf } from './test-support.ts';

const NAME = '@nizam-os/hono-ban';
const EXPECTED = {
  name: NAME,
  version: '1.4.0',
  directory: 'packages/hono-ban',
};

function entriesWith(
  changes: Readonly<Record<string, unknown>> = {},
): Array<TarEntry> {
  return tarEntries(tarballOf(packageEntries(NAME, '1.4.0', changes)));
}

function problemsOf(entries: ReadonlyArray<TarEntry>): Array<string> {
  return tarballProblems(entries, EXPECTED);
}

/** The entries of a good package whose package.json holds `content` instead. */
function withManifestText(content: string): Array<TarEntry> {
  return entriesWith().map((entry) =>
    entry.path === 'package/package.json'
      ? { path: entry.path, type: entry.type, content: Buffer.from(content) }
      : entry,
  );
}

describe('tarballProblems', () => {
  it('finds nothing wrong with a package as pnpm packs it', () => {
    expect(problemsOf(entriesWith())).toEqual([]);
  });

  it('takes directory entries under dist/', () => {
    const entries = tarEntries(
      tarballOf([
        ...packageEntries(NAME, '1.4.0'),
        { path: 'package/dist/formats', type: '5' },
      ]),
    );
    expect(problemsOf(entries)).toEqual([]);
  });

  it.each([
    [
      'package/src/index.ts',
      'holds src/index.ts, which is not package.json, README.md, LICENSE, CHANGELOG.md or under dist/',
    ],
    [
      'package/.env',
      'holds .env, which is not package.json, README.md, LICENSE, CHANGELOG.md or under dist/',
    ],
    [
      'package/node_modules/x/index.js',
      'holds node_modules/x/index.js, which is not package.json, README.md, LICENSE, CHANGELOG.md or under dist/',
    ],
    [
      'package/CLAUDE.md',
      'holds CLAUDE.md, which is not package.json, README.md, LICENSE, CHANGELOG.md or under dist/',
    ],
    [
      'package/readme.md',
      'holds readme.md, which is not package.json, README.md, LICENSE, CHANGELOG.md or under dist/',
    ],
    [
      'package/dist/../../x',
      'holds "package/dist/../../x", a path outside package/ or not a plain file name',
    ],
    [
      'package/dist//x.js',
      'holds "package/dist//x.js", a path outside package/ or not a plain file name',
    ],
    [
      'package/dist/a b.js',
      'holds "package/dist/a b.js", a path outside package/ or not a plain file name',
    ],
    [
      'package/dist/a\\b.js',
      'holds "package/dist/a\\\\b.js", a path outside package/ or not a plain file name',
    ],
    [
      'other/x.js',
      'holds "other/x.js", a path outside package/ or not a plain file name',
    ],
    [
      '/package/x.js',
      'holds "/package/x.js", a path outside package/ or not a plain file name',
    ],
    [
      'package/',
      'holds "package/", a path outside package/ or not a plain file name',
    ],
  ])('refuses a stray entry: %s', (path, problem) => {
    const entries = tarEntries(
      tarballOf([...packageEntries(NAME, '1.4.0'), { path, content: 'x' }]),
    );
    expect(problemsOf(entries)).toEqual([problem]);
  });

  it('refuses a directory entry outside dist/ and a file twice', () => {
    const entries = tarEntries(
      tarballOf([
        ...packageEntries(NAME, '1.4.0'),
        { path: 'package/src', type: '5' },
        { path: 'package/dist/index.js', content: 'again' },
      ]),
    );
    expect(problemsOf(entries)).toEqual([
      'holds src, which is not package.json, README.md, LICENSE, CHANGELOG.md or under dist/',
      'holds dist/index.js twice',
    ]);
  });

  it('requires the manifest, README, LICENSE, CHANGELOG and a build', () => {
    expect(problemsOf([])).toEqual([
      'has no package.json',
      'has no README.md',
      'has no LICENSE',
      'has no CHANGELOG.md',
      'has nothing under dist/',
    ]);
  });

  it('requires the manifest to be the package and version expected, not private, with a license', () => {
    expect(
      problemsOf(
        entriesWith({ name: '@nizam-os/other', private: true, license: '' }),
      ),
    ).toEqual([
      'its package.json names "@nizam-os/other"@"1.4.0", not @nizam-os/hono-ban@1.4.0',
      'its package.json is private',
      'its package.json names no license',
    ]);
  });

  it('refuses a manifest that is not JSON or not an object', () => {
    expect(problemsOf(withManifestText('{'))).toEqual([
      'its package.json is not JSON',
    ]);
    expect(problemsOf(withManifestText('[]'))).toEqual([
      'its package.json does not hold an object',
    ]);
  });

  it.each([
    [
      'dependencies',
      { '@nizam-os/ban-core': 'workspace:^' },
      '@nizam-os/ban-core',
      '"workspace:^"',
    ],
    ['dependencies', { x: 'catalog:' }, 'x', '"catalog:"'],
    ['peerDependencies', { x: 'file:../x' }, 'x', '"file:../x"'],
    [
      'optionalDependencies',
      { x: 'git+https://github.com/a/b.git' },
      'x',
      '"git+https://github.com/a/b.git"',
    ],
    ['devDependencies', { x: 'npm:y@1' }, 'x', '"npm:y@1"'],
    ['dependencies', { x: 'not a range' }, 'x', '"not a range"'],
    ['dependencies', { x: 1 }, 'x', '1'],
  ])(
    'refuses a %s range that is not a semver range',
    (field, ranges, name, shown) => {
      expect(problemsOf(entriesWith({ [field]: ranges }))).toEqual([
        `its ${field} gives ${name} ${shown}, which is not a semver range`,
      ]);
    },
  );

  it('refuses dependency fields that are not objects, and bundled dependencies', () => {
    expect(
      problemsOf(
        entriesWith({ dependencies: ['x'], bundleDependencies: ['x'] }),
      ),
    ).toEqual(['its dependencies is not an object', 'it bundles dependencies']);
    expect(problemsOf(entriesWith({ bundledDependencies: true }))).toEqual([
      'it bundles dependencies',
    ]);
  });

  it('requires the repository its provenance points to, with the package directory', () => {
    const problem =
      'its repository is not { type: "git", url: "git+https://github.com/nizam-os/kit-ts.git", directory: "packages/hono-ban" }';
    expect(problemsOf(entriesWith({ repository: 'nizam-os/kit-ts' }))).toEqual([
      problem,
    ]);
    expect(
      problemsOf(
        entriesWith({
          repository: {
            type: 'git',
            url: 'git+https://github.com/nizam-os/kit-ts.git',
            directory: 'packages/x',
          },
        }),
      ),
    ).toEqual([problem]);
    expect(
      problemsOf(
        entriesWith({
          repository: {
            type: 'git',
            url: 'https://github.com/nizam-os/kit-ts',
            directory: 'packages/hono-ban',
          },
        }),
      ),
    ).toEqual([problem]);
  });

  it('lets publishConfig hold only public access and provenance', () => {
    expect(problemsOf(entriesWith({ publishConfig: undefined }))).toEqual([]);
    expect(
      problemsOf(
        entriesWith({
          publishConfig: {
            access: 'restricted',
            provenance: false,
            registry: 'https://example.com',
            tag: 'next',
          },
        }),
      ),
    ).toEqual([
      'its publishConfig sets registry, which would configure the publish',
      'its publishConfig sets tag, which would configure the publish',
      'its publishConfig.access is "restricted", not "public"',
      'its publishConfig turns provenance off',
    ]);
    expect(problemsOf(entriesWith({ publishConfig: 'public' }))).toEqual([
      'its publishConfig is not an object',
    ]);
  });

  it('refuses install scripts', () => {
    expect(
      problemsOf(
        entriesWith({
          scripts: {
            preinstall: 'x',
            install: 'x',
            postinstall: 'x',
            prepare: 'x',
          },
        }),
      ),
    ).toEqual([
      'it runs its preinstall script on every install',
      'it runs its install script on every install',
      'it runs its postinstall script on every install',
    ]);
  });
});
