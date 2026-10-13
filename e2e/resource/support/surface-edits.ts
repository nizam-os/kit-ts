/**
 * The two versions of the contacts declaration the surface tests compare
 * (resource SPEC 13.2, catalog SPEC 10.4), as an application edits it
 * between releases: `remove` withdrawn, `nickname` made read-only, `email`
 * filtered with `in` too, and `priority` no longer sortable. A registry of
 * each version, with the organizations its relationship targets.
 */
import type { DeclaredResource } from '@nizam-os/resource-core';

import { Contacts } from '../resources/contacts.ts';
import { declareResource } from '../resources/declare-resource.ts';
import { Organizations } from '../resources/organizations.ts';

const { fields } = Contacts.declaration;

const EditedContacts = declareResource('contacts', {
  ...Contacts.declaration,
  operations: ['list', 'get', 'create', 'update'],
  fields: {
    ...fields,
    nickname: { access: 'read' },
    email: { access: 'readWrite', filter: ['eq', 'in'] },
    priority: { access: 'readWrite', filter: ['gte', 'lte'] },
  },
});

/** The registry before the edits. */
export const BEFORE: ReadonlyArray<DeclaredResource> = [
  Organizations,
  Contacts,
];

/** The registry after them. */
export const AFTER: ReadonlyArray<DeclaredResource> = [
  Organizations,
  EditedContacts,
];
