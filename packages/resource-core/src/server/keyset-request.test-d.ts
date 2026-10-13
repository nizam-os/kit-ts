/**
 * The type of `keysetRequest` (SPEC 11.2): the request follows the
 * declaration, so it is what `plan` takes of the keyset the server defines
 * from the declared resource, and what a storage adapter's `list` takes.
 */
import type { DeclaredResource } from '../declare/declared-resource';
import type { StorageListRequest } from './storage';

import { describe, expectTypeOf, it } from 'vitest';

import { parseQuery } from '@nizam-os/jsonapi-core';
import { createDefineKeyset } from '@nizam-os/keyset-core';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { keysetRequest } from './keyset-request';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});

const Organizations = declareResource('organizations', {
  operations: ['list', 'get'],
  fields: {
    name: { access: 'read', sort: true },
    seats: { access: 'read', filter: ['gte'] },
  },
});

const Contacts = declareResource('contacts', {
  operations: ['list', 'get'],
  fields: {
    kind: { access: 'read', filter: ['eq', 'in'] },
    name: { access: 'read', filter: ['eq'], sort: true },
    created_at: { access: 'read', sort: true },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'read',
      filter: ['eq'],
    },
  },
});

const defineKeyset = createDefineKeyset({
  cursor: { secret: 'a cursor secret of at least thirty-two bytes' },
});
const contacts = defineKeyset(Contacts.keyset);
const request = keysetRequest(Contacts, parseQuery(Contacts.resource, ''));

describe('keysetRequest (SPEC 11.2)', () => {
  it('gives what plan takes of the keyset defined from the declared resource', () => {
    expectTypeOf(request).toEqualTypeOf<Parameters<typeof contacts.plan>[0]>();
  });

  it('names the declared sorts and filters', () => {
    type Condition = Extract<
      NonNullable<typeof request.filter>,
      { readonly field: unknown }
    >;
    expectTypeOf<Condition['field']>().toEqualTypeOf<
      'id' | 'kind' | 'name' | 'createdAt' | 'organization'
    >();
    expectTypeOf<NonNullable<typeof request.sort>[number]>().toEqualTypeOf<
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
  });

  it("is a storage adapter's list request", () => {
    expectTypeOf(request).toExtend<StorageListRequest>();
  });

  it('refuses a query parsed with a resource whose names it lacks', () => {
    const organizations = parseQuery(Organizations.resource, '');
    // @ts-expect-error seats is no member of contacts
    keysetRequest(Contacts, organizations);
  });

  it('is wide for a resource typed wide', () => {
    const Wide: DeclaredResource = Contacts;
    expectTypeOf(
      keysetRequest(Wide, parseQuery(Wide.resource, '')),
    ).toEqualTypeOf<StorageListRequest>();
  });
});
