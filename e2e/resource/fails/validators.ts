import { z } from 'zod';

/**
 * Validators whose input does not take what they receive (resource SPEC
 * 3.6, 7.2, 14): a CHECK's validator must accept the member's value, `null`
 * included where the column is nullable, a relationship as its id, and a
 * CHECK over several members as an object of them by public name; a domain
 * validator must accept every value of the domain, and a domain CHECK's
 * code must be a code. Each `// error:` names a text the diagnostic on the
 * next line must contain.
 */
import {
  createDeclareResource,
  defineValidator,
} from '@nizam-os/resource-core';

import { publicCatalog } from '../fixtures/contacts/public-catalog.ts';
import { codecs } from '../resources/codecs.ts';
import { Contacts } from '../resources/contacts.ts';
import { validators } from '../resources/validators.ts';

const narrow = {
  ...validators,
  // Takes two rooms, though room holds any text.
  lobbyOnly: defineValidator({
    schema: z.enum(['lobby', 'hall']).refine((room) => room === 'lobby'),
    fixtures: { accept: ['lobby'], reject: ['hall'] },
  }),
  // Takes the contact as a linkage, though the relationship enters as its id.
  linkageOrNotes: defineValidator({
    schema: z
      .object({
        contact: z
          .object({ type: z.literal('contacts'), id: z.uuid() })
          .nullable(),
        notes: z.string().nullable(),
      })
      .refine(({ contact, notes }) => contact !== null || notes !== null),
    fixtures: {
      accept: [{ contact: null, notes: 'Agenda' }],
      reject: [{ contact: null, notes: null }],
    },
  }),
  // Refuses null, which a column of the nullable email domain holds.
  presentEmail: defineValidator({
    schema: z.string().regex(/^[^@ ]+@[^@ ]+$/u),
    fixtures: { accept: ['ada@example.com'], reject: ['ada'] },
  }),
};

createDeclareResource({
  catalog: publicCatalog,
  validators: narrow,
  domains: {
    email: {
      // error: validator: "presentEmail" does not accept every value of domain email
      email_check: { validator: 'presentEmail' },
    },
    handle: {
      // error: code: "Handle" is not A-Z, 0-9, _
      handle_check: { validator: 'lowercase', code: 'Handle' },
    },
  },
});

const declareNarrow = createDeclareResource({
  catalog: publicCatalog,
  codecs,
  validators: narrow,
  scopes: { organization: { column: 'organization_id' } },
  domains: {
    email: { email_check: { validator: 'email' } },
    handle: { handle_check: { validator: 'lowercase' } },
  },
});

declareNarrow('meetings', {
  operations: ['create'],
  fields: { room: { access: 'immutable' }, notes: { access: 'immutable' } },
  relationships: {
    contact_id: { target: () => Contacts, access: 'immutable' },
  },
  rules: {
    // error: validator: "lobbyOnly" does not accept every value of room
    meetings_room_lowercase: { validator: 'lobbyOnly' },
    // error: validator: "linkageOrNotes" does not accept every object of contact, notes
    meetings_contact_or_notes: { validator: 'linkageOrNotes' },
  },
});
