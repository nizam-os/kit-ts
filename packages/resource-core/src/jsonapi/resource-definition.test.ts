import type { AnyResource } from '@nizam-os/jsonapi-core';

import { describe, expect, it } from 'vitest';

import { createDefineResource } from '@nizam-os/jsonapi-core';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import {
  Contacts,
  DEFINER_LINKS,
  Organizations,
} from '../test-support/definition-resources';

const ATTRIBUTES = [
  'kind',
  'name',
  'alias',
  'email',
  'status',
  'priority',
  'tags',
  'website',
  'createdAt',
] as const;

/** The contacts declaration's JSON:API definition, written by hand from SPEC 11.1. */
const CONTACTS_RESOURCE = createDefineResource({ links: DEFINER_LINKS })({
  type: 'contacts',
  attributes: ATTRIBUTES,
  relationships: {
    organization: {
      type: 'organizations',
      cardinality: 'one',
      resource: () => Organizations.resource,
    },
  },
  serialize: (row: { readonly id: string }) => ({ id: row.id }),
  query: {
    sort: ['name', 'priority', 'createdAt'],
    filter: {
      kind: ['eq', 'in'],
      name: ['eq', 'startsWithi'],
      alias: ['isNull'],
      email: ['eqi'],
      status: ['in'],
      tags: ['contains'],
      createdAt: ['gte', 'lt'],
      organization: ['eq', 'in'],
    },
    include: ['organization'],
    page: { default: 25, max: 50, range: false },
    search: 'filter[q]',
  },
  // `createdAt` is read-only and `kind` immutable (SPEC 3.1, 9.4).
  writable: {
    create: [
      'kind',
      'name',
      'alias',
      'email',
      'status',
      'priority',
      'tags',
      'website',
      'organization',
    ],
    update: [
      'name',
      'alias',
      'email',
      'status',
      'priority',
      'tags',
      'website',
      'organization',
    ],
  },
  clientIds: false,
});

/** What two definitions must share: everything but the functions, links read through their builders. */
function shape(resource: AnyResource): unknown {
  return {
    type: resource.type,
    attributes: resource.attributes,
    fields: resource.fields,
    relationships: Object.fromEntries(
      Object.entries(resource.relationships).map(([name, relationship]) => [
        name,
        { type: relationship.type, cardinality: relationship.cardinality },
      ]),
    ),
    query: resource.query,
    writable: resource.writable,
    clientIds: resource.clientIds,
    self: resource.links.self?.('c1'),
    relationship: resource.links.relationship?.('c1', 'organization'),
  };
}

const ROW = {
  id: 'c1',
  kind: 'person',
  name: 'Ada',
  alias: null,
  email: 'ada@example.com',
  status: 'active',
  priority: 2,
  tags: ['math'],
  createdAt: '2026-10-10T12:00:00.000Z',
  organization: '7',
};

describe('resource (SPEC 11.1)', () => {
  it('equals the definition written by hand for contacts', () => {
    expect(shape(Contacts.resource)).toEqual(shape(CONTACTS_RESOURCE));
    expect(Contacts.resource.relationships['organization']?.resource?.()).toBe(
      Organizations.resource,
    );
  });

  it('carries its client types in types only', () => {
    expect(Object.hasOwn(Contacts.resource, '~types')).toBe(false);
    expect('~types' in Organizations.resource).toBe(false);
  });

  it('writes nothing to a resource whose members are all read-only', () => {
    expect(Organizations.resource.writable).toEqual({
      create: new Set(),
      update: new Set(),
    });
  });

  it('validates the operations the declaration serves, and its ids, with its own validators', () => {
    expect(Contacts.resource.validate).toEqual({
      create: Contacts.validate.create,
      update: Contacts.validate.update,
      id: Contacts.validate.id,
    });
    expect(Organizations.resource.validate).toEqual({
      id: Organizations.validate.id,
    });
  });

  it('serializes the readable fields and the relationship ids of a public row', () => {
    expect(
      Contacts.resource.serialize({ ...ROW, website: 'https://ada.example' }),
    ).toEqual({
      id: 'c1',
      attributes: {
        kind: 'person',
        name: 'Ada',
        alias: null,
        email: 'ada@example.com',
        status: 'active',
        priority: 2,
        tags: ['math'],
        createdAt: '2026-10-10T12:00:00.000Z',
      },
      relationships: { organization: '7' },
    });
  });

  it('leaves out members the row does not hold and a resource without relationships has none', () => {
    expect(Contacts.resource.serialize({ id: 'c1', name: 'Ada' })).toEqual({
      id: 'c1',
      attributes: { name: 'Ada' },
      relationships: {},
    });
    expect(
      Organizations.resource.serialize({ id: '7', name: 'Analytical Engines' }),
    ).toEqual({ id: '7', attributes: { name: 'Analytical Engines' } });
  });

  it('gives a resource without fields no attributes', () => {
    const declare = createDeclareResource({
      catalog: contactsCatalog,
      ...TEST_REGISTRIES,
    });
    const Teams = declare('teams', { operations: ['get'], fields: {} });
    expect(Teams.resource.serialize({ id: 't1' })).toEqual({
      id: 't1',
    });
  });

  it('refuses a relationship that is not a target id or null, without its value', () => {
    expect(() =>
      Contacts.resource.serialize({ ...ROW, organization: 7 }),
    ).toThrow(
      new TypeError(
        'contacts.serialize: relationship "organization" must be a target id or null',
      ),
    );
  });

  it('is built once, on first read', () => {
    expect(Contacts.resource).toBe(Contacts.resource);
  });

  it('takes the definer links, and none without them', () => {
    const declare = createDeclareResource({
      catalog: contactsCatalog,
      ...TEST_REGISTRIES,
    });
    const Teams = declare('teams', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    expect(Teams.resource.links).toEqual({});
    expect(Teams.resource.query.page).toEqual({
      default: 20,
      max: 100,
      range: false,
    });
    expect(Teams.resource.query.search).toBeUndefined();
  });
});
