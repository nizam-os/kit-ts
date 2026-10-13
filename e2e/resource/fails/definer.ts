/**
 * Definer configurations TypeScript refuses (resource SPEC 2, 3.6): a full
 * catalog, domain entries the catalog does not support (an unknown CHECK,
 * a validator on a CHECK with a rule, a CHECK without a rule left without
 * one), and a codec written by hand instead of by `defineCodec`. Each
 * `// error:` names a text the diagnostic on the next line must contain.
 */
import { createDeclareResource } from '@nizam-os/resource-core';

import { catalog } from '../fixtures/contacts/catalog.ts';
import { publicCatalog } from '../fixtures/contacts/public-catalog.ts';
import { codecs } from '../resources/codecs.ts';
import { validators } from '../resources/validators.ts';

createDeclareResource({
  // error: catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers
  catalog,
});

createDeclareResource({
  catalog: publicCatalog,
  validators,
  domains: {
    // error: "phone" is not a domain of the public catalog
    phone: { phone_check: { validator: 'email' } },
  },
});

createDeclareResource({
  catalog: publicCatalog,
  validators,
  domains: {
    email: {
      // error: email_format is not a CHECK of domain email
      email_format: { validator: 'email' },
    },
  },
});

createDeclareResource({
  catalog: publicCatalog,
  validators,
  domains: {
    short_text: {
      // error: validator: the CHECK has a rule, which enforces it already
      short_text_check: { validator: 'email' },
    },
  },
});

createDeclareResource({
  catalog: publicCatalog,
  validators,
  domains: {
    email: {
      // error: validator: a CHECK without a rule needs a validator
      email_check: { code: 'EMAIL_INVALID' },
    },
  },
});

createDeclareResource({
  catalog: publicCatalog,
  codecs: {
    // error: Property '[madeByDefineCodec]' is missing
    timeRange: {
      types: ['tstzrange'],
      schema: codecs.timeRange.schema,
      fixtures: codecs.timeRange.fixtures,
      description: undefined,
    },
  },
});
