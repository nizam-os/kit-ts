/**
 * Tarballs for the release scripts' tests, written the way npm and pnpm write
 * them (POSIX ustar, gzipped), with switches to write each defect the reader
 * and the checks must refuse, and the output directory `changeset pack`
 * writes them into.
 * @ref https://pubs.opengroup.org/onlinepubs/9799919799/utilities/pax.html#tag_20_94_13_06 (ustar Interchange Format)
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

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
