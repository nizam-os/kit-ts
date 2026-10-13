/**
 * The types of both derived definitions (SPEC 11.1, 11.2) over a typed
 * declaration: the keyset definition's field names and which of them sort,
 * which keyset-core's request type reads, and the JSON:API definition's
 * names, row, and attributes, which jsonapi-core's helpers read.
 */
import type {
  CreateAttributesOf,
  RelationshipNameOf,
  RowOf,
  UpdateAttributesOf,
} from '@nizam-os/jsonapi-core';

import type { DeclaredResource } from '../declare/declared-resource';
import type { Infer } from '../schema/infer';
import type { PublicRowOf } from '../server/resource-types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDefineKeyset, defineKeyset } from '@nizam-os/keyset-core';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});

const Organizations = declareResource('organizations', {
  operations: ['list', 'get'],
  fields: { name: { access: 'read', sort: true } },
});

const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create'],
  fields: {
    kind: { access: 'immutable', filter: ['eq', 'in'] },
    name: { access: 'readWrite', filter: ['eq'], sort: true },
    nickname: { access: 'readWrite', as: 'alias' },
    website: { access: 'write' },
    created_at: { access: 'read', sort: true },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'readWrite',
      filter: ['eq'],
    },
  },
  search: { column: 'search' },
});

describe('keyset (SPEC 11.2)', () => {
  it('keys id and each member that filters or sorts by public name, saying which sort', () => {
    type Fields = typeof Contacts.keyset.fields;
    expectTypeOf<keyof Fields>().toEqualTypeOf<
      'id' | 'kind' | 'name' | 'createdAt' | 'organization'
    >();
    expectTypeOf<Fields['id']['sortable']>().toEqualTypeOf<true>();
    expectTypeOf<Fields['name']['sortable']>().toEqualTypeOf<true>();
    expectTypeOf<Fields['kind']['sortable']>().toEqualTypeOf<false>();
    expectTypeOf<Fields['organization']['sortable']>().toEqualTypeOf<false>();
  });

  it('defines a keyset that takes requests in the resource names', () => {
    const keyset = defineKeyset({
      ...Contacts.keyset,
      cursor: { secret: 'a cursor secret of at least thirty-two bytes' },
    });
    type Request = Parameters<typeof keyset.plan>[0];
    expectTypeOf<NonNullable<Request['sort']>[number]>().toEqualTypeOf<
      | 'id'
      | 'name'
      | 'createdAt'
      | '-id'
      | '-name'
      | '-createdAt'
      | {
          readonly field: 'id' | 'name' | 'createdAt';
          readonly direction: 'asc' | 'desc';
        }
    >();
    // @ts-expect-error kind filters but does not sort
    void keyset.plan({ sort: ['kind'] });
  });

  it('defines the same keyset with a server definer, as SPEC 11.2 shows', () => {
    const defineServerKeyset = createDefineKeyset({
      cursor: { secret: 'a cursor secret of at least thirty-two bytes' },
    });
    const keyset = defineServerKeyset(Contacts.keyset);
    type Request = Parameters<typeof keyset.plan>[0];
    type Condition = Extract<
      NonNullable<Request['filter']>,
      { readonly field: unknown }
    >;
    expectTypeOf<Condition['field']>().toEqualTypeOf<
      'id' | 'kind' | 'name' | 'createdAt' | 'organization'
    >();
    expectTypeOf<NonNullable<Request['sort']>[number]>().toEqualTypeOf<
      | 'id'
      | 'name'
      | 'createdAt'
      | '-id'
      | '-name'
      | '-createdAt'
      | {
          readonly field: 'id' | 'name' | 'createdAt';
          readonly direction: 'asc' | 'desc';
        }
    >();
    // @ts-expect-error kind filters but does not sort
    void keyset.plan({ sort: ['kind'] });
  });
});

describe('resource (SPEC 11.1)', () => {
  it('carries the public type and the names of the members', () => {
    expectTypeOf(Contacts.resource.type).toEqualTypeOf<'contacts'>();
    expectTypeOf<(typeof Contacts.resource.attributes)[number]>().toEqualTypeOf<
      'kind' | 'name' | 'alias' | 'website' | 'createdAt'
    >();
    expectTypeOf<
      RelationshipNameOf<typeof Contacts.resource>
    >().toEqualTypeOf<'organization'>();
    expectTypeOf<(typeof Contacts.resource.query.sort)[number]>().toEqualTypeOf<
      'name' | 'createdAt'
    >();
    expectTypeOf<keyof typeof Contacts.resource.query.filter>().toEqualTypeOf<
      'kind' | 'name' | 'organization'
    >();
  });

  it('serializes the public row and validates what the schemas give', () => {
    expectTypeOf<RowOf<typeof Contacts.resource>>().toEqualTypeOf<
      PublicRowOf<typeof Contacts>
    >();
    expectTypeOf<CreateAttributesOf<typeof Contacts.resource>>().toEqualTypeOf<
      Infer<typeof Contacts>['create']
    >();
  });

  it('leaves the attributes of an operation the declaration does not serve open', () => {
    expectTypeOf<UpdateAttributesOf<typeof Contacts.resource>>().toEqualTypeOf<
      Readonly<Record<string, unknown>>
    >();
  });

  it('is wide for a resource typed wide', () => {
    const Wide: DeclaredResource = Contacts;
    expectTypeOf(Wide.resource.type).toEqualTypeOf<string>();
    expectTypeOf<keyof typeof Wide.keyset.fields>().toEqualTypeOf<string>();
  });
});
