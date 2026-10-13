import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { manifestOf, packageDirectories, readWorkspace } from './workspace.ts';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'peer-floors-workspace-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writePackage(
  directory: string,
  manifest: object,
): Promise<void> {
  await mkdir(join(root, directory), { recursive: true });
  await writeFile(
    join(root, directory, 'package.json'),
    JSON.stringify(manifest),
  );
}

describe('manifestOf', () => {
  it('reads the name and the three dependency fields, absent ones empty', () => {
    expect(
      manifestOf(
        {
          name: '@x/a',
          version: '1.0.0',
          peerDependencies: { hono: '>=4.13.7' },
        },
        'a/package.json',
      ),
    ).toEqual({
      name: '@x/a',
      dependencies: {},
      devDependencies: {},
      peerDependencies: { hono: '>=4.13.7' },
    });
  });

  it.each([
    [[], 'a/package.json must hold an object'],
    [{ version: '1.0.0' }, 'a/package.json must have a name'],
    [
      { name: 'a', dependencies: ['x'] },
      'a/package.json dependencies must be an object',
    ],
    [
      { name: 'a', peerDependencies: { hono: 4 } },
      'a/package.json peerDependencies.hono must be a string',
    ],
  ])('refuses %j', (json, message) => {
    expect(() => manifestOf(json, 'a/package.json')).toThrow(
      new TypeError(message),
    );
  });
});

describe('packageDirectories', () => {
  it('expands <directory>/* to the subdirectories that hold a package.json', async () => {
    await writePackage('packages/b', { name: 'b' });
    await writePackage('packages/a', { name: 'a' });
    await mkdir(join(root, 'packages/no-manifest'));
    await writeFile(join(root, 'packages/README.md'), '');
    await writePackage('tool', { name: 'tool' });
    expect(packageDirectories(['packages/*', 'tool'], root)).toEqual([
      'packages/a',
      'packages/b',
      'tool',
    ]);
  });

  it.each([
    [
      'packages/**',
      'the packages glob packages/** is not one the floor checks read',
    ],
    [
      '!packages/x',
      'the packages glob !packages/x is not one the floor checks read',
    ],
  ])('refuses the glob %s, which would hide packages', (glob, message) => {
    expect(() => packageDirectories([glob], root)).toThrow(
      new TypeError(message),
    );
  });

  it('refuses a list that is missing or holds a non-string', () => {
    expect(() => packageDirectories(undefined, root)).toThrow(
      new TypeError('pnpm-workspace.yaml must list its packages'),
    );
    expect(() => packageDirectories([1], root)).toThrow(
      new TypeError('pnpm-workspace.yaml packages must be strings'),
    );
  });
});

describe('readWorkspace', () => {
  it('reads every manifest the workspace file names', async () => {
    await writeFile(
      join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/*\n',
    );
    await writePackage('packages/a', {
      name: 'a',
      devDependencies: { hono: '4.13.13' },
      peerDependencies: { hono: '>=4.13.7' },
    });
    expect(readWorkspace(root)).toEqual([
      {
        name: 'a',
        dependencies: {},
        devDependencies: { hono: '4.13.13' },
        peerDependencies: { hono: '>=4.13.7' },
      },
    ]);
  });

  it('refuses an empty workspace file', async () => {
    await writeFile(join(root, 'pnpm-workspace.yaml'), '');
    expect(() => readWorkspace(root)).toThrow(
      new TypeError('pnpm-workspace.yaml must list its packages'),
    );
  });

  it('reads this repository, whose published packages all have manifests', () => {
    const names = readWorkspace(join(import.meta.dirname, '..', '..')).map(
      (manifest) => manifest.name,
    );
    expect(names).toContain('@nizam-os/hono-ban');
    expect(names).toContain('@nizam-os/kysely-keyset');
  });
});
