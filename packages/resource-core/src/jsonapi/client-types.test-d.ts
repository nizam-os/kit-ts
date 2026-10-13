/**
 * A declared resource's client types (SPEC 11.1, jsonapi SPEC 5.3): what
 * `TypesOf` reads from its JSON:API definition, computed from the
 * declaration and the catalog.
 */
import type { JsonOf, ResourceTypes, TypesOf } from '@nizam-os/jsonapi-core';

import type { DeclaredResource } from '../declare/declared-resource';
import type { JsonData } from '../schema/value-types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});

const Organizations = declareResource('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update'],
  clientIds: true,
  fields: {
    kind: { access: 'immutable', filter: ['eq', 'in'] },
    name: { access: 'readWrite', filter: ['eq', 'startsWithi'], sort: true },
    nickname: { access: 'readWrite', as: 'alias' },
    status: { access: 'readWrite' },
    discount: { access: 'write' },
    tags: { access: 'readWrite', filter: ['contains'] },
    created_at: { access: 'read', sort: true },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'readWrite',
      filter: ['eq'],
      include: true,
    },
  },
  search: { column: 'search' },
});

const Changes = declareResource('audit.changes', {
  operations: ['create'],
  fields: {
    operation: { access: 'immutable' },
    payload: { access: 'immutable' },
    table_name: { access: 'immutable' },
    row_id: { access: 'immutable' },
  },
});

type Types = TypesOf<typeof Contacts.resource>;

describe("a declared resource's client types (SPEC 11.1)", () => {
  it('types the attributes as the JSON of the read types, never a write field', () => {
    expectTypeOf<Types['attributes']>().toEqualTypeOf<{
      readonly kind: 'person' | 'company';
      readonly name: string;
      readonly alias: string | null;
      readonly status: 'active' | 'archived';
      readonly tags: ReadonlyArray<string>;
      readonly createdAt: string;
    }>();
  });

  it("types each relationship by its target's public type, to-one", () => {
    expectTypeOf<Types['relationships']>().toEqualTypeOf<{
      readonly organization: {
        readonly type: 'organizations';
        readonly cardinality: 'one';
      };
    }>();
  });

  it('types the query: the operators by public name, the includes, search, and pages', () => {
    expectTypeOf<Types['filter']>().toEqualTypeOf<{
      readonly kind: 'eq' | 'in';
      readonly name: 'eq' | 'startsWithi';
      readonly tags: 'contains';
      readonly organization: 'eq';
    }>();
    expectTypeOf<Types['include']>().toEqualTypeOf<'organization'>();
    expectTypeOf<Types['fields']>().toEqualTypeOf<true>();
    expectTypeOf<Types['search']>().toEqualTypeOf<true>();
    expectTypeOf<Types['page']>().toEqualTypeOf<true>();
    expectTypeOf<Types['custom']>().toEqualTypeOf<never>();
    expectTypeOf<Types['clientIds']>().toEqualTypeOf<true>();
  });

  it("types each write by its validator's input, and the members it holds", () => {
    type Input<TValidator> = TValidator extends {
      readonly '~standard': { readonly types?: infer TTypes };
    }
      ? NonNullable<TTypes> extends { readonly input: infer TInput }
        ? TInput
        : never
      : never;
    expectTypeOf<Types['create']>().toEqualTypeOf<
      Input<typeof Contacts.validate.create>
    >();
    expectTypeOf<Types['update']>().toEqualTypeOf<
      Input<typeof Contacts.validate.update>
    >();
    expectTypeOf<Types['create']>().toEqualTypeOf<{
      name: string;
      kind?: 'person' | 'company' | undefined;
      alias?: string | null | undefined;
      status?: 'active' | 'archived' | undefined;
      discount?: string | null | undefined;
      tags?: Array<string> | undefined;
    }>();
    expectTypeOf<Types['creatable']>().toEqualTypeOf<
      | 'kind'
      | 'name'
      | 'alias'
      | 'status'
      | 'discount'
      | 'tags'
      | 'organization'
    >();
    expectTypeOf<Types['updatable']>().toEqualTypeOf<
      'name' | 'alias' | 'status' | 'discount' | 'tags' | 'organization'
    >();
  });

  it('has no call to type for an operation the declaration does not serve', () => {
    type Read = TypesOf<typeof Organizations.resource>;
    expectTypeOf<Read['create']>().toEqualTypeOf<never>();
    expectTypeOf<Read['update']>().toEqualTypeOf<never>();
    expectTypeOf<keyof Read['relationships']>().toEqualTypeOf<never>();
    expectTypeOf<keyof Read['filter']>().toEqualTypeOf<never>();
    expectTypeOf<Read['include']>().toEqualTypeOf<never>();
    expectTypeOf<Read['search']>().toEqualTypeOf<false>();
    expectTypeOf<Read['clientIds']>().toEqualTypeOf<false>();
  });

  it('keeps a json member a JSON value', () => {
    type Audit = TypesOf<typeof Changes.resource>;
    expectTypeOf<Audit['attributes']['payload']>().toEqualTypeOf<
      JsonOf<JsonData>
    >();
    expectTypeOf<Audit['create']['payload']>().toEqualTypeOf<
      JsonData | undefined
    >();
  });

  it('is the wide form for a resource typed wide', () => {
    const Wide: DeclaredResource = Contacts;
    expectTypeOf<
      TypesOf<typeof Wide.resource>
    >().toEqualTypeOf<ResourceTypes>();
  });
});
