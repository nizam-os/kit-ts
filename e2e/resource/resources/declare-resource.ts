/**
 * The application's configured definer (resource SPEC 2): the public
 * catalog `pg-catalog extract` wrote, and the registries every declaration
 * is checked against. `meetings.during` is a tstzrange, so it needs a
 * codec; the validators answer the CHECKs the rule translator does not
 * cover, including the `email` and `handle` domains' own.
 */
import { createDeclareResource } from '@nizam-os/resource-core';

import { publicCatalog } from '../fixtures/contacts/public-catalog.ts';
import { codecs } from './codecs.ts';
import { validators } from './validators.ts';

/** The tenant scope, which the server binds to the actor (`runtime/domain.ts`). */
export const scopes = { organization: { column: 'organization_id' } } as const;

export const declareResource = createDeclareResource({
  catalog: publicCatalog,
  codecs,
  validators,
  scopes,
  domains: {
    email: { email_check: { validator: 'email' } },
    handle: { handle_check: { validator: 'lowercase' } },
  },
  links: { base: '/api' },
  page: { max: 50 },
});
