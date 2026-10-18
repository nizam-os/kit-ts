/**
 * What a package tarball may hold (root ADR 0013): its manifest, README,
 * LICENSE and CHANGELOG, and the build under `dist/`, nothing else; and a
 * manifest npm can publish with provenance that installs the same way for
 * every consumer. Each problem is a sentence about the tarball; an empty list
 * means it may be published.
 *
 * The manifest checks are the ones a packed manifest can fail and the
 * package's own `package.json` would not show: pnpm writes the packed one,
 * replacing `workspace:` and `catalog:` ranges and applying `publishConfig`.
 * npm treats every `publishConfig` key as configuration of the publish, so
 * only `access` and `provenance` may be there; a `registry` would send the
 * package elsewhere. npm's provenance check needs `repository.url` to name
 * the repository that built it.
 * @ref https://docs.npmjs.com/cli/v11/configuring-npm/package-json#publishconfig
 * @ref https://docs.npmjs.com/generating-provenance-statements#provenance-limitations
 * @ref https://docs.npmjs.com/cli/v11/using-npm/scripts#npm-install
 * @packageDocumentation
 */
import type { TarEntry } from './tarball.ts';

import { validRange } from 'semver';

/** The package a tarball must be: its name, version and directory in the repository. */
export interface Expected {
  readonly name: string;
  readonly version: string;
  readonly directory: string;
}

/** The repository every package names, the one its provenance points to. */
const REPOSITORY = 'git+https://github.com/nizam-os/kit-ts.git';

const ROOT = 'package/';
const REQUIRED = ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'];
const DEPENDENCY_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
] as const;
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall'] as const;
const PUBLISH_CONFIG = new Set(['access', 'provenance']);
const SEGMENT = /^[\w@+.-]+$/u;

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A path inside the package with no empty, `.` or `..` segment and no character outside a plain file name's. */
function isPlainPath(path: string): boolean {
  return path
    .split('/')
    .every((segment) => SEGMENT.test(segment) && !/^\.\.?$/u.test(segment));
}

function isAllowed(path: string, type: TarEntry['type']): boolean {
  if (type === 'directory') {
    return path === 'dist' || path.startsWith('dist/');
  }
  return REQUIRED.includes(path) || path.startsWith('dist/');
}

function pathProblems(entries: ReadonlyArray<TarEntry>): Array<string> {
  const problems: Array<string> = [];
  const seen = new Set<string>();
  for (const { path, type } of entries) {
    const inside = path.startsWith(ROOT) ? path.slice(ROOT.length) : undefined;
    if (inside === undefined || inside === '' || !isPlainPath(inside)) {
      problems.push(
        `holds ${JSON.stringify(path)}, a path outside package/ or not a plain file name`,
      );
      continue;
    }
    if (seen.has(inside)) {
      problems.push(`holds ${inside} twice`);
    }
    seen.add(inside);
    if (!isAllowed(inside, type)) {
      problems.push(
        `holds ${inside}, which is not package.json, README.md, LICENSE, CHANGELOG.md or under dist/`,
      );
    }
  }
  for (const file of REQUIRED) {
    if (
      !entries.some(
        (entry) => entry.type === 'file' && entry.path === ROOT + file,
      )
    ) {
      problems.push(`has no ${file}`);
    }
  }
  if (
    !entries.some(
      (entry) => entry.type === 'file' && entry.path.startsWith(`${ROOT}dist/`),
    )
  ) {
    problems.push('has nothing under dist/');
  }
  return problems;
}

function dependencyProblems(manifest: object): Array<string> {
  const problems: Array<string> = [];
  for (const field of DEPENDENCY_FIELDS) {
    const ranges: unknown = Reflect.get(manifest, field);
    if (ranges === undefined) {
      continue;
    }
    if (!isObject(ranges)) {
      problems.push(`its ${field} is not an object`);
      continue;
    }
    for (const [name, range] of Object.entries(ranges)) {
      // A protocol (workspace:, catalog:, file:, link:, npm:, git+https:)
      // would install differently, or not at all, outside this repository.
      if (
        typeof range !== 'string' ||
        range.includes(':') ||
        validRange(range) === null
      ) {
        problems.push(
          `its ${field} gives ${name} ${JSON.stringify(range)}, which is not a semver range`,
        );
      }
    }
  }
  if (
    Reflect.has(manifest, 'bundleDependencies') ||
    Reflect.has(manifest, 'bundledDependencies')
  ) {
    problems.push('it bundles dependencies');
  }
  return problems;
}

function publishProblems(manifest: object, expected: Expected): Array<string> {
  const problems: Array<string> = [];
  const repository: unknown = Reflect.get(manifest, 'repository');
  if (
    !isObject(repository) ||
    Reflect.get(repository, 'type') !== 'git' ||
    Reflect.get(repository, 'url') !== REPOSITORY ||
    Reflect.get(repository, 'directory') !== expected.directory
  ) {
    problems.push(
      `its repository is not { type: "git", url: "${REPOSITORY}", directory: "${expected.directory}" }`,
    );
  }
  const publishConfig: unknown = Reflect.get(manifest, 'publishConfig');
  if (isObject(publishConfig)) {
    for (const key of Object.keys(publishConfig)) {
      if (!PUBLISH_CONFIG.has(key)) {
        problems.push(
          `its publishConfig sets ${key}, which would configure the publish`,
        );
      }
    }
    const access: unknown = Reflect.get(publishConfig, 'access');
    if (access !== undefined && access !== 'public') {
      problems.push(
        `its publishConfig.access is ${JSON.stringify(access)}, not "public"`,
      );
    }
    const provenance: unknown = Reflect.get(publishConfig, 'provenance');
    if (provenance !== undefined && provenance !== true) {
      problems.push('its publishConfig turns provenance off');
    }
  } else if (publishConfig !== undefined) {
    problems.push('its publishConfig is not an object');
  }
  const scripts: unknown = Reflect.get(manifest, 'scripts');
  for (const script of INSTALL_SCRIPTS) {
    if (isObject(scripts) && Reflect.has(scripts, script)) {
      problems.push(`it runs its ${script} script on every install`);
    }
  }
  return problems;
}

function manifestProblems(content: Buffer, expected: Expected): Array<string> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(content.toString('utf8'));
  } catch {
    return ['its package.json is not JSON'];
  }
  if (!isObject(manifest)) {
    return ['its package.json does not hold an object'];
  }
  const problems: Array<string> = [];
  const name: unknown = Reflect.get(manifest, 'name');
  const version: unknown = Reflect.get(manifest, 'version');
  if (name !== expected.name || version !== expected.version) {
    problems.push(
      `its package.json names ${JSON.stringify(name)}@${JSON.stringify(version)}, not ${expected.name}@${expected.version}`,
    );
  }
  if (Reflect.get(manifest, 'private') === true) {
    problems.push('its package.json is private');
  }
  const license: unknown = Reflect.get(manifest, 'license');
  if (typeof license !== 'string' || license === '') {
    problems.push('its package.json names no license');
  }
  return [
    ...problems,
    ...dependencyProblems(manifest),
    ...publishProblems(manifest, expected),
  ];
}

/**
 * Everything wrong with a tarball's entries, as sentences about it; none when
 * it may be published as the `expected` package.
 */
export function tarballProblems(
  entries: ReadonlyArray<TarEntry>,
  expected: Expected,
): Array<string> {
  const manifest = entries.find(
    (entry) => entry.type === 'file' && entry.path === `${ROOT}package.json`,
  );
  return [
    ...pathProblems(entries),
    ...(manifest === undefined
      ? []
      : manifestProblems(manifest.content, expected)),
  ];
}
