/**
 * Error codes TypeScript holds to the declarations (resource SPEC 3.8, 9):
 * a code a rule renamed is gone from `errors` and from the ban the catalog
 * builds, and a list that leaves out a relationship's target is refused
 * where it is assembled. Each `// error:` names a text the diagnostic on
 * the next line must contain.
 */
import { createBan } from '@nizam-os/ban-core';
import { ERROR_CATALOG } from '@nizam-os/jsonapi-core';
import { errorCatalog } from '@nizam-os/resource-core';

import { Contacts } from '../resources/contacts.ts';
import { Meetings } from '../resources/meetings.ts';
import { Notes } from '../resources/notes.ts';
import { Organizations } from '../resources/organizations.ts';

const ban = createBan({
  errors: {
    ...ERROR_CATALOG,
    ...errorCatalog([Organizations, Contacts, Meetings, Notes]),
  },
});

// error: Argument of type '"CONTACTS_EMAIL_UNIQUE"' is not assignable to parameter of type
ban.error('CONTACTS_EMAIL_UNIQUE');

// error: Property 'CONTACTS_EMAIL_UNIQUE' does not exist on type
export type Renamed = (typeof Contacts.errors)['CONTACTS_EMAIL_UNIQUE'];

// error: relationship contacts.organization targets organizations, which is not listed
errorCatalog([Contacts]);
