/**
 * Fixtures for the release scripts' tests: tarballs written the way npm and
 * pnpm write them (POSIX ustar, gzipped), with switches to write each defect
 * the reader and the checks must refuse, and the output directory `changeset
 * pack` writes them into; releases as a manifest names them; and what
 * publishing needs from outside, recorded.
 * @ref https://pubs.opengroup.org/onlinepubs/9799919799/utilities/pax.html#tag_20_94_13_06 (ustar Interchange Format)
 * @packageDocumentation
 */
import type { Release } from './manifest.ts';
import type { PublishDeps, RunNpm } from './publisher.ts';
import type { RegistryState } from './registry.ts';
import type { TrustAnswer } from './trust.ts';

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { tarballSpec } from './publisher.ts';

/** The integrity every release of {@link releaseOf} carries. */
export const INTEGRITY: string = `sha512-${'A'.repeat(86)}==`;

/** A release of `name` at `version` as a manifest names it, on `next` when it is a prerelease. */
export function releaseOf(
  name: string,
  version: string,
  prerelease = false,
): Release {
  return {
    name,
    version,
    tag: prerelease ? 'next' : 'latest',
    file: `packages/${name.slice(1).replace('/', '-')}-${version}.tgz`,
    integrity: INTEGRITY,
    gitTag: `${name}@${version}`,
    prerelease,
    notes: `notes of ${version}`,
  };
}

/** One run of npm that {@link publishDeps} recorded. */
export interface NpmCall {
  readonly args: ReadonlyArray<string>;
  readonly withToken: boolean;
}

/**
 * What publishing `releases` needs, over the registry `states` (a package
 * missing from them is not on npm): npm succeeds, reporting the release's
 * integrity and, for a stage, a stage id, unless `options.npm` runs instead;
 * and every trusted publisher accepts, unless `options.trust` answers for it.
 * Records npm's runs, the log, and the packages whose trusted publisher was
 * asked.
 */
export function publishDeps(
  releases: ReadonlyArray<Release>,
  states: Readonly<Record<string, RegistryState>>,
  options: {
    readonly hasToken?: boolean;
    readonly npm?: RunNpm;
    readonly trust?: Readonly<Record<string, TrustAnswer>>;
  } = {},
): PublishDeps & {
  readonly calls: Array<NpmCall>;
  readonly lines: Array<string>;
  readonly asked: Array<string>;
} {
  const calls: Array<NpmCall> = [];
  const lines: Array<string> = [];
  const asked: Array<string> = [];
  return {
    calls,
    lines,
    asked,
    registry: async (name) => {
      await Promise.resolve();
      return states[name] ?? { exists: false };
    },
    trust: async (name) => {
      await Promise.resolve();
      asked.push(name);
      return options.trust?.[name] ?? { accepted: true };
    },
    npm:
      options.npm ??
      ((args, withToken) => {
        calls.push({ args, withToken });
        const spec = args[0] === 'stage' ? args[2] : args[1];
        const name =
          releases.find((release) => tarballSpec(release) === spec)?.name ?? '';
        const stage = args[0] === 'stage' ? { stageId: `stage-${name}` } : {};
        return {
          status: 0,
          stdout: JSON.stringify({
            [name]: { integrity: INTEGRITY, ...stage },
          }),
        };
      }),
    hasToken: options.hasToken ?? false,
    log: (line) => {
      lines.push(line);
    },
  };
}

/** One entry to write; `type` is the typeflag, `'0'` by default. */
export interface FixtureEntry {
  readonly path: string;
  readonly content?: string | Buffer;
  readonly type?: string;
  readonly magic?: string;
  readonly badChecksum?: boolean;
  readonly prefix?: string;
}

const BLOCK = 512;

function put(
  header: Buffer,
  offset: number,
  length: number,
  value: string,
): void {
  header.write(value.slice(0, length), offset, length, 'latin1');
}

function headerOf(entry: FixtureEntry, size: number): Buffer {
  const header = Buffer.alloc(BLOCK);
  put(header, 0, 100, entry.path);
  put(header, 100, 8, '0000644\u0000');
  put(header, 124, 12, `${size.toString(8).padStart(11, '0')}\u0000`);
  put(header, 136, 12, '03560116604\u0000');
  put(header, 156, 1, entry.type ?? '0');
  put(header, 257, 8, entry.magic ?? 'ustar\u000000');
  if (entry.prefix !== undefined) {
    put(header, 345, 155, entry.prefix);
  }
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of header) {
    sum += byte;
  }
  const checksum = entry.badChecksum === true ? sum + 1 : sum;
  put(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\u0000 `);
  return header;
}

/** The uncompressed archive of `entries`, ended by its two zero blocks unless `unterminated`. */
export function tarOf(
  entries: ReadonlyArray<FixtureEntry>,
  unterminated = false,
): Buffer {
  const parts: Array<Buffer> = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content ?? '');
    parts.push(headerOf(entry, content.length), content);
    const padding = (BLOCK - (content.length % BLOCK)) % BLOCK;
    parts.push(Buffer.alloc(padding));
  }
  if (!unterminated) {
    parts.push(Buffer.alloc(2 * BLOCK));
  }
  return Buffer.concat(parts);
}

/** The gzipped archive of `entries`. */
export function tarballOf(
  entries: ReadonlyArray<FixtureEntry>,
  unterminated = false,
): Buffer {
  return gzipSync(tarOf(entries, unterminated));
}

/** The `sha512-<base64>` integrity npm records for `bytes`. */
export function sha512Of(bytes: Uint8Array): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

/** The `sha256-<base64>` integrity Changesets records for `bytes`. */
function sha256Of(bytes: Uint8Array): string {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

/** A manifest of the kit's shape for `name` at `version`, with `changes` applied. */
function manifestFor(
  name: string,
  version: string,
  changes: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const directory = `packages/${name.replace(/^@[^/]+\//u, '')}`;
  return {
    name,
    version,
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/nizam-os/kit-ts.git',
      directory,
    },
    type: 'module',
    exports: { '.': './dist/index.js', './package.json': './package.json' },
    publishConfig: { access: 'public', provenance: true },
    dependencies: { '@nizam-os/keyset-core': '0.1.0' },
    peerDependencies: { hono: '>=4.13.7' },
    devDependencies: { typescript: '7.0.2' },
    scripts: { build: 'tsdown', test: 'vitest run' },
    ...changes,
  };
}

/** The entries of a well-formed package tarball for `name` at `version`. */
export function packageEntries(
  name: string,
  version: string,
  changes: Readonly<Record<string, unknown>> = {},
): Array<FixtureEntry> {
  return [
    { path: 'package/LICENSE', content: 'MIT License\n' },
    { path: 'package/dist/index.js', content: 'export const one = 1;\n' },
    {
      path: 'package/package.json',
      content: JSON.stringify(manifestFor(name, version, changes), null, 2),
    },
    { path: 'package/README.md', content: `# ${name}\n` },
    {
      path: 'package/CHANGELOG.md',
      content: `# ${name}\n\n## ${version}\n\n### Minor Changes\n\n- The first release.\n`,
    },
  ];
}

/** A package `changeset pack` packed, as a test describes it. */
export interface Packed {
  readonly name: string;
  readonly version: string;
  readonly tag?: string;
  readonly entries?: ReadonlyArray<FixtureEntry>;
  readonly integrity?: string;
}

/**
 * Writes the tarballs and the plan `changeset pack` would into `directory`,
 * one chunk per package, and returns each tarball by package name.
 */
export function writePack(
  directory: string,
  packed: ReadonlyArray<Packed>,
): Map<string, Buffer> {
  const bytes = new Map<string, Buffer>();
  const plan = packed.map(
    ({ name, version, tag = 'latest', entries, integrity }) => {
      const file = `packages/${name.slice(1).replace('/', '-')}-${version}.tgz`;
      const tarball = tarballOf(entries ?? packageEntries(name, version));
      writeFileSync(join(directory, file), tarball);
      bytes.set(name, tarball);
      return [
        {
          kind: 'publish',
          name,
          version,
          access: 'public',
          tag,
          tarball: { path: file, integrity: integrity ?? sha256Of(tarball) },
        },
      ];
    },
  );
  writeFileSync(
    join(directory, 'publish-plan.json'),
    JSON.stringify({ version: 1, plan }),
  );
  return bytes;
}
