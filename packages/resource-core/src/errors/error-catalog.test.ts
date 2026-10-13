import { describe, expect, it } from 'vitest';

import { createBan } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';
import { ERROR_CATALOG } from '@nizam-os/jsonapi-core';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import {
  Contacts,
  declare,
  Meetings,
  Organizations,
} from '../test-support/registry';
import { errorCatalog } from './error-catalog';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});

const TypedOrganizations = declareResource('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const TypedContacts = declareResource('contacts', {
  operations: ['get', 'create'],
  scope: 'organization',
  fields: { name: { access: 'readWrite' }, email: { access: 'readWrite' } },
  relationships: {
    organization_id: { target: () => TypedOrganizations, access: 'read' },
  },
});

const APP_ERRORS = {
  SEAT_LIMIT: {
    status: 402,
    title: 'Seat Limit',
    description: 'The plan has no seat left.',
  },
} as const;

const RESOURCES = [Organizations, Contacts, Meetings];

describe('errorCatalog (SPEC 9.2)', () => {
  it("merges every resource's codes, QUOTA_EXCEEDED, and the application's codes, in that order", () => {
    const catalog = errorCatalog(RESOURCES, APP_ERRORS);
    const derived = RESOURCES.flatMap((resource) =>
      Object.keys(resource.errors),
    );
    expect(Object.keys(catalog)).toEqual([
      ...new Set(derived),
      'QUOTA_EXCEEDED',
      'SEAT_LIMIT',
    ]);
    expect(catalog['CONTACTS_EMAIL_UNIQUE']).toStrictEqual({
      status: 409,
      title: 'Conflict',
    });
    expect(catalog['MEETINGS_CONTACT_ID_FKEY']).toStrictEqual({
      status: 404,
      title: 'Related Resource Not Found',
    });
    expect(catalog['QUOTA_EXCEEDED']).toStrictEqual({
      status: 403,
      title: 'Quota Exceeded',
    });
    expect(catalog['SEAT_LIMIT']).toBe(APP_ERRORS.SEAT_LIMIT);
  });

  it('holds a code that two resources derive from one domain once', () => {
    expect(Object.keys(Contacts.errors)).toContain('EMAIL_CHECK');
    expect(Object.keys(Meetings.errors)).toContain('EMAIL_CHECK');
    const catalog = errorCatalog(RESOURCES);
    expect(catalog['EMAIL_CHECK']).toStrictEqual({
      status: 422,
      title: 'Invalid Attribute',
    });
  });

  it('holds the codes two resources over one table derive once', () => {
    const People = declare('contacts', {
      as: 'people',
      operations: ['get'],
      fields: { email: { access: 'read' } },
    });
    const catalog = errorCatalog([Organizations, Contacts, People]);
    expect(Object.keys(catalog)).toEqual([
      ...new Set([
        ...Object.keys(Organizations.errors),
        ...Object.keys(Contacts.errors),
      ]),
      'QUOTA_EXCEEDED',
    ]);
  });

  it('gives QUOTA_EXCEEDED alone for no resources and no application codes', () => {
    expect(errorCatalog([])).toStrictEqual({
      QUOTA_EXCEEDED: { status: 403, title: 'Quota Exceeded' },
    });
  });

  it('freezes the catalog and each derived entry', () => {
    const catalog = errorCatalog(RESOURCES);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog['CONTACTS_EMAIL_UNIQUE'])).toBe(true);
    expect(Object.isFrozen(catalog['QUOTA_EXCEEDED'])).toBe(true);
  });

  it('spreads into createBan next to ERROR_CATALOG, so each code renders as a JSON:API error', () => {
    const ban = createBan({
      format: jsonApi(),
      id: () => 'e1',
      errors: {
        ...ERROR_CATALOG,
        ...errorCatalog([TypedOrganizations, TypedContacts], APP_ERRORS),
      },
    });
    const detail = 'Another record already has this value.';
    const rendered = ban.render(ban.error('CONTACTS_EMAIL_UNIQUE', { detail }));
    expect(rendered.status).toBe(409);
    expect(rendered.body).toStrictEqual({
      errors: [
        {
          id: 'e1',
          status: '409',
          code: 'CONTACTS_EMAIL_UNIQUE',
          title: 'Conflict',
          detail,
        },
      ],
    });
    expect(ban.render(ban.error('QUOTA_EXCEEDED')).status).toBe(403);
    expect(ban.render(ban.error('SEAT_LIMIT')).status).toBe(402);
    expect(ban.render(ban.error('INVALID_DOCUMENT')).status).toBe(400);
  });
});
