import type { Catalog } from '@nizam-os/catalog-core';

import type { DeclareResource } from './declare-resource-type';
import type { DeclareContext } from './registries';

import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { defineCodec } from '../codecs/define-codec';
import { defineValidator } from '../codecs/define-validator';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { createDeclareResource } from './create-declare-resource';

declare const fullCatalog: Catalog;

const EMAIL = /^[^@ ]+@[^@ ]+$/u;
/** The `email` domain's CHECK, but refusing `null`, which a nullable domain's columns hold. */
const strictEmail = defineValidator({
  schema: z.string().regex(EMAIL),
  fixtures: { accept: ['ada@example.com'], reject: ['ada'] },
});
/** A codec that carries an email as its two parts: the domain's validators then receive the parts. */
const emailParts = defineCodec({
  types: ['work_email'],
  schema: z.object({ local: z.string(), host: z.string() }),
  fixtures: [{ local: 'ada', host: 'example.com' }],
});
const { email } = contactsCatalog.domains;
/** The unit catalog with `email` NOT NULL, and a `work_email` domain over it. */
const strictCatalog = {
  ...contactsCatalog,
  domains: {
    ...contactsCatalog.domains,
    email: { ...email, nullable: false },
  },
} as const;
const layeredCatalog = {
  ...contactsCatalog,
  domains: {
    ...contactsCatalog.domains,
    work_email: {
      ...email,
      name: 'work_email',
      type: 'email',
      typeKind: 'domain',
      sqlType: 'email',
      constraints: {},
    },
  },
} as const;

describe('createDeclareResource', () => {
  it('binds declareResource to the catalog and the registries', () => {
    const declareResource = createDeclareResource({
      catalog: contactsCatalog,
      ...TEST_REGISTRIES,
    });
    type Context =
      typeof declareResource extends DeclareResource<infer TContext>
        ? TContext
        : never;
    expectTypeOf<Context['catalog']>().toEqualTypeOf<typeof contactsCatalog>();
    expectTypeOf<
      Context['scopes']['organization']['column']
    >().toEqualTypeOf<'organization_id'>();
    expectTypeOf<keyof Context['codecs']>().toEqualTypeOf<'range' | 'phone'>();
    expectTypeOf<Context>().toExtend<DeclareContext>();
  });

  it('keeps an inline scope column literal', () => {
    const declareResource = createDeclareResource({
      catalog: contactsCatalog,
      scopes: { organization: { column: 'organization_id' } },
    });
    const Contacts = declareResource('contacts', {
      operations: ['get'],
      scope: 'organization',
      fields: { name: { access: 'read' } },
    });
    expectTypeOf(Contacts.declaration.scope).toEqualTypeOf<'organization'>();
  });

  it('takes only codecs and validators their define functions made (SPEC 2)', () => {
    createDeclareResource({
      catalog: contactsCatalog,
      // @ts-expect-error a codec written by hand lacks defineCodec's mark
      codecs: { range: { types: ['tstzrange'] } },
    });
    createDeclareResource({
      catalog: contactsCatalog,
      validators: {
        // @ts-expect-error a validator written by hand lacks defineValidator's mark
        email: {
          schema: TEST_REGISTRIES.validators.email.schema,
          fixtures: TEST_REGISTRIES.validators.email.fixtures,
          description: undefined,
        },
      },
    });
  });

  it('refuses a full catalog, which would reach browsers (ADR 0002)', () => {
    // @ts-expect-error a full catalog carries schemas, expressions, and policies
    createDeclareResource({ catalog: fullCatalog });
  });

  it('checks domains against the catalog and the validators (SPEC 3.6)', () => {
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: TEST_REGISTRIES.validators.email },
      domains: { email: { email_check: { validator: 'email' } } },
    });
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: TEST_REGISTRIES.validators.email },
      domains: {
        // @ts-expect-error phone_number is not a domain of the catalog
        phone_number: { phone_number_check: { validator: 'email' } },
      },
    });
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: TEST_REGISTRIES.validators.email },
      domains: {
        short_text: {
          // @ts-expect-error short_text_check has a rule
          short_text_check: { validator: 'email' },
        },
      },
    });
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: TEST_REGISTRIES.validators.email },
      domains: {
        email: {
          // @ts-expect-error email_format is not a CHECK of the domain
          email_format: { validator: 'email' },
        },
      },
    });
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: TEST_REGISTRIES.validators.email },
      domains: {
        email: {
          // @ts-expect-error email_check has no rule, so it needs a validator
          email_check: { code: 'EMAIL_INVALID' },
        },
      },
    });
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: TEST_REGISTRIES.validators.email },
      domains: {
        email: {
          // @ts-expect-error phone is not a validator
          email_check: { validator: 'phone' },
        },
      },
    });
  });

  it('holds a given domain CHECK code to the code pattern (SPEC 6.4)', () => {
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: TEST_REGISTRIES.validators.email },
      domains: {
        email: { email_check: { validator: 'email', code: 'EMAIL_INVALID' } },
      },
    });
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { email: TEST_REGISTRIES.validators.email },
      domains: {
        email: {
          // @ts-expect-error a code is A-Z, 0-9, and _
          email_check: { validator: 'email', code: 'email invalid' },
        },
      },
    });
  });

  it('takes a code alone for a domain CHECK with a rule (SPEC 3.6)', () => {
    createDeclareResource({
      catalog: contactsCatalog,
      domains: { short_text: { short_text_check: { code: 'NAME_LENGTH' } } },
    });
    createDeclareResource({
      catalog: contactsCatalog,
      domains: {
        short_text: {
          // @ts-expect-error a code is A-Z, 0-9, and _
          short_text_check: { code: 'name length' },
        },
      },
    });
    const declareResource = createDeclareResource({
      catalog: contactsCatalog,
      domains: { short_text: { short_text_check: { code: 'NAME_LENGTH' } } },
    });
    const organizations = declareResource('organizations', {
      operations: ['get', 'update'],
      fields: { name: { access: 'readWrite' } },
    });
    expectTypeOf<keyof typeof organizations.errors>().toEqualTypeOf<
      'NAME_LENGTH' | 'ORGANIZATIONS_NAME_NOT_NULL'
    >();
  });

  it("checks a domain validator's input against the domain's values (SPEC 3.6, 7.2)", () => {
    createDeclareResource({
      catalog: contactsCatalog,
      validators: { strictEmail },
      domains: {
        email: {
          // @ts-expect-error email is nullable, and strictEmail refuses null
          email_check: { validator: 'strictEmail' },
        },
      },
    });
    createDeclareResource({
      catalog: strictCatalog,
      validators: { strictEmail },
      domains: { email: { email_check: { validator: 'strictEmail' } } },
    });
  });

  it('checks a domain validator against the codecs over the domain', () => {
    createDeclareResource({
      catalog: layeredCatalog,
      validators: { email: TEST_REGISTRIES.validators.email },
      domains: { email: { email_check: { validator: 'email' } } },
    });
    createDeclareResource({
      catalog: layeredCatalog,
      codecs: { emailParts },
      validators: { email: TEST_REGISTRIES.validators.email },
      domains: {
        email: {
          // @ts-expect-error a work_email column with emailParts runs email_check on the parts
          email_check: { validator: 'email' },
        },
      },
    });
  });
});
