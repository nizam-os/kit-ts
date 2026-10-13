import type { DeclaredResource } from '../declare/declared-resource';
import type { ErrorCatalog } from './error-catalog';

import { describe, expectTypeOf, it } from 'vitest';

import { createBan } from '@nizam-os/ban-core';
import { ERROR_CATALOG } from '@nizam-os/jsonapi-core';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { errorCatalog } from './error-catalog';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});

const Organizations = declareResource('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const Contacts = declareResource('contacts', {
  operations: ['get', 'create'],
  scope: 'organization',
  fields: { name: { access: 'readWrite' }, email: { access: 'readWrite' } },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
});

const Meetings = declareResource('meetings', {
  operations: ['get', 'create'],
  scope: 'organization',
  fields: {
    room: { access: 'readWrite' },
    notes: { access: 'readWrite' },
    attendees: { access: 'readWrite' },
  },
  relationships: {
    contact_id: { target: () => Contacts, access: 'readWrite' },
  },
  rules: {
    meetings_room_check: { validator: 'room' },
    meetings_contact_or_notes: { validator: 'contactOrNotes' },
  },
});

const RESOURCES = [Organizations, Contacts, Meetings] as const;

const APP_ERRORS = {
  SEAT_LIMIT: { status: 402, title: 'Seat Limit' },
} as const;

const catalog = errorCatalog(RESOURCES, APP_ERRORS);

describe('errorCatalog in types (SPEC 9.2)', () => {
  it("keys every resource's codes, QUOTA_EXCEEDED, and the application's codes", () => {
    expectTypeOf<keyof typeof catalog>().toEqualTypeOf<
      | keyof typeof Organizations.errors
      | keyof typeof Contacts.errors
      | keyof typeof Meetings.errors
      | 'QUOTA_EXCEEDED'
      | 'SEAT_LIMIT'
    >();
    expectTypeOf(catalog.CONTACTS_EMAIL_UNIQUE).toEqualTypeOf<{
      readonly status: 409;
      readonly title: 'Conflict';
    }>();
    expectTypeOf(catalog.MEETINGS_CONTACT_ID_FKEY).toEqualTypeOf<{
      readonly status: 404;
      readonly title: 'Related Resource Not Found';
    }>();
    expectTypeOf(catalog.EMAIL_CHECK).toEqualTypeOf<{
      readonly status: 422;
      readonly title: 'Invalid Attribute';
    }>();
    expectTypeOf(catalog.QUOTA_EXCEEDED).toEqualTypeOf<{
      readonly status: 403;
      readonly title: 'Quota Exceeded';
    }>();
    expectTypeOf(catalog.SEAT_LIMIT).toEqualTypeOf<{
      readonly status: 402;
      readonly title: 'Seat Limit';
    }>();
  });

  it('types the codes of a ban built from the catalog, so a misspelled code fails', () => {
    const ban = createBan({ errors: { ...ERROR_CATALOG, ...catalog } });
    expectTypeOf(ban.error).toBeCallableWith('CONTACTS_EMAIL_UNIQUE');
    expectTypeOf(ban.error).toBeCallableWith('QUOTA_EXCEEDED');
    expectTypeOf(ban.error).toBeCallableWith('INVALID_DOCUMENT');
    expectTypeOf(ban.CONTACTS_EMAIL_UNIQUE).toBeFunction();
    // @ts-expect-error a code no resource derives
    ban.error('CONTACTS_EMAIL_UNIQEU');
  });

  it('names its own type, for an exported catalog under isolatedDeclarations', () => {
    const named: ErrorCatalog<typeof RESOURCES, typeof APP_ERRORS> = catalog;
    expectTypeOf(named).toEqualTypeOf(catalog);
  });

  it('takes no application codes', () => {
    expectTypeOf(errorCatalog([Organizations])).toEqualTypeOf<{
      readonly SHORT_TEXT_CHECK: {
        readonly status: 422;
        readonly title: 'Invalid Attribute';
      };
      readonly QUOTA_EXCEEDED: {
        readonly status: 403;
        readonly title: 'Quota Exceeded';
      };
    }>();
  });

  it('takes only declared resources', () => {
    // @ts-expect-error a declaration is not a resource
    expectTypeOf<ErrorCatalog<[typeof Contacts.declaration]>>().toBeObject();
    // @ts-expect-error a declaration is not a resource
    errorCatalog([Contacts.declaration]);
  });

  it('refuses an application entry that is not an error definition', () => {
    // @ts-expect-error a status outside 4xx and 5xx
    errorCatalog(RESOURCES, { MOVED: { status: 301 } });
  });

  it('keys any code for resources whose tables TypeScript does not know', () => {
    expectTypeOf<
      ErrorCatalog<ReadonlyArray<DeclaredResource>>['ANY_CODE']
    >().toEqualTypeOf<{
      readonly status: 422 | 409 | 404;
      readonly title:
        | 'Invalid Attribute'
        | 'Conflict'
        | 'Related Resource Not Found';
    }>();
  });
});
