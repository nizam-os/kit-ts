/**
 * The unit tests' resources (resource SPEC 20.8), declared over the
 * fixture's public catalog, which `@nizam-os/pg-catalog` extracts from
 * `migrations/` (e2e/resource proves it current): contacts and their
 * organizations, modeled on the contacts application of e2e/resource, and
 * the plans an organization is on, a lookup table keyed by an enum. Between
 * them every filter kind, every wire type, and a relationship whose id has
 * options, a write-only member, and a CHECK across a field and a
 * relationship. Their links are under `/api`, so a client can be made of
 * them. What this module exports is typed wide, as a JavaScript caller
 * hands it; a type test declares its own typed resources over the same
 * catalog. Not published with the package.
 * @packageDocumentation
 */
import type { DeclaredResource } from '@nizam-os/resource-core';

import { createDeclareResource } from '@nizam-os/resource-core';

import { publicCatalog } from './public-catalog';
import { FIXTURE_REGISTRIES } from './registries';

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  ...FIXTURE_REGISTRIES,
  links: { base: '/api' },
});

export const Plans: DeclaredResource = declareResource('plans', {
  operations: ['list', 'get'],
  fields: { seats: { access: 'read' } },
});

export const Organizations: DeclaredResource = declareResource(
  'organizations',
  {
    operations: ['list', 'get', 'create', 'update'],
    fields: {
      name: { access: 'readWrite', filter: ['eq', 'containsi'], sort: true },
      verified: { access: 'readWrite', filter: ['eq'] },
      marketing_opt_in: { access: 'readWrite' },
      open_days: { access: 'readWrite' },
      founded_on: { access: 'readWrite', filter: ['gte', 'lte'], sort: true },
      invite_code: { access: 'write' },
      created_at: { access: 'read', sort: true },
    },
    relationships: {
      plan_id: {
        target: () => Plans,
        access: 'readWrite',
        filter: ['eq', 'in'],
      },
    },
    sort: { default: ['-created_at'] },
    rules: {
      organizations_enterprise_verified: { validator: 'enterpriseVerified' },
    },
  },
);

export const Contacts: DeclaredResource = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  fields: {
    kind: { access: 'immutable', filter: ['eq', 'in'] },
    name: { access: 'readWrite', filter: ['eq', 'startsWithi'], sort: true },
    nickname: { access: 'readWrite' },
    email: { access: 'readWrite', filter: ['eq'] },
    status: { access: 'readWrite', filter: ['eq', 'in'] },
    priority: { access: 'readWrite', filter: ['gte', 'lte'], sort: true },
    discount: { access: 'readWrite', filter: ['gte', 'lte'] },
    lifetime_value: { access: 'readWrite', filter: ['gte'], sort: true },
    score: { access: 'readWrite', filter: ['gte', 'lte'], sort: true },
    tags: { access: 'readWrite', filter: ['contains', 'overlaps'] },
    ratings: { access: 'readWrite' },
    channels: { access: 'readWrite' },
    vip: { access: 'readWrite', filter: ['eq'] },
    birthday: { access: 'readWrite', filter: ['gte', 'lt'] },
    follow_up_at: { access: 'readWrite', filter: ['gte', 'lt'], sort: true },
    details: { access: 'readWrite' },
    created_at: { access: 'read', filter: ['gte', 'lt'], sort: true },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'readWrite',
      filter: ['eq', 'in'],
      include: true,
    },
    referred_by_id: { target: () => Contacts, access: 'readWrite' },
  },
  search: { column: 'search', mode: 'websearch' },
  sort: { default: ['name', { field: 'created_at', direction: 'desc' }] },
  rules: {
    contacts_email_unique: { code: 'CONTACT_EMAIL_TAKEN' },
  },
});

/** Every resource of the tests, as an application lists them for its messages. */
export const RESOURCES: ReadonlyArray<DeclaredResource> = [
  Plans,
  Organizations,
  Contacts,
];
