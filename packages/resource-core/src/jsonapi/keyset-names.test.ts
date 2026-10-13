import { describe, expect, it } from 'vitest';

import { isFieldName, isSearchConfig } from '@nizam-os/keyset-core';

import {
  FIELD_NAME_CASES,
  SEARCH_CONFIG_CASES,
} from '../test-support/keyset-name-cases';

describe('the keyset name case tables against @nizam-os/keyset-core (SPEC 11.2)', () => {
  it.each(FIELD_NAME_CASES)('%j is a field name: %s', (name, valid) => {
    expect(isFieldName(name)).toBe(valid);
  });

  it.each(SEARCH_CONFIG_CASES)(
    '%j is a search configuration: %s',
    (config, valid) => {
      expect(isSearchConfig(config)).toBe(valid);
    },
  );
});
