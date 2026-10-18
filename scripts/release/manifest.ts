/**
 * The release manifest, `release.json`: what the pack job checked and the
 * publish and GitHub release jobs act on (root ADR 0013). The pack job writes
 * it beside the tarballs and hands its SHA-256 to the later jobs as a job
 * output; they refuse a manifest with another digest and a tarball whose
 * SHA-512 is not the one it records, so what is published is what was
 * checked. It imports Node's builtins only: the jobs that read it install
 * nothing.
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One package to publish, in publish order. */
export interface Release {
  readonly name: string;
  readonly version: string;
  /** Its npm dist-tag. */
  readonly tag: string;
  /** Its tarball, relative to the manifest's directory. */
  readonly file: string;
  /** The tarball's `sha512-<base64>` integrity, as npm records it. */
  readonly integrity: string;
  /** The tag and title of its GitHub release, `<name>@<version>`. */
  readonly gitTag: string;
  readonly prerelease: boolean;
  /** Its section of the package's CHANGELOG.md. */
  readonly notes: string;
}

/** The manifest: the commit the tarballs were built from, and the releases. */
export interface ReleaseManifest {
  readonly version: 1;
  readonly commit: string;
  readonly releases: ReadonlyArray<Release>;
}

/** The manifest's file name in the release directory. */
export const MANIFEST = 'release.json';

/** The one scope the kit publishes under. */
export const SCOPE = '@nizam-os/';

const NAME = /^@nizam-os\/[\da-z][\d.a-z-]*$/u;
const FILE = /^packages\/[\w.-]+\.tgz$/u;
const COMMIT = /^[\da-f]{40}$/u;
const SHA512 = /^sha512-[\d+/A-Za-z]{86}==$/u;
const DIGEST = /^[\da-f]{64}$/u;

/** The `sha512-<base64>` integrity of some bytes, as npm computes and records it. */
export function integrityOf(bytes: Uint8Array): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

/** The hex SHA-256 of the manifest's text, the digest the jobs pass on. */
export function digestOf(text: string | Uint8Array): string {
  return createHash('sha256').update(text).digest('hex');
}

/** The manifest's text: two-space JSON and a final newline. */
export function manifestText(manifest: ReleaseManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOf(value: object, key: string, what: string): string {
  const found: unknown = Reflect.get(value, key);
  if (typeof found !== 'string') {
    throw new TypeError(`${what} has no ${key}`);
  }
  return found;
}

function releaseOf(entry: unknown, index: number): Release {
  const what = `release ${index + 1} of the manifest`;
  if (!isObject(entry)) {
    throw new TypeError(`${what} is not an object`);
  }
  const prerelease: unknown = Reflect.get(entry, 'prerelease');
  if (typeof prerelease !== 'boolean') {
    throw new TypeError(`${what} does not say whether it is a prerelease`);
  }
  const release: Release = {
    name: stringOf(entry, 'name', what),
    version: stringOf(entry, 'version', what),
    tag: stringOf(entry, 'tag', what),
    file: stringOf(entry, 'file', what),
    integrity: stringOf(entry, 'integrity', what),
    gitTag: stringOf(entry, 'gitTag', what),
    prerelease,
    notes: stringOf(entry, 'notes', what),
  };
  if (!NAME.test(release.name)) {
    throw new TypeError(
      `${what} names ${release.name}, which is not a package of the ${SCOPE} scope`,
    );
  }
  if (
    !FILE.test(release.file) ||
    !SHA512.test(release.integrity) ||
    release.gitTag !== `${release.name}@${release.version}`
  ) {
    throw new TypeError(
      `${what} (${release.name}) is not in the shape the pack job writes`,
    );
  }
  return release;
}

/**
 * Parses the text of a `release.json`.
 */
export function parseManifest(text: string): ReleaseManifest {
  const json: unknown = JSON.parse(text);
  if (!isObject(json) || Reflect.get(json, 'version') !== 1) {
    throw new TypeError('the release manifest is not version 1 of the format');
  }
  const commit = stringOf(json, 'commit', 'the release manifest');
  if (!COMMIT.test(commit)) {
    throw new TypeError('the release manifest names no commit');
  }
  const releases: unknown = Reflect.get(json, 'releases');
  if (!Array.isArray(releases)) {
    throw new TypeError('the release manifest holds no list of releases');
  }
  return {
    version: 1,
    commit,
    releases: releases.map((entry, index) => releaseOf(entry, index)),
  };
}

/**
 * Reads the manifest of a release directory, as the artifact holds it, and
 * checks it and every tarball it names against `digest`: the manifest's hex
 * SHA-256, which the pack job passed on.
 */
export function readManifest(
  directory: string,
  digest: string,
): ReleaseManifest {
  if (!DIGEST.test(digest)) {
    throw new TypeError('the manifest digest is not a hex SHA-256');
  }
  const bytes = readFileSync(join(directory, MANIFEST));
  if (digestOf(bytes) !== digest) {
    throw new Error(
      `${MANIFEST} is not the manifest the pack job wrote: its digest differs`,
    );
  }
  const manifest = parseManifest(bytes.toString('utf8'));
  for (const release of manifest.releases) {
    if (
      integrityOf(readFileSync(join(directory, release.file))) !==
      release.integrity
    ) {
      throw new Error(
        `${release.file} is not the tarball the pack job checked: its integrity differs`,
      );
    }
  }
  return manifest;
}
