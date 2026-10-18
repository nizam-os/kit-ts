/**
 * The packages a release publishes, read from the publish plan that
 * `changeset pack` writes next to the tarballs it packs: Changesets lists every
 * public package whose version is not on npm, in chunks a package's
 * dependencies come before it in, with the dist-tag of each (its prerelease
 * tag in pre mode, `latest` otherwise). A plan of another shape is a
 * `TypeError`, so a Changesets release that changes the format fails here.
 *
 * A package at 0.0.0 has never been versioned, so it is left out with a
 * notice: it is released once a changeset versions it (root ADR 0013). The
 * dist-tag must agree with the version: a release always goes to `latest`,
 * and a prerelease never does outside pre mode. In pre mode Changesets gives
 * `latest` to the prerelease of a package that has published only
 * prereleases, whose `latest` is one already.
 * @ref https://github.com/changesets/changesets/blob/main/docs/prereleases.md
 * @packageDocumentation
 */
import { prerelease, valid, validRange } from 'semver';

/** One package of the plan, in publish order. */
export interface PlannedRelease {
  readonly name: string;
  readonly version: string;
  readonly tag: string;
  /** The tarball, relative to the plan's directory. */
  readonly tarball: string;
  /** Its `sha256-<base64>` integrity, as Changesets recorded it. */
  readonly integrity: string;
}

/** The version of a package that has never been versioned. */
export const UNVERSIONED = '0.0.0';

const TARBALL = /^packages\/[\w.-]+\.tgz$/u;
const SHA256 = /^sha256-[\d+/A-Za-z]{43}=$/u;
const DIST_TAG = /^[a-z][\d.a-z-]*$/u;

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: object, key: string, what: string): string {
  const field: unknown = Reflect.get(value, key);
  if (typeof field !== 'string') {
    throw new TypeError(`${what} has no ${key}`);
  }
  return field;
}

function releaseOf(entry: unknown, index: number): PlannedRelease {
  const what = `release ${index + 1} of the publish plan`;
  if (!isObject(entry)) {
    throw new TypeError(`${what} is not an object`);
  }
  const kind = stringField(entry, 'kind', what);
  const name = stringField(entry, 'name', what);
  if (kind !== 'publish') {
    throw new TypeError(
      `the publish plan would ${kind === 'tag-only' ? 'tag' : kind} ${name} without publishing it`,
    );
  }
  const access = stringField(entry, 'access', what);
  if (access !== 'public') {
    throw new TypeError(`the publish plan gives ${name} ${access} access`);
  }
  const tarball: unknown = Reflect.get(entry, 'tarball');
  if (!isObject(tarball)) {
    throw new TypeError(`the publish plan packed no tarball for ${name}`);
  }
  const path = stringField(tarball, 'path', `the tarball of ${name}`);
  const integrity = stringField(tarball, 'integrity', `the tarball of ${name}`);
  if (!TARBALL.test(path) || !SHA256.test(integrity)) {
    throw new TypeError(
      `the publish plan records the tarball of ${name} in a shape it never writes`,
    );
  }
  return {
    name,
    version: stringField(entry, 'version', what),
    tag: stringField(entry, 'tag', what),
    tarball: path,
    integrity,
  };
}

/**
 * Every release of a parsed `publish-plan.json`, chunk by chunk: the publish
 * order.
 */
export function plannedReleases(json: unknown): Array<PlannedRelease> {
  if (!isObject(json) || Reflect.get(json, 'version') !== 1) {
    throw new TypeError('the publish plan is not version 1 of the format');
  }
  const chunks: unknown = Reflect.get(json, 'plan');
  if (
    !Array.isArray(chunks) ||
    !chunks.every((chunk) => Array.isArray(chunk))
  ) {
    throw new TypeError('the publish plan holds no list of chunks');
  }
  return (chunks as ReadonlyArray<ReadonlyArray<unknown>>)
    .flat()
    .map((entry, index) => releaseOf(entry, index));
}

/**
 * What is wrong with a release's version and dist-tag, as sentences about the
 * release; none when it may be published. `preMode` says whether the
 * repository is in Changesets' pre mode (`.changeset/pre.json`).
 */
export function versionProblems(
  release: PlannedRelease,
  preMode: boolean,
): Array<string> {
  if (valid(release.version) !== release.version) {
    return [
      `its version ${JSON.stringify(release.version)} is not a semantic version`,
    ];
  }
  // npm refuses a dist-tag that is a version range, since `npm install
  // name@<tag>` would read it as one.
  if (!DIST_TAG.test(release.tag) || validRange(release.tag) !== null) {
    return [
      `its dist-tag ${JSON.stringify(release.tag)} is not a tag npm can install by`,
    ];
  }
  const isPrerelease = prerelease(release.version) !== null;
  if (isPrerelease && release.tag === 'latest' && !preMode) {
    return ['it is a prerelease and would become latest outside pre mode'];
  }
  if (!isPrerelease && release.tag !== 'latest') {
    return [
      `it is a release and would go to the ${release.tag} dist-tag instead of latest`,
    ];
  }
  return [];
}
