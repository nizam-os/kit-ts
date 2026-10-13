/**
 * The client types of the contacts application's definitions (resource
 * SPEC 11.1, jsonapi SPEC 5.3), read through the built declarations: `tsc`
 * checks every `expectTypeOf` here against `dist/`, the way an installed
 * copy is read, and the member stays absent at runtime.
 */
import type { TypesOf } from '@nizam-os/jsonapi-core';

import type { Organizations } from './resources/organizations.ts';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { Contacts } from './resources/contacts.ts';

type Contact = TypesOf<typeof Contacts.resource>;

describe("the contacts application's client types (SPEC 11.1)", () => {
  it('types what a client reads: the read types as JSON, and the organization', () => {
    expectTypeOf<Contact['attributes']>().toEqualTypeOf<{
      readonly kind: 'person' | 'company';
      readonly name: string;
      readonly nickname: string | null;
      readonly email: string | null;
      readonly website: string | null;
      readonly status: 'active' | 'archived';
      readonly priority: number | null;
      readonly discount: string | null;
      readonly tags: ReadonlyArray<string>;
      readonly createdAt: string;
    }>();
    expectTypeOf<Contact['relationships']>().toEqualTypeOf<{
      readonly organization: {
        readonly type: 'organizations';
        readonly cardinality: 'one';
      };
    }>();
  });

  it('types the query it may send', () => {
    expectTypeOf<Contact['filter']>().toEqualTypeOf<{
      readonly kind: 'eq' | 'in';
      readonly name: 'eq' | 'startsWithi';
      readonly email: 'eq';
      readonly status: 'eq' | 'in';
      readonly priority: 'gte' | 'lte';
      readonly tags: 'contains' | 'overlaps';
      readonly createdAt: 'gte' | 'lt';
    }>();
    expectTypeOf<Contact['include']>().toEqualTypeOf<'organization'>();
    expectTypeOf<Contact['search']>().toEqualTypeOf<true>();
    expectTypeOf<
      TypesOf<typeof Organizations.resource>['search']
    >().toEqualTypeOf<false>();
  });

  it('types what it writes: the server writes the organization', () => {
    expectTypeOf<Contact['create']['name']>().toEqualTypeOf<string>();
    expectTypeOf<Contact['create']['kind']>().toEqualTypeOf<
      'person' | 'company' | undefined
    >();
    expectTypeOf<Contact['creatable']>().toEqualTypeOf<
      | 'kind'
      | 'name'
      | 'nickname'
      | 'email'
      | 'website'
      | 'status'
      | 'priority'
      | 'discount'
      | 'tags'
    >();
    expectTypeOf<Contact['updatable']>().toEqualTypeOf<
      Exclude<Contact['creatable'], 'kind'>
    >();
    expectTypeOf<Contact['clientIds']>().toEqualTypeOf<false>();
  });

  it('carries them in types only', () => {
    expect(Object.hasOwn(Contacts.resource, '~types')).toBe(false);
  });
});
