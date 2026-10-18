import { describe, expect, it } from 'vitest';

import { releaseNotes } from './changelog.ts';

const CHANGELOG = `# @nizam-os/keyset-core

## 0.2.0

### Minor Changes

- [\`abc1234\`](https://github.com/nizam-os/kit-ts/commit/abc1234) Thanks [@someone](https://github.com/someone)! - The overlaps operator.

  A second paragraph of the entry.

### Patch Changes

- Updated dependencies

## 0.1.0

### Minor Changes

- The first release.
`;

describe('releaseNotes', () => {
  it('takes the section of the version, without its heading', () => {
    expect(releaseNotes(CHANGELOG, '0.2.0')).toBe(`### Minor Changes

- [\`abc1234\`](https://github.com/nizam-os/kit-ts/commit/abc1234) Thanks [@someone](https://github.com/someone)! - The overlaps operator.

  A second paragraph of the entry.

### Patch Changes

- Updated dependencies`);
  });

  it('takes the last section to the end of the file', () => {
    expect(releaseNotes(CHANGELOG, '0.1.0')).toBe(
      '### Minor Changes\n\n- The first release.',
    );
  });

  it('matches the whole version, not a prefix of it', () => {
    expect(releaseNotes(CHANGELOG, '0.2')).toBeUndefined();
    expect(releaseNotes(CHANGELOG, '0.2.0-next.0')).toBeUndefined();
  });

  it('has no notes for a version without a section or with an empty one', () => {
    expect(releaseNotes(CHANGELOG, '0.3.0')).toBeUndefined();
    expect(
      releaseNotes('# a\n\n## 1.0.0\n\n## 0.9.0\n\n- x\n', '1.0.0'),
    ).toBeUndefined();
  });

  it('reads a changelog written with CRLF line ends', () => {
    expect(releaseNotes('# a\r\n\r\n## 1.0.0\r\n\r\n- x\r\n', '1.0.0')).toBe(
      '- x',
    );
  });
});
