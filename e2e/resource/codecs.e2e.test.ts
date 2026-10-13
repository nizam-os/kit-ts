import { describe, expect, it } from 'vitest';
import * as zm from 'zod/mini';

/**
 * The contacts application's codecs and validators (resource SPEC 7),
 * through the built package and the application's own Zod: each holds the
 * fixtures its schema accepted or rejected, the definer takes only what
 * `defineCodec` and `defineValidator` made, and a fixture its schema
 * disagrees with fails at startup with a `TypeError` naming it.
 */
import { defineCodec, defineValidator } from '@nizam-os/resource-core';

import { publicCatalog } from './fixtures/contacts/public-catalog.ts';
import { codecs } from './resources/codecs.ts';
import { validators } from './resources/validators.ts';
import { configureUntyped, typeErrorOf } from './support/untyped.ts';

describe('the codecs and validators', () => {
  it('hold their type names and fixtures, frozen', () => {
    expect(codecs.timeRange.types).toEqual(['tstzrange']);
    expect(codecs.timeRange.fixtures).toHaveLength(2);
    expect(validators.contactOrNotes.fixtures.reject).toEqual([
      { contact: null, notes: null },
    ]);
    for (const value of [codecs.timeRange, validators.email]) {
      expect(Object.isFrozen(value)).toBe(true);
      expect(Object.isFrozen(value.fixtures)).toBe(true);
    }
  });

  it('are refused by the definer when copied or written by hand', () => {
    expect(
      typeErrorOf(() =>
        configureUntyped({
          catalog: publicCatalog,
          codecs: { timeRange: { ...codecs.timeRange } },
        }),
      ),
    ).toBe(
      'createDeclareResource.codecs.timeRange: must be made by defineCodec',
    );
    expect(
      typeErrorOf(() =>
        configureUntyped({
          catalog: publicCatalog,
          validators: { email: { schema: validators.email.schema } },
        }),
      ),
    ).toBe(
      'createDeclareResource.validators.email: must be made by defineValidator',
    );
  });

  it('fail at startup when a fixture disagrees with the schema', () => {
    expect(
      typeErrorOf(() =>
        defineCodec({
          types: ['tstzrange'],
          schema: codecs.timeRange.schema,
          fixtures: [
            { start: '2026-03-02T10:00:00Z', end: '2026-03-02T09:00:00Z' },
          ],
        }),
      ),
    ).toBe('defineCodec.fixtures[0]: the schema rejects this fixture');
    expect(
      typeErrorOf(() =>
        defineValidator({
          schema: validators.lowercase.schema,
          fixtures: { accept: ['lobby'], reject: ['Lobby', 'lobby-2'] },
        }),
      ),
    ).toBe(
      'defineValidator.fixtures.reject[1]: the schema accepts this fixture',
    );
  });

  it('take Zod Mini schemas, which share Zod Core', () => {
    const twoLetters = defineValidator({
      schema: zm.string().check(zm.regex(/^[A-Z]{2}$/u)),
      fixtures: { accept: ['DE'], reject: ['de', 'DEU'] },
    });
    expect(twoLetters.fixtures.accept).toEqual(['DE']);
  });
});
