import type { Release, ReleaseManifest } from './manifest.ts';
import type { PlannedRelease } from './plan.ts';
import type { Finding } from './secrets.ts';
import type { TarEntry } from './tarball.ts';

/**
 * Checks what `changeset pack` packed before anything is published (root ADR
 * 0013), and turns it into the release manifest. Each tarball must be a
 * package of the `@nizam-os` scope under `packages/`, packed as recorded,
 * hold only what a package may hold ({@link tarballProblems}), carry a
 * changelog section for its version, and agree with its dist-tag; gitleaks
 * must find no secret in any of them. A package at 0.0.0 is left out with a
 * notice. The problems name the package and say what is wrong; the manifest
 * is only meant to be written when there are none.
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { prerelease } from 'semver';

import { releaseNotes } from './changelog.ts';
import { tarballProblems } from './contents.ts';
import { integrityOf, SCOPE } from './manifest.ts';
import { plannedReleases, UNVERSIONED, versionProblems } from './plan.ts';
import { scanForSecrets } from './secrets.ts';
import { tarEntries } from './tarball.ts';

/** The plan file `changeset pack` writes into its output directory. */
const PLAN = 'publish-plan.json';

/** What the check found, and the manifest of the releases it let through. */
export interface CheckResult {
  readonly problems: ReadonlyArray<string>;
  readonly notices: ReadonlyArray<string>;
  readonly manifest: ReleaseManifest;
}

/** Where the check reads from. */
export interface CheckInput {
  /** The kit's root: its `packages/` and `.changeset/`. */
  readonly root: string;
  /** The directory `changeset pack` wrote. */
  readonly directory: string;
  /** The commit the tarballs were built from. */
  readonly commit: string;
  readonly scan?: (directory: string) => Array<Finding>;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The directory, under `packages/`, of each package the kit holds, by name. */
export function packageDirectories(root: string): Map<string, string> {
  const directories = new Map<string, string>();
  for (const entry of readdirSync(join(root, 'packages'), {
    withFileTypes: true,
  })) {
    const file = join(root, 'packages', entry.name, 'package.json');
    if (entry.isDirectory() && existsSync(file)) {
      const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
      const name: unknown = isObject(manifest)
        ? Reflect.get(manifest, 'name')
        : undefined;
      if (typeof name === 'string') {
        directories.set(name, `packages/${entry.name}`);
      }
    }
  }
  return directories;
}

/** Whether the kit is in Changesets' pre mode. */
export function inPreMode(root: string): boolean {
  const file = join(root, '.changeset', 'pre.json');
  if (!existsSync(file)) {
    return false;
  }
  const state: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return isObject(state) && Reflect.get(state, 'mode') === 'pre';
}

function sha256Of(bytes: Uint8Array): string {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

/** Writes a tarball's files under `target` for the secret scan; its paths were checked. */
function unpack(entries: ReadonlyArray<TarEntry>, target: string): void {
  for (const entry of entries) {
    if (entry.type === 'file') {
      const file = join(target, entry.path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, entry.content);
    }
  }
}

function checkOne(
  planned: PlannedRelease,
  input: CheckInput,
  context: {
    readonly directories: ReadonlyMap<string, string>;
    readonly preMode: boolean;
    readonly scanRoot: string;
  },
): { readonly problems: Array<string>; readonly release?: Release } {
  const { name, version } = planned;
  const directory = context.directories.get(name);
  if (!name.startsWith(SCOPE) || directory === undefined) {
    return {
      problems: [
        `the plan publishes ${name}, which is not a package of the ${SCOPE} scope under packages/`,
      ],
    };
  }
  const problems = versionProblems(planned, context.preMode);
  const bytes = readFileSync(join(input.directory, planned.tarball));
  if (sha256Of(bytes) !== planned.integrity) {
    return {
      problems: [
        ...problems,
        `its tarball is not the one changeset pack recorded`,
      ],
    };
  }
  let entries: Array<TarEntry>;
  try {
    entries = tarEntries(bytes);
  } catch (error) {
    return {
      problems: [
        ...problems,
        `its tarball cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
  const contentProblems = tarballProblems(entries, {
    name,
    version,
    directory,
  });
  problems.push(...contentProblems);
  const changelog = entries.find(
    (entry) => entry.path === 'package/CHANGELOG.md',
  );
  const notes =
    changelog === undefined
      ? undefined
      : releaseNotes(changelog.content.toString('utf8'), version);
  if (changelog !== undefined && notes === undefined) {
    problems.push(`its CHANGELOG.md has no section for ${version}`);
  }
  if (contentProblems.length === 0) {
    unpack(
      entries,
      join(context.scanRoot, `${name.slice(SCOPE.length)}@${version}`),
    );
  }
  return {
    problems,
    release: {
      name,
      version,
      tag: planned.tag,
      file: planned.tarball,
      integrity: integrityOf(bytes),
      gitTag: `${name}@${version}`,
      prerelease: prerelease(version) !== null,
      notes: notes ?? '',
    },
  };
}

/**
 * Checks a `changeset pack` output directory and returns its problems, its
 * notices and the manifest of the releases it holds.
 */
export function checkRelease(input: CheckInput): CheckResult {
  const plan = plannedReleases(
    JSON.parse(readFileSync(join(input.directory, PLAN), 'utf8')),
  );
  const context = {
    directories: packageDirectories(input.root),
    preMode: inPreMode(input.root),
    scanRoot: mkdtempSync(join(tmpdir(), 'kit-release-scan-')),
  };
  try {
    const problems: Array<string> = [];
    const notices: Array<string> = [];
    const releases: Array<Release> = [];
    for (const planned of plan) {
      if (planned.version === UNVERSIONED) {
        notices.push(
          `${planned.name} is at ${UNVERSIONED}, never versioned; it is released once a changeset versions it`,
        );
        continue;
      }
      const result = checkOne(planned, input, context);
      problems.push(
        ...result.problems.map(
          (problem) => `${planned.name}@${planned.version}: ${problem}`,
        ),
      );
      if (result.release !== undefined) {
        releases.push(result.release);
      }
    }
    const scan = input.scan ?? scanForSecrets;
    for (const finding of scan(context.scanRoot)) {
      const [label = '', ...rest] = finding.file.split('/');
      problems.push(
        `${SCOPE}${label}: gitleaks finds ${finding.rule} in ${rest.join('/')}:${finding.line}`,
      );
    }
    return {
      problems,
      notices,
      manifest: { version: 1, commit: input.commit, releases },
    };
  } finally {
    rmSync(context.scanRoot, { recursive: true, force: true });
  }
}
