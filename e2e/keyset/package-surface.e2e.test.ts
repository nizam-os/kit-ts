/**
 * Package surface. The three packages must resolve through their published
 * `exports` maps at runtime and export exactly what the SPEC lists. Value
 * imports on purpose: a missing dist file or a wrong `exports` entry fails
 * here before any feature test runs.
 */
import { describe, expect, it } from 'vitest';

import * as drizzle from '@nizam-os/drizzle-keyset';
import * as core from '@nizam-os/keyset-core';
import * as kysely from '@nizam-os/kysely-keyset';

function names(module: object): Array<string> {
  return Object.keys(module).toSorted();
}

/** SPEC 1: the core's values. */
const CORE = [
  'CURSOR_VERSION',
  'DEFAULT_MAX_PAGE_SIZE',
  'DEFAULT_PAGE_SIZE',
  'InvalidCursorError',
  'InvalidFilterError',
  'InvalidFilterValueError',
  'InvalidPageSizeError',
  'KeysetError',
  'MIN_SECRET_BYTES',
  'OPERATORS',
  'PageSizeExceededError',
  'RangeNotSupportedError',
  'UnsupportedFilterError',
  'UnsupportedSearchError',
  'UnsupportedSortError',
  'checkScalar',
  'createCursorCodec',
  'createDefineKeyset',
  'createPlanner',
  'defineKeyset',
  'escapeLike',
  'finishPage',
  'isFieldName',
  'isKeysetError',
  'isOperator',
  'isSearchConfig',
  'keyAlias',
  'operatorsFor',
  'resolvePage',
  'resolveSort',
  'seekPredicate',
  'sortSignature',
].toSorted();

/**
 * SPEC 10: the Kysely adapter's own values, on top of the core's. Its
 * `createDefineKeyset` replaces the core's export of the same name.
 */
const ADAPTER = [
  'createDefineKeyset',
  'paginate',
  'renderPredicate',
  'renderTarget',
].toSorted();

/** SPEC 1, 14: the Drizzle adapter's own values; no standalone `paginate`. */
const DRIZZLE = ['createDefineKeyset', 'renderPredicate', 'renderTarget'];

describe('package surface', () => {
  it('@nizam-os/keyset-core exports the documented values', () => {
    expect(names(core)).toEqual(CORE);
  });

  it('@nizam-os/kysely-keyset re-exports the core and adds the adapter', () => {
    expect(names(kysely)).toEqual(
      [...new Set([...CORE, ...ADAPTER])].toSorted(),
    );
    expect(kysely.defineKeyset).toBe(core.defineKeyset);
    expect(kysely.createDefineKeyset).not.toBe(core.createDefineKeyset);
    expect(kysely.InvalidCursorError).toBe(core.InvalidCursorError);
  });

  it('@nizam-os/drizzle-keyset re-exports the core and adds the adapter', () => {
    expect(names(drizzle)).toEqual(
      [...new Set([...CORE, ...DRIZZLE])].toSorted(),
    );
    expect(drizzle.defineKeyset).toBe(core.defineKeyset);
    expect(drizzle.createDefineKeyset).not.toBe(core.createDefineKeyset);
    expect(drizzle.InvalidCursorError).toBe(core.InvalidCursorError);
  });

  it('resolves package.json through the exports map', async () => {
    const corePkg = (await import('@nizam-os/keyset-core/package.json', {
      with: { type: 'json' },
    })) as {
      default: { name: string };
    };
    const adapterPkg = (await import('@nizam-os/kysely-keyset/package.json', {
      with: { type: 'json' },
    })) as {
      default: { name: string };
    };
    const drizzlePkg = (await import('@nizam-os/drizzle-keyset/package.json', {
      with: { type: 'json' },
    })) as {
      default: { name: string };
    };
    expect(corePkg.default.name).toBe('@nizam-os/keyset-core');
    expect(adapterPkg.default.name).toBe('@nizam-os/kysely-keyset');
    expect(drizzlePkg.default.name).toBe('@nizam-os/drizzle-keyset');
  });
});
