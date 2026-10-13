import type { SortInput } from '@nizam-os/keyset-core';

import type { DeclaredResource } from './declared-resource';
import type { Operation } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { createDeclareResource } from './create-declare-resource';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
  links: { base: '/api/v1' },
});

describe('declareResource: valid declarations', () => {
  it('keeps the table and the literal declaration', () => {
    const Organizations = declareResource('organizations', {
      operations: ['list', 'get'],
      fields: {
        name: { access: 'read' },
        slug: { access: 'read', sort: true },
      },
      sort: { default: ['-slug'] },
    });
    expectTypeOf(Organizations.table).toEqualTypeOf<'organizations'>();
    expectTypeOf(
      Organizations.declaration.fields.slug.sort,
    ).toEqualTypeOf<true>();
    expectTypeOf(Organizations).toExtend<DeclaredResource>();
  });

  it('accepts clientIds on a primary key that takes a client value (SPEC 3.4)', () => {
    const Contacts = declareResource('contacts', {
      operations: ['create'],
      clientIds: true,
      fields: { name: { access: 'immutable' } },
    });
    const Meetings = declareResource('meetings', {
      operations: ['get'],
      clientIds: true,
      fields: {},
    });
    expectTypeOf(Contacts.declaration.clientIds).toEqualTypeOf<true>();
    expectTypeOf(Meetings.declaration.clientIds).toEqualTypeOf<true>();
  });

  it('leaves lists typed only by their element type to the runtime checks', () => {
    const operations: ReadonlyArray<Operation> = ['list', 'get'];
    const sortDefault: ReadonlyArray<SortInput> = ['-name'];
    const Contacts = declareResource('contacts', {
      operations,
      fields: { name: { access: 'read', sort: true } },
      sort: { default: sortDefault },
    });
    expectTypeOf(Contacts.declaration.operations).toEqualTypeOf<
      ReadonlyArray<Operation>
    >();
  });

  it('accepts every member a column allows', () => {
    const Contacts = declareResource('contacts', {
      operations: ['list', 'get', 'create', 'update', 'remove'],
      scope: 'organization',
      fields: {
        kind: { access: 'immutable', filter: ['eq', 'in'] },
        name: { access: 'readWrite', sort: true, description: 'Display name' },
        email: { access: 'readWrite' },
        website: { access: 'readWrite', codec: 'phone' },
        created_at: { access: 'read', sort: true },
      },
      relationships: {
        organization_id: { target: () => Organizations, access: 'read' },
      },
      search: { column: 'search', mode: 'plain' },
      sort: { default: ['-created_at', { field: 'name', direction: 'asc' }] },
      page: { default: 10, max: 50 },
      rules: {
        contacts_email_unique: { code: 'CONTACT_EMAIL_TAKEN' },
        contacts_name_not_null: { code: 'CONTACT_NAME_REQUIRED' },
      },
    });
    const Organizations = declareResource('organizations', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    expectTypeOf(Contacts.declaration.scope).toEqualTypeOf<'organization'>();
  });

  it('lets declarations name each other, and themselves, as targets (SPEC 3.8)', () => {
    const Teams = declareResource('teams', {
      operations: ['get', 'update'],
      fields: { name: { access: 'readWrite' } },
      relationships: { lead_id: { target: () => People, access: 'readWrite' } },
    });
    const People = declareResource('people', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
      relationships: { team_id: { target: () => Teams, access: 'read' } },
    });
    const Meetings = declareResource('meetings', {
      operations: ['get'],
      fields: { room: { access: 'read' } },
      relationships: {
        follow_up_of_id: { target: () => Meetings, access: 'read' },
      },
    });
    type LeadTarget = ReturnType<
      typeof Teams.declaration.relationships.lead_id.target
    >;
    expectTypeOf<LeadTarget['table']>().toEqualTypeOf<'people'>();
    type TeamTarget = ReturnType<
      typeof People.declaration.relationships.team_id.target
    >;
    expectTypeOf<TeamTarget['table']>().toEqualTypeOf<'teams'>();
    expectTypeOf(Meetings.table).toEqualTypeOf<'meetings'>();
  });

  it('treats relationships and rules set to undefined as absent, as the runtime does', () => {
    const Meetings = declareResource('meetings', {
      operations: ['get'],
      fields: { room: { access: 'read' } },
      relationships: undefined,
      rules: undefined,
    });
    expectTypeOf(Meetings.declaration.rules).toEqualTypeOf<undefined>();
  });

  it('accepts a codec on a column without a wire form, and covered CHECKs', () => {
    const Meetings = declareResource('meetings', {
      operations: ['create', 'get'],
      fields: {
        room: { access: 'immutable' },
        during: { access: 'immutable', codec: 'range' },
        notes: { access: 'immutable' },
        attendees: { access: 'immutable' },
        duration_minutes: { access: 'read' },
      },
      relationships: {
        contact_id: { target: () => Contacts, access: 'immutable' },
      },
      rules: {
        meetings_room_check: { validator: 'room' },
        meetings_contact_or_notes: { validator: 'contactOrNotes' },
      },
    });
    const Contacts = declareResource('contacts', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    expectTypeOf(
      Meetings.declaration.fields.during.codec,
    ).toEqualTypeOf<'range'>();
  });
});
