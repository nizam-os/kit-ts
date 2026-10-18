/**
 * The entries of a package tarball, read strictly: a gzip stream holding a
 * POSIX ustar archive of regular files and directories, which is what npm and
 * pnpm write. Anything else (a link, a device, a pax or GNU extension header,
 * a header whose checksum does not add up, an entry cut short) is a
 * `TypeError` naming the entry, so the release check refuses an archive it
 * cannot read instead of reading it differently from the registry. A
 * directory's name ends with a slash by convention; its entry is named
 * without it, as a file's is.
 * @ref https://pubs.opengroup.org/onlinepubs/9799919799/utilities/pax.html#tag_20_94_13_06 (ustar Interchange Format)
 * @ref https://pubs.opengroup.org/onlinepubs/9799919799/utilities/pax.html#tag_20_94_18_03 ("the convention of using a filename ending with <slash> was adopted to specify a directory")
 * @packageDocumentation
 */
import { gunzipSync } from 'node:zlib';

/** One entry of a tarball: its path, with the ustar prefix joined, and the bytes of a file. */
export interface TarEntry {
  readonly path: string;
  readonly type: 'file' | 'directory';
  readonly content: Buffer;
}

const BLOCK = 512;
const NAME = { offset: 0, length: 100 } as const;
const SIZE = { offset: 124, length: 12 } as const;
const CHECKSUM = { offset: 148, length: 8 } as const;
const TYPEFLAG = 156;
const MAGIC = { offset: 257, length: 8 } as const;
const PREFIX = { offset: 345, length: 155 } as const;
// "ustar", a NUL, and the version "00": the POSIX format. The GNU format
// writes "ustar  " and a NUL instead.
const USTAR = Buffer.from('ustar\u000000', 'latin1');
const SPACE = 0x20;
const OCTAL = /^[0-7]+$/u;

function text(
  header: Buffer,
  field: { readonly offset: number; readonly length: number },
): string {
  const bytes = header.subarray(field.offset, field.offset + field.length);
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString('utf8');
}

/** An octal number field: digits, ended by a NUL or a space, maybe padded with spaces. */
function octal(
  header: Buffer,
  field: { readonly offset: number; readonly length: number },
  what: string,
): number {
  const digits = text(header, field).trim();
  if (!OCTAL.test(digits)) {
    throw new TypeError(`${what} is not an octal number`);
  }
  return Number.parseInt(digits, 8);
}

/** The sum of a header's bytes with its checksum field read as spaces, as the format defines it. */
function checksumOf(header: Buffer): number {
  let sum = 0;
  for (const [index, byte] of header.entries()) {
    const inField =
      index >= CHECKSUM.offset && index < CHECKSUM.offset + CHECKSUM.length;
    sum += inField ? SPACE : byte;
  }
  return sum;
}

function typeOf(flag: number, path: string): TarEntry['type'] {
  // '0' and, from older writers, a NUL mark a regular file; '5' a directory.
  if (flag === 0x30 || flag === 0) {
    return 'file';
  }
  if (flag === 0x35) {
    return 'directory';
  }
  throw new TypeError(
    `${path} is an entry of type ${JSON.stringify(String.fromCodePoint(flag))}, which a package tarball does not hold`,
  );
}

/**
 * Reads every entry of a gzipped ustar archive, in archive order.
 */
export function tarEntries(gzipped: Uint8Array): Array<TarEntry> {
  const archive = gunzipSync(gzipped);
  const entries: Array<TarEntry> = [];
  let offset = 0;
  for (;;) {
    if (offset + BLOCK > archive.length) {
      throw new TypeError('the archive ends without its end-of-archive blocks');
    }
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) {
      return entries;
    }
    const name = text(header, NAME);
    const prefix = text(header, PREFIX);
    const path = prefix === '' ? name : `${prefix}/${name}`;
    if (
      !header.subarray(MAGIC.offset, MAGIC.offset + MAGIC.length).equals(USTAR)
    ) {
      throw new TypeError(`${path} is not a POSIX ustar header`);
    }
    if (
      octal(header, CHECKSUM, `the checksum of ${path}`) !== checksumOf(header)
    ) {
      throw new TypeError(`the header of ${path} fails its checksum`);
    }
    const type = typeOf(header[TYPEFLAG] ?? 0, path);
    const size = octal(header, SIZE, `the size of ${path}`);
    const start = offset + BLOCK;
    if (start + size > archive.length) {
      throw new TypeError(`${path} is cut short`);
    }
    if (type === 'directory' && size !== 0) {
      throw new TypeError(`${path} is a directory with content`);
    }
    entries.push({
      path:
        type === 'directory' && path.endsWith('/') ? path.slice(0, -1) : path,
      type,
      content: archive.subarray(start, start + size),
    });
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
  }
}
