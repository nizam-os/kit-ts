/**
 * The client types the blog's definitions carry (SPEC 5.3), read through
 * the built declarations: `tsc` checks every `expectTypeOf` here against
 * `dist/`, the way an installed copy is read, and the member stays absent
 * at runtime.
 */
import type { TypesOf } from '@nizam-os/jsonapi-core';

import type { People } from './support/resources.ts';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { Articles, Tags } from './support/resources.ts';

describe("the blog definitions' client types (SPEC 5.3)", () => {
  it('types what an article serializes, its relationships, and its query', () => {
    type Types = TypesOf<typeof Articles>;
    expectTypeOf<Types['attributes']>().toEqualTypeOf<{
      readonly title: string;
      readonly body: string;
      readonly createdAt: string;
    }>();
    expectTypeOf<Types['relationships']['author']>().toEqualTypeOf<{
      readonly type: 'people';
      readonly cardinality: 'one';
    }>();
    expectTypeOf<
      Types['relationships']['tags']['cardinality']
    >().toEqualTypeOf<'many'>();
    expectTypeOf<Types['filter']>().toEqualTypeOf<{
      readonly title: 'eq' | 'like';
      readonly author: 'eq';
    }>();
    expectTypeOf<Types['include']>().toEqualTypeOf<
      'author' | 'author.articles' | 'tags'
    >();
    expectTypeOf<Types['search']>().toEqualTypeOf<true>();
    expectTypeOf<Types['page']>().toEqualTypeOf<true>();
  });

  it("types a write by its validator's input", () => {
    expectTypeOf<TypesOf<typeof Articles>['create']>().toEqualTypeOf<{
      title: string;
      body?: string | undefined;
    }>();
    expectTypeOf<TypesOf<typeof People>['create']>().toEqualTypeOf<{
      name: string;
      twitter?: string | null | undefined;
    }>();
    expectTypeOf<TypesOf<typeof Tags>['creatable']>().toEqualTypeOf<'name'>();
  });

  it('is absent at runtime', () => {
    expect('~types' in Articles).toBe(false);
    expect(Object.keys(Tags)).not.toContain('~types');
  });
});
