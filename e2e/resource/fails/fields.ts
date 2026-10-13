/**
 * Fields the catalog does not allow (resource SPEC 3.1, 3.3, 3.6, 14). Each
 * `// error:` names a text the diagnostic on the next line must contain.
 */
import { createDeclareResource } from '@nizam-os/resource-core';

import { publicCatalog } from '../fixtures/contacts/public-catalog.ts';
import { declareResource } from '../resources/declare-resource.ts';

declareResource('contacts', {
  operations: ['list', 'get'],
  fields: {
    // error: id is the primary key, which is the resource id
    id: { access: 'read' },
    // error: organization_id is a foreign-key column: declare it under relationships
    organization_id: { access: 'read' },
    // error: search is a tsvector column: name it in search.column
    search: { access: 'read' },
    // error: "fax" is not a column of contacts
    fax: { access: 'read' },
    // error: access: immutable needs the create operation
    kind: { access: 'immutable' },
    // error: "sortable" is not a member of a field declaration
    name: { access: 'read', sortable: true },
  },
});

declareResource('meetings', {
  operations: ['get'],
  fields: {
    // error: type tstzrange has no wire form; name a codec
    during: { access: 'read' },
  },
});

declareResource('meetings', {
  operations: ['get'],
  fields: {
    // error: codec: "money" is not a codec of createDeclareResource
    during: { access: 'read', codec: 'money' },
    // error: codec: codec "timeRange" does not accept type text
    room: { access: 'read', codec: 'timeRange' },
  },
});

/** A definer without validators for the domains' CHECKs. */
const withoutDomains = createDeclareResource({ catalog: publicCatalog });

withoutDomains('contacts', {
  operations: ['create'],
  fields: {
    // error: domain email's CHECK email_check has no rule; give it a validator in createDeclareResource domains
    email: { access: 'immutable' },
    name: { access: 'immutable' },
  },
});
