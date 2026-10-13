/**
 * Contacts imported from another system, over the PostgreSQL 18 schema
 * (`fixtures/postgres18`): their CHECKs and the foreign key to their owner
 * are NOT ENFORCED, beside one enforced CHECK on `score`. The definer names
 * no validator, since none covers an unenforced CHECK (catalog ADR 0010).
 */
import { createDeclareResource } from '@nizam-os/resource-core';

import { publicCatalog } from '../fixtures/postgres18/public-catalog.ts';

const declareResource = createDeclareResource({ catalog: publicCatalog });

export const Owners = declareResource('owners', {
  operations: ['get'],
  fields: {},
});

export const ImportedContacts = declareResource('imported_contacts', {
  operations: ['get', 'create', 'update'],
  fields: {
    name: { access: 'readWrite' },
    nickname: { access: 'readWrite' },
    email: { access: 'readWrite' },
    status: { access: 'readWrite' },
    score: { access: 'readWrite' },
  },
  relationships: {
    owner_id: { target: () => Owners, access: 'readWrite' },
  },
});
