/**
 * A domain CHECK with a rule, renamed by the definer (resource SPEC 3.6),
 * through the built package: the contacts application's `short_text`
 * CHECK, whose rule the schemas enforce, takes the code `NAME_LENGTH`,
 * which the declared resource, `errorCatalog`, and `constraintError` give
 * for PostgreSQL's real refusal of an empty name, on PGlite and on the
 * server `RESOURCE_PG_URL` names. The definer still refuses a validator
 * there, and a CHECK without a rule still needs one.
 */
import type { OracleDatabase } from './support/oracle-database.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDeclareResource, errorCatalog } from '@nizam-os/resource-core';
import { constraintError } from '@nizam-os/resource-core/server';

import { publicCatalog } from './fixtures/contacts/public-catalog.ts';
import { scopes } from './resources/declare-resource.ts';
import { validators } from './resources/validators.ts';
import { CONTACTS_SCHEMA, liveDatabases } from './support/oracle-database.ts';
import { typeErrorOf } from './support/untyped.ts';

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  validators,
  scopes,
  domains: {
    email: { email_check: { validator: 'email' } },
    handle: { handle_check: { validator: 'lowercase' } },
    short_text: { short_text_check: { code: 'NAME_LENGTH' } },
  },
});

const Organizations = declareResource('organizations', {
  operations: ['get', 'create'],
  fields: { name: { access: 'readWrite' }, slug: { access: 'immutable' } },
});

/** The definer as JavaScript calls it: no type checks the configuration. */
function untypedDefiner(domains: unknown): unknown {
  return Reflect.apply(createDeclareResource, undefined, [
    { catalog: publicCatalog, validators, domains },
  ]);
}

describe('a domain CHECK with a rule renamed by the definer', () => {
  it('takes the code in the declared resource and the error catalog', () => {
    expect(Object.keys(Organizations.errors)).toContain('NAME_LENGTH');
    expect(Object.keys(Organizations.errors)).not.toContain('SHORT_TEXT_CHECK');
    expect(errorCatalog([Organizations])).toHaveProperty('NAME_LENGTH');
  });

  it('refuses a validator on that CHECK, and a code alone on a CHECK without a rule', () => {
    expect(
      typeErrorOf(() =>
        untypedDefiner({
          short_text: { short_text_check: { validator: 'email' } },
        }),
      ),
    ).toBe(
      'createDeclareResource.domains.short_text.short_text_check.validator: the CHECK has a rule, which enforces it already',
    );
    expect(
      typeErrorOf(() =>
        untypedDefiner({ email: { email_check: { code: 'EMAIL_INVALID' } } }),
      ),
    ).toBe(
      'createDeclareResource.domains.email.email_check.validator: a CHECK without a rule needs a validator',
    );
  });
});

for (const [name, open] of liveDatabases(CONTACTS_SCHEMA)) {
  describe(`what ${name} refuses`, () => {
    let database: OracleDatabase;

    beforeAll(async () => {
      database = await open();
    });

    afterAll(async () => {
      await database.close();
    });

    it("gives the code to the CHECK's refusal of an empty name", async () => {
      let refusal: unknown;
      try {
        await database.query(
          "insert into organizations (name, slug) values ('', 'other')",
        );
      } catch (error) {
        refusal = error;
      }
      expect(refusal).toMatchObject({
        code: '23514',
        constraint: 'short_text_check',
        dataType: 'short_text',
      });
      const error = constraintError(refusal, {
        resource: Organizations,
        operation: 'create',
      });
      expect(error?.code).toBe('NAME_LENGTH');
      expect(error?.status).toBe(422);
      expect(error?.errors?.map(({ path }) => path?.join('/'))).toEqual([
        'data/attributes/name',
      ]);
    });
  });
}
