import type { ErrorItem } from '@nizam-os/ban-core';

import { describe, expect, it } from 'vitest';

import { createBan, fromRequest } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';
import { ERROR_CATALOG } from '@nizam-os/jsonapi-core';

import { createDeclareResource } from '../declare/create-declare-resource';
import { errorCatalog } from '../errors/error-catalog';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { defaultMessages } from './default-messages';
import { defineMessages } from './define-messages';
import { localizeErrors } from './localize-errors';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});
const Organizations = declareResource('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});
const Contacts = declareResource('contacts', {
  operations: ['get', 'create'],
  scope: 'organization',
  fields: {
    name: { access: 'readWrite' },
    email: { access: 'readWrite' },
    kind: { access: 'readWrite' },
    status: { access: 'readWrite' },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
});
const RESOURCES = [Organizations, Contacts] as const;
const APP_ERRORS = {
  SEAT_LIMIT: { status: 402, title: 'Seat Limit', code: 'seat_limit_reached' },
} as const;

const english = defaultMessages(RESOURCES, APP_ERRORS);
const german = defineMessages(RESOURCES, APP_ERRORS, {
  ...english,
  errors: {
    ...english.errors,
    VALIDATION_FAILED: {
      title: () => 'Ungültige Eingabe',
      detail: ({ field }) =>
        field === '' ? 'Ein Wert ist ungültig.' : `${field} ist ungültig.`,
    },
    SEAT_LIMIT: {
      title: () => 'Platzlimit',
      detail: () => 'Der Tarif hat keinen freien Platz mehr.',
    },
    CONTACTS_EMAIL_UNIQUE: {
      title: () => 'E-Mail vergeben',
      detail: ({ fields }) => `${fields} gehört schon einem anderen Kontakt.`,
    },
  },
  constraints: {
    ...english.constraints,
    check: {
      title: () => 'Ungültiges Attribut',
      detail: ({ field }) => `${field} verletzt eine Regel.`,
    },
  },
  validation: {
    ...english.validation,
    format: ({ field, format }) => `${field} muss das Format ${format} haben.`,
    maxLength: ({ field, limit }) => `${field}: höchstens ${limit} Zeichen.`,
    enum: ({ field, values }) => `${field}: erlaubt sind ${values}.`,
    additionalProperties: ({ field }) =>
      field === '' ? 'Unbekanntes Feld.' : `${field} ist unbekannt.`,
  },
  fields: {
    organizations: { name: () => 'Name' },
    contacts: {
      name: () => 'Name',
      email: () => 'E-Mail',
      kind: () => 'Art',
      status: () => 'Status',
      organization: () => 'Organisation',
    },
  },
  options: {
    contacts: {
      kind: { person: () => 'Person', company: () => 'Firma' },
      status: { active: () => 'aktiv', archived: () => 'archiviert' },
    },
  },
});

const ban = createBan({
  errors: { ...ERROR_CATALOG, ...errorCatalog(RESOURCES, APP_ERRORS) },
  format: jsonApi({ mixedEntries: true, includeId: false }),
});
const REQUEST = fromRequest(new Request('https://api.test/contacts'));
const TOO_LONG: ErrorItem = {
  detail: 'Must be at most 200 characters.',
  path: ['data', 'attributes', 'name'],
  reason: 'maxLength',
  expected: '200',
};
const NO_STATUS: ErrorItem = {
  detail: 'Must be one of: active, archived.',
  path: ['data', 'attributes', 'status'],
  reason: 'enum',
  expected: '["active","archived"]',
};
const TAKEN: ErrorItem = {
  detail: 'Another record already has this value.',
  path: ['data', 'attributes', 'email'],
};

async function render(
  thrown: unknown,
  messages = german,
  options: Parameters<typeof ban.handler>[0] = {},
): Promise<unknown> {
  const handle = ban.handler({
    transform: localizeErrors(messages, { resource: () => 'contacts' }),
    ...options,
  });
  const response = await handle(thrown, REQUEST, null);
  return response.json();
}

describe('localizeErrors (SPEC 10.4)', () => {
  it('turns a 422 with two items into the German document', async () => {
    const thrown = ban.error('VALIDATION_FAILED', {
      errors: [TOO_LONG, NO_STATUS],
    });
    expect(await render(thrown)).toStrictEqual({
      errors: [
        {
          status: '422',
          code: 'VALIDATION_FAILED',
          title: 'Ungültige Eingabe',
          detail: 'Name: höchstens 200 Zeichen.',
          source: { pointer: '/data/attributes/name' },
          meta: { code: 'maxLength', expected: '200' },
        },
        {
          status: '422',
          code: 'VALIDATION_FAILED',
          title: 'Ungültige Eingabe',
          detail: 'Status: erlaubt sind aktiv, archiviert.',
          source: { pointer: '/data/attributes/status' },
          meta: { code: 'enum', expected: '["active","archived"]' },
        },
      ],
    });
  });

  it("turns a 409 into the German document, from the code's own texts", async () => {
    const thrown = ban.error('CONTACTS_EMAIL_UNIQUE', { errors: [TAKEN] });
    expect(await render(thrown)).toStrictEqual({
      errors: [
        {
          status: '409',
          code: 'CONTACTS_EMAIL_UNIQUE',
          title: 'E-Mail vergeben',
          detail: 'E-Mail gehört schon einem anderen Kontakt.',
          source: { pointer: '/data/attributes/email' },
        },
      ],
    });
  });

  it("gives a derived code without texts of its own its constraint kind's, and a validator's item its code's", async () => {
    const violated = { detail: 'x', path: ['data', 'attributes', 'name'] };
    const item = { ...violated, reason: 'CONTACTS_NAME_CHECK' };
    const checked = ban.error('CONTACTS_NAME_CHECK', { errors: [violated] });
    const validated = ban.error('VALIDATION_FAILED', { errors: [item] });
    expect(await render(checked)).toMatchObject({
      errors: [
        { title: 'Ungültiges Attribut', detail: 'Name verletzt eine Regel.' },
      ],
    });
    expect(await render(validated)).toMatchObject({
      errors: [
        { title: 'Ungültige Eingabe', detail: 'Name verletzt eine Regel.' },
      ],
    });
  });

  it('names the id, and never a member the type does not have', async () => {
    const id = {
      detail: 'x',
      path: ['data', 'id'],
      reason: 'format',
      expected: 'uuid',
    };
    const unknown = {
      detail: 'x',
      path: ['data', 'attributes', '__proto__'],
      reason: 'additionalProperties',
    };
    const thrown = ban.error('VALIDATION_FAILED', { errors: [id, unknown] });
    expect(await render(thrown)).toMatchObject({
      errors: [
        { detail: 'id muss das Format uuid haben.' },
        { detail: 'Unbekanntes Feld.' },
      ],
    });
  });

  it("localizes an oversized body's one object from the error's own code", async () => {
    const thrown = ban.error('VALIDATION_FAILED', {
      errors: [TOO_LONG, NO_STATUS],
    });
    expect(await render(thrown, german, { maxBodyBytes: 300 })).toMatchObject({
      errors: [
        { title: 'Ungültige Eingabe', detail: 'Ein Wert ist ungültig.' },
      ],
    });
  });

  it('maps an application code rendered under another name to its key', async () => {
    expect(await render(ban.error('SEAT_LIMIT'))).toMatchObject({
      errors: [
        {
          code: 'seat_limit_reached',
          title: 'Platzlimit',
          detail: 'Der Tarif hat keinen freien Platz mehr.',
        },
      ],
    });
  });

  it('reads as before with the English defaults', async () => {
    const thrown = ban.error('VALIDATION_FAILED', {
      errors: [TOO_LONG, NO_STATUS],
    });
    expect(await render(thrown, english)).toMatchObject({
      errors: [
        { title: 'Validation Failed', detail: TOO_LONG.detail },
        { title: 'Validation Failed', detail: NO_STATUS.detail },
      ],
    });
  });
});

describe('localizeErrors: what it leaves alone', () => {
  const transform = localizeErrors(german);
  const error = ban.error('NOT_FOUND');

  it('passes a body of another shape through as it is', () => {
    const problem = {
      type: 'about:blank',
      status: 404,
      title: 'Not Found',
      errors: [],
    };
    expect(transform(problem, error, null)).toBe(problem);
    expect(transform('text', error, null)).toBe('text');
  });

  it('changes only title and detail, of objects with a code it has texts for, on a copy', () => {
    const object = {
      id: 'e1',
      links: { about: 'https://docs.test/e1' },
      status: '404',
      code: 'NOT_FOUND',
      title: 'Not Found',
      source: { parameter: 'filter' },
      meta: { traceId: 't' },
    };
    const body = {
      jsonapi: { version: '1.1' },
      errors: [object, 'odd', { code: 'ADHOC' }],
    };
    const localized = transform(body, error, null);
    expect(localized).toStrictEqual({
      ...body,
      errors: [
        {
          ...object,
          title: 'Not Found',
          detail: 'The resource does not exist.',
        },
        'odd',
        { code: 'ADHOC' },
      ],
    });
    expect(body.errors[0]).toBe(object);
    expect(object).not.toHaveProperty('detail');
  });

  it('refuses messages no definer returned, and a resource that is not a function', () => {
    expect(() => localizeErrors({ ...german })).toThrow(TypeError);
    expect(() =>
      localizeErrors(german, { resource: 'contacts' as never }),
    ).toThrow(new TypeError('localizeErrors: resource must be a function'));
  });
});
