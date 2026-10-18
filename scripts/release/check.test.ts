import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkRelease, inPreMode, packageDirectories } from './check.ts';
import { packageEntries, sha512Of, writePack } from './test-support.ts';

const COMMIT = 'c'.repeat(40);

let root: string;
let directory: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kit-release-root-'));
  directory = mkdtempSync(join(tmpdir(), 'kit-release-pack-'));
  for (const [dir, name] of [
    ['ban-core', '@nizam-os/ban-core'],
    ['hono-ban', '@nizam-os/hono-ban'],
    ['keyset-core', '@nizam-os/keyset-core'],
  ] as const) {
    mkdirSync(join(root, 'packages', dir), { recursive: true });
    writeFileSync(
      join(root, 'packages', dir, 'package.json'),
      JSON.stringify({ name }),
    );
  }
  mkdirSync(join(root, 'packages', 'not-a-package'));
  mkdirSync(join(directory, 'packages'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(directory, { recursive: true, force: true });
});

describe('packageDirectories', () => {
  it('maps each package under packages/ to its directory', () => {
    for (const [dir, manifest] of [
      ['unnamed', {}],
      ['listed', []],
    ] as const) {
      mkdirSync(join(root, 'packages', dir));
      writeFileSync(
        join(root, 'packages', dir, 'package.json'),
        JSON.stringify(manifest),
      );
    }
    expect(packageDirectories(root)).toEqual(
      new Map([
        ['@nizam-os/ban-core', 'packages/ban-core'],
        ['@nizam-os/hono-ban', 'packages/hono-ban'],
        ['@nizam-os/keyset-core', 'packages/keyset-core'],
      ]),
    );
  });
});

describe('inPreMode', () => {
  it('reads the mode of .changeset/pre.json', () => {
    expect(inPreMode(root)).toBe(false);
    mkdirSync(join(root, '.changeset'));
    writeFileSync(
      join(root, '.changeset', 'pre.json'),
      JSON.stringify({ mode: 'exit', tag: 'next' }),
    );
    expect(inPreMode(root)).toBe(false);
    writeFileSync(
      join(root, '.changeset', 'pre.json'),
      JSON.stringify({ mode: 'pre', tag: 'next' }),
    );
    expect(inPreMode(root)).toBe(true);
  });
});

describe('checkRelease', () => {
  it('turns clean tarballs into the manifest, in plan order, and scans what they hold', () => {
    const bytes = writePack(directory, [
      { name: '@nizam-os/ban-core', version: '0.1.0' },
      { name: '@nizam-os/hono-ban', version: '1.4.0' },
    ]);
    let scanned: Array<string> = [];
    const result = checkRelease({
      root,
      directory,
      commit: COMMIT,
      scan: (scanRoot) => {
        scanned = ['ban-core@0.1.0', 'hono-ban@1.4.0'].flatMap((label) =>
          [
            'package.json',
            'README.md',
            'LICENSE',
            'CHANGELOG.md',
            'dist/index.js',
          ].filter((file) =>
            existsSync(join(scanRoot, label, 'package', file)),
          ),
        );
        expect(
          readFileSync(
            join(scanRoot, 'ban-core@0.1.0', 'package', 'dist', 'index.js'),
            'utf8',
          ),
        ).toBe('export const one = 1;\n');
        return [];
      },
    });
    expect(result.problems).toEqual([]);
    expect(result.notices).toEqual([]);
    expect(scanned).toHaveLength(10);
    expect(result.manifest).toEqual({
      version: 1,
      commit: COMMIT,
      releases: [
        {
          name: '@nizam-os/ban-core',
          version: '0.1.0',
          tag: 'latest',
          file: 'packages/nizam-os-ban-core-0.1.0.tgz',
          integrity: sha512Of(
            bytes.get('@nizam-os/ban-core') ?? Buffer.alloc(0),
          ),
          gitTag: '@nizam-os/ban-core@0.1.0',
          prerelease: false,
          notes: '### Minor Changes\n\n- The first release.',
        },
        {
          name: '@nizam-os/hono-ban',
          version: '1.4.0',
          tag: 'latest',
          file: 'packages/nizam-os-hono-ban-1.4.0.tgz',
          integrity: sha512Of(
            bytes.get('@nizam-os/hono-ban') ?? Buffer.alloc(0),
          ),
          gitTag: '@nizam-os/hono-ban@1.4.0',
          prerelease: false,
          notes: '### Minor Changes\n\n- The first release.',
        },
      ],
    });
  });

  it('leaves out a package at 0.0.0 with a notice', () => {
    writePack(directory, [
      { name: '@nizam-os/ban-core', version: '0.0.0' },
      { name: '@nizam-os/hono-ban', version: '1.4.0' },
    ]);
    const result = checkRelease({
      root,
      directory,
      commit: COMMIT,
      scan: () => [],
    });
    expect(result.problems).toEqual([]);
    expect(result.notices).toEqual([
      '@nizam-os/ban-core is at 0.0.0, never versioned; it is released once a changeset versions it',
    ]);
    expect(result.manifest.releases.map(({ name }) => name)).toEqual([
      '@nizam-os/hono-ban',
    ]);
  });

  it('names the package of every problem and of every secret', () => {
    writePack(directory, [
      {
        name: '@nizam-os/ban-core',
        version: '0.1.0',
        entries: [
          ...packageEntries('@nizam-os/ban-core', '0.1.0'),
          { path: 'package/src/index.ts', content: 'x' },
        ],
      },
      { name: '@nizam-os/hono-ban', version: '1.4.0', tag: 'next' },
      { name: 'hono-ban', version: '1.4.0' },
      {
        name: '@nizam-os/keyset-core',
        version: '0.2.0',
        integrity: `sha256-${'A'.repeat(43)}=`,
      },
    ]);
    const result = checkRelease({
      root,
      directory,
      commit: COMMIT,
      scan: () => [
        {
          rule: 'github-pat',
          file: 'hono-ban@1.4.0/package/dist/index.js',
          line: 2,
        },
      ],
    });
    expect(result.problems).toEqual([
      '@nizam-os/ban-core@0.1.0: holds src/index.ts, which is not package.json, README.md, LICENSE, CHANGELOG.md or under dist/',
      '@nizam-os/hono-ban@1.4.0: it is a release and would go to the next dist-tag instead of latest',
      'hono-ban@1.4.0: the plan publishes hono-ban, which is not a package of the @nizam-os/ scope under packages/',
      '@nizam-os/keyset-core@0.2.0: its tarball is not the one changeset pack recorded',
      '@nizam-os/hono-ban@1.4.0: gitleaks finds github-pat in package/dist/index.js:2',
    ]);
  });

  it('scans the files of a tarball that holds directory entries', () => {
    writePack(directory, [
      {
        name: '@nizam-os/ban-core',
        version: '0.1.0',
        entries: [
          { path: 'package/dist/', type: '5' },
          ...packageEntries('@nizam-os/ban-core', '0.1.0'),
        ],
      },
    ]);
    const result = checkRelease({
      root,
      directory,
      commit: COMMIT,
      scan: (scanRoot) => {
        expect(
          readFileSync(
            join(scanRoot, 'ban-core@0.1.0', 'package', 'dist', 'index.js'),
            'utf8',
          ),
        ).toBe('export const one = 1;\n');
        return [];
      },
    });
    expect(result.problems).toEqual([]);
    expect(result.manifest.releases).toHaveLength(1);
  });

  it('names a missing changelog once', () => {
    writePack(directory, [
      {
        name: '@nizam-os/ban-core',
        version: '0.1.0',
        entries: packageEntries('@nizam-os/ban-core', '0.1.0').filter(
          (entry) => entry.path !== 'package/CHANGELOG.md',
        ),
      },
    ]);
    expect(
      checkRelease({ root, directory, commit: COMMIT, scan: () => [] })
        .problems,
    ).toEqual(['@nizam-os/ban-core@0.1.0: has no CHANGELOG.md']);
  });

  it('refuses a tarball it cannot read, and a changelog without the version', () => {
    writePack(directory, [
      {
        name: '@nizam-os/ban-core',
        version: '0.1.0',
        entries: [{ path: 'package/a', type: '2' }],
      },
      {
        name: '@nizam-os/hono-ban',
        version: '1.4.0',
        entries: packageEntries('@nizam-os/hono-ban', '1.4.0').map((entry) =>
          entry.path === 'package/CHANGELOG.md'
            ? {
                path: entry.path,
                content: '# @nizam-os/hono-ban\n\n## 1.3.0\n\n- Before.\n',
              }
            : entry,
        ),
      },
    ]);
    const result = checkRelease({
      root,
      directory,
      commit: COMMIT,
      scan: () => [],
    });
    expect(result.problems).toEqual([
      '@nizam-os/ban-core@0.1.0: its tarball cannot be read: package/a is an entry of type "2", which a package tarball does not hold',
      '@nizam-os/hono-ban@1.4.0: its CHANGELOG.md has no section for 1.4.0',
    ]);
  });
});
