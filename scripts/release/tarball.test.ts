import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { tarEntries } from './tarball.ts';
import { tarballOf, tarOf } from './test-support.ts';

describe('tarEntries', () => {
  it('reads the files and directories of a ustar archive, in order', () => {
    const entries = tarEntries(
      tarballOf([
        { path: 'package/package.json', content: '{"name":"a"}' },
        { path: 'package/dist', type: '5' },
        { path: 'package/dist/index.js', content: 'x'.repeat(1300) },
        { path: 'package/README.md', content: '' },
      ]),
    );
    expect(
      entries.map(({ path, type, content }) => [path, type, content.length]),
    ).toEqual([
      ['package/package.json', 'file', 12],
      ['package/dist', 'directory', 0],
      ['package/dist/index.js', 'file', 1300],
      ['package/README.md', 'file', 0],
    ]);
    expect(entries[0]?.content.toString()).toBe('{"name":"a"}');
  });

  it('names a directory without the slash that ends it by convention, and only a directory', () => {
    expect(
      tarEntries(
        tarballOf([
          { path: 'package/dist/', type: '5' },
          { path: 'package/dist/index.js/', content: 'x' },
        ]),
      ).map(({ path }) => path),
    ).toEqual(['package/dist', 'package/dist/index.js/']);
  });

  it('joins the prefix field to the name, and reads a name that fills its field', () => {
    const name = 'n'.repeat(100);
    const [entry] = tarEntries(
      tarballOf([{ path: name, prefix: 'package/dist', content: 'x' }]),
    );
    expect(entry?.path).toBe(`package/dist/${name}`);
  });

  it('takes a NUL typeflag as a regular file, as older writers mark one', () => {
    const [entry] = tarEntries(
      tarballOf([{ path: 'package/LICENSE', type: '\u0000', content: 'MIT' }]),
    );
    expect(entry?.type).toBe('file');
  });

  it.each([
    ['1', 'a hard link'],
    ['2', 'a symbolic link'],
    ['3', 'a character device'],
    ['6', 'a FIFO'],
    ['x', 'a pax extended header'],
    ['g', 'a pax global header'],
    ['L', 'a GNU long name'],
  ])('refuses an entry of type %s (%s)', (type) => {
    expect(() =>
      tarEntries(tarballOf([{ path: 'package/dist/a', type }])),
    ).toThrow(
      `package/dist/a is an entry of type "${type}", which a package tarball does not hold`,
    );
  });

  it('refuses the GNU format and anything that is not a ustar header', () => {
    expect(() =>
      tarEntries(tarballOf([{ path: 'package/a', magic: 'ustar  \u0000' }])),
    ).toThrow('package/a is not a POSIX ustar header');
  });

  it('refuses a header whose checksum does not add up', () => {
    expect(() =>
      tarEntries(tarballOf([{ path: 'package/a', badChecksum: true }])),
    ).toThrow('the header of package/a fails its checksum');
  });

  it('refuses a directory with content', () => {
    expect(() =>
      tarEntries(
        tarballOf([{ path: 'package/dist', type: '5', content: 'x' }]),
      ),
    ).toThrow('package/dist is a directory with content');
  });

  it('refuses an archive without its end-of-archive blocks or cut short', () => {
    expect(() =>
      tarEntries(tarballOf([{ path: 'package/a', content: 'x' }], true)),
    ).toThrow('the archive ends without its end-of-archive blocks');
    const archive = tarOf([{ path: 'package/a', content: 'x'.repeat(600) }]);
    expect(() => tarEntries(gzipSync(archive.subarray(0, 1024)))).toThrow(
      'package/a is cut short',
    );
  });

  it('refuses a size that is not an octal number', () => {
    const archive = tarOf([{ path: 'package/a', content: 'x' }]);
    archive.write('00000000009\u0000', 124, 12, 'latin1');
    let sum = 0;
    archive.fill(0x20, 148, 156);
    for (const byte of archive.subarray(0, 512)) {
      sum += byte;
    }
    archive.write(
      `${sum.toString(8).padStart(6, '0')}\u0000 `,
      148,
      8,
      'latin1',
    );
    expect(() => tarEntries(gzipSync(archive))).toThrow(
      'the size of package/a is not an octal number',
    );
  });

  it('refuses what is not gzip', () => {
    expect(() => tarEntries(Buffer.from('not gzip'))).toThrow();
  });
});
