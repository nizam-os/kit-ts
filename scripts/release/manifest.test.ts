import type { Release, ReleaseManifest } from './manifest.ts';

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  digestOf,
  integrityOf,
  manifestText,
  parseManifest,
  readManifest,
} from './manifest.ts';
import { sha512Of } from './test-support.ts';

const COMMIT = 'a'.repeat(40);
const TARBALL = Buffer.from('a tarball');

function releaseFor(changes: Partial<Release> = {}): Release {
  return {
    name: '@nizam-os/keyset-core',
    version: '0.1.0',
    tag: 'latest',
    file: 'packages/nizam-os-keyset-core-0.1.0.tgz',
    integrity: integrityOf(TARBALL),
    gitTag: '@nizam-os/keyset-core@0.1.0',
    prerelease: false,
    notes: '### Minor Changes\n\n- The first release.',
    ...changes,
  };
}

function manifestWith(releases: ReadonlyArray<Release>): ReleaseManifest {
  return { version: 1, commit: COMMIT, releases };
}

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'kit-release-manifest-'));
  mkdirSync(join(directory, 'packages'));
  writeFileSync(
    join(directory, 'packages', 'nizam-os-keyset-core-0.1.0.tgz'),
    TARBALL,
  );
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('integrityOf', () => {
  it('is the SHA-512 integrity npm records', () => {
    expect(integrityOf(TARBALL)).toBe(sha512Of(TARBALL));
  });
});

describe('parseManifest', () => {
  it('reads back what manifestText wrote', () => {
    const manifest = manifestWith([
      releaseFor(),
      releaseFor({
        name: '@nizam-os/a',
        version: '1.0.0-next.0',
        gitTag: '@nizam-os/a@1.0.0-next.0',
        prerelease: true,
        tag: 'next',
      }),
    ]);
    const text = manifestText(manifest);
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseManifest(text)).toEqual(manifest);
  });

  it.each([
    [{ version: 2 }, 'the release manifest is not version 1 of the format'],
    [
      { version: 1, commit: 'main', releases: [] },
      'the release manifest names no commit',
    ],
    [
      { version: 1, commit: COMMIT },
      'the release manifest holds no list of releases',
    ],
    [
      { version: 1, commit: COMMIT, releases: [1] },
      'release 1 of the manifest is not an object',
    ],
    [
      {
        version: 1,
        commit: COMMIT,
        releases: [{ ...releaseFor(), prerelease: 'no' }],
      },
      'release 1 of the manifest does not say whether it is a prerelease',
    ],
    [
      {
        version: 1,
        commit: COMMIT,
        releases: [{ ...releaseFor(), notes: undefined }],
      },
      'release 1 of the manifest has no notes',
    ],
    [
      {
        version: 1,
        commit: COMMIT,
        releases: [releaseFor({ name: 'hono-ban', gitTag: 'hono-ban@0.1.0' })],
      },
      'release 1 of the manifest names hono-ban, which is not a package of the @nizam-os/ scope',
    ],
    [
      {
        version: 1,
        commit: COMMIT,
        releases: [releaseFor({ file: 'packages/../../etc/passwd' })],
      },
      'release 1 of the manifest (@nizam-os/keyset-core) is not in the shape the pack job writes',
    ],
    [
      {
        version: 1,
        commit: COMMIT,
        releases: [releaseFor({ integrity: 'sha256-x' })],
      },
      'release 1 of the manifest (@nizam-os/keyset-core) is not in the shape the pack job writes',
    ],
    [
      {
        version: 1,
        commit: COMMIT,
        releases: [releaseFor({ gitTag: 'v0.1.0' })],
      },
      'release 1 of the manifest (@nizam-os/keyset-core) is not in the shape the pack job writes',
    ],
  ])('refuses a manifest of another shape: %j', (json, message) => {
    expect(() => parseManifest(JSON.stringify(json))).toThrow(message);
  });
});

/** Writes `manifest` into the release directory and returns its digest. */
function write(manifest: ReleaseManifest): string {
  const text = manifestText(manifest);
  writeFileSync(join(directory, 'release.json'), text);
  return digestOf(text);
}

describe('readManifest', () => {
  it('returns the manifest when it and every tarball are what the pack job checked', () => {
    const manifest = manifestWith([releaseFor()]);
    expect(readManifest(directory, write(manifest))).toEqual(manifest);
  });

  it('refuses a manifest with another digest', () => {
    write(manifestWith([releaseFor()]));
    expect(() => readManifest(directory, 'b'.repeat(64))).toThrow(
      'release.json is not the manifest the pack job wrote: its digest differs',
    );
    expect(() => readManifest(directory, 'not a digest')).toThrow(
      'the manifest digest is not a hex SHA-256',
    );
  });

  it('refuses a tarball with another integrity', () => {
    const digest = write(manifestWith([releaseFor()]));
    writeFileSync(
      join(directory, 'packages', 'nizam-os-keyset-core-0.1.0.tgz'),
      'another tarball',
    );
    expect(() => readManifest(directory, digest)).toThrow(
      'packages/nizam-os-keyset-core-0.1.0.tgz is not the tarball the pack job checked: its integrity differs',
    );
  });
});
