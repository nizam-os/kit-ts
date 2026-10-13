import { describe, expect, it } from 'vitest';

import { toCamelCase } from '@nizam-os/catalog-core';

import { CAMEL_CASES } from '../test-support/camel-cases';

describe('toCamelCase, the runtime twin of CamelCase (SPEC 4.1, 4.3)', () => {
  it.each(CAMEL_CASES)(
    'turns %j into %j, as CamelCasePlugin does',
    (input, output) => {
      expect(toCamelCase(input)).toBe(output);
    },
  );
});
