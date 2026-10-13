/**
 * Package surface. Both packages must resolve through their published
 * `exports` maps at runtime and export exactly what SPEC 1 lists, the
 * binding re-exporting the core's own bindings. Value imports on purpose: a
 * missing dist file or a wrong `exports` entry fails here before any feature
 * test runs.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as core from '@nizam-os/intl-core';
import * as binding from '@nizam-os/paraglide-intl';

function names(module: object): Array<string> {
  return Object.keys(module).toSorted();
}

/** SPEC 1: the core's values. */
const CORE = [
  'DEFAULT_CACHE_SIZE',
  'DEFAULT_TIME_ZONE',
  'FIRST_STRONG_ISOLATE',
  'POP_DIRECTIONAL_ISOLATE',
  'TIME_ZONE_COOKIE_MAX_AGE',
  'createIntl',
  'createTimeZone',
  'detectTimeZone',
  'isolate',
  'timeZoneCookie',
  'timeZoneFromCookie',
  'toTimeZone',
].toSorted();

/** SPEC 1: the binding's values, the core's included. */
const BINDING = [
  ...CORE,
  'compile',
  'MessageFormattingError',
  'watch',
].toSorted();

describe('package surface', () => {
  it('@nizam-os/intl-core exports the documented values', () => {
    expect(names(core)).toEqual(CORE);
  });

  it("@nizam-os/paraglide-intl exports them too, as the core's own bindings", () => {
    expect(names(binding)).toEqual(BINDING);
    for (const name of CORE) {
      expect(Reflect.get(binding, name)).toBe(Reflect.get(core, name));
    }
  });

  it('ships every bidi control as an escape, never as the character', async () => {
    for (const name of ['@nizam-os/intl-core', '@nizam-os/paraglide-intl']) {
      const dist = dirname(fileURLToPath(import.meta.resolve(name)));
      const files = await readdir(dist);
      expect(files.filter((file) => /^index\.m?js$/u.test(file))).toHaveLength(
        1,
      );
      for (const file of files) {
        const text = await readFile(join(dist, file), 'utf8');
        expect({ file, controls: text.match(/\p{Bidi_Control}/gu) }).toEqual({
          file,
          controls: null,
        });
      }
    }
  });

  it('resolves package.json through the exports map', async () => {
    const corePkg = (await import('@nizam-os/intl-core/package.json', {
      with: { type: 'json' },
    })) as {
      default: { name: string };
    };
    expect(corePkg.default.name).toBe('@nizam-os/intl-core');
    const bindingPkg = (await import('@nizam-os/paraglide-intl/package.json', {
      with: { type: 'json' },
    })) as {
      default: { name: string };
    };
    expect(bindingPkg.default.name).toBe('@nizam-os/paraglide-intl');
  });
});
