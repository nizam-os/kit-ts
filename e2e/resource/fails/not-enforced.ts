/**
 * NOT ENFORCED constraints a declaration cannot cover (catalog ADR 0010;
 * resource SPEC 3.5, 9.1): a validator on an unenforced CHECK, and a code
 * on an unenforced CHECK or foreign key, none of which the database ever
 * raises. Each `// error:` names a text the diagnostic on the next line
 * must contain.
 */
import { createDeclareResource } from '@nizam-os/resource-core';

import { publicCatalog } from '../fixtures/postgres18/public-catalog.ts';
import { Owners } from '../resources/imported-contacts.ts';
import { validators } from '../resources/validators.ts';

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  validators,
});

declareResource('imported_contacts', {
  operations: ['create'],
  fields: { name: { access: 'readWrite' }, email: { access: 'readWrite' } },
  rules: {
    // error: validator: PostgreSQL does not enforce this CHECK (NOT ENFORCED), so no validator covers it
    imported_contacts_email_check: { validator: 'lowercase' },
  },
});

declareResource('imported_contacts', {
  operations: ['create'],
  fields: { name: { access: 'readWrite' }, email: { access: 'readWrite' } },
  relationships: {
    owner_id: { target: () => Owners, access: 'readWrite' },
  },
  rules: {
    // error: code: the key has no code, since clients cannot violate it
    imported_contacts_email_check: { code: 'IMPORT_FAILED' },
    // error: code: the key has no code, since clients cannot violate it
    imported_contacts_owner_id_fkey: { code: 'OWNER_MISSING' },
  },
});
