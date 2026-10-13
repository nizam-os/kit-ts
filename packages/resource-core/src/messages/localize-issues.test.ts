import type { ResourceIssue } from '../schema/issues';

import { describe, expect, it } from 'vitest';

import { createBan, fromRequest } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';
import { ERROR_CATALOG, parseCreateDocument } from '@nizam-os/jsonapi-core';

import { createDeclareResource } from '../declare/create-declare-resource';
import { errorCatalog } from '../errors/error-catalog';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { defaultMessages } from './default-messages';
import { defineMessages } from './define-messages';
import { localizeErrors } from './localize-errors';
import { localizeIssues } from './localize-issues';

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
    nickname: { access: 'readWrite' },
    email: { access: 'readWrite' },
    website: { access: 'readWrite' },
    kind: { access: 'readWrite' },
    status: { access: 'readWrite' },
    priority: { access: 'readWrite' },
    discount: { access: 'readWrite' },
    tags: { access: 'readWrite' },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
});
const RESOURCES = [Organizations, Contacts] as const;

// What the closures read, as a Paraglide message function reads its locale.
let locale: 'de' | 'en' = 'de';
const inGerman = (german: string, english: string): string =>
  locale === 'de' ? german : english;

const english = defaultMessages(RESOURCES);
const messages = defineMessages(
  RESOURCES,
  {},
  {
    ...english,
    constraints: {
      ...english.constraints,
      check: {
        title: () => inGerman('Ungültiger Wert', 'Invalid value'),
        detail: ({ field }) =>
          inGerman(`${field} verletzt eine Regel.`, `${field} breaks a rule.`),
      },
    },
    validation: {
      required: ({ field }) =>
        inGerman(`${field} ist erforderlich.`, `${field} is required.`),
      type: ({ field, type }) =>
        inGerman(`${field} muss vom Typ ${type} sein.`, `${field}: ${type}.`),
      format: ({ field, format }) =>
        inGerman(
          `${field} muss das Format ${format} haben.`,
          `${field}: ${format}.`,
        ),
      minLength: ({ field, limit }) =>
        inGerman(
          `${field}: mindestens ${limit} Zeichen.`,
          `${field}: ≥ ${limit}.`,
        ),
      maxLength: ({ field, limit }) =>
        inGerman(
          `${field}: höchstens ${limit} Zeichen.`,
          `${field}: ≤ ${limit}.`,
        ),
      minimum: ({ field, limit }) =>
        inGerman(`${field}: mindestens ${limit}.`, `${field} ≥ ${limit}.`),
      maximum: ({ field, limit }) =>
        inGerman(`${field}: höchstens ${limit}.`, `${field} ≤ ${limit}.`),
      exclusiveMinimum: ({ field, limit }) =>
        inGerman(`${field}: mehr als ${limit}.`, `${field} > ${limit}.`),
      exclusiveMaximum: ({ field, limit }) =>
        inGerman(`${field}: weniger als ${limit}.`, `${field} < ${limit}.`),
      multipleOf: ({ field, limit }) =>
        inGerman(`${field}: Vielfaches von ${limit}.`, `${field} × ${limit}.`),
      enum: ({ field, values }) =>
        inGerman(`${field}: erlaubt sind ${values}.`, `${field}: ${values}.`),
      pattern: ({ field }) =>
        inGerman(`${field} hat nicht die erwartete Form.`, `${field}: form.`),
      additionalProperties: ({ field }) =>
        inGerman(`${field} ist unbekannt.`, `${field}: unknown.`),
    },
    fields: {
      ...english.fields,
      contacts: {
        ...english.fields.contacts,
        name: () => inGerman('Name', 'Name'),
        nickname: () => inGerman('Spitzname', 'Nickname'),
        website: () => inGerman('Webseite', 'Website'),
        kind: () => inGerman('Art', 'Kind'),
        priority: () => inGerman('Priorität', 'Priority'),
        discount: () => inGerman('Rabatt', 'Discount'),
        email: () => inGerman('E-Mail', 'Email'),
      },
    },
    options: {
      ...english.options,
      contacts: {
        ...english.options.contacts,
        kind: {
          person: () => inGerman('Person', 'Person'),
          company: () => inGerman('Firma', 'Company'),
        },
      },
    },
  },
);

const ban = createBan({
  errors: { ...ERROR_CATALOG, ...errorCatalog(RESOURCES) },
  format: jsonApi({ mixedEntries: true, includeId: false }),
});
const REQUEST = fromRequest(new Request('https://api.test/contacts'));

/** The details of the document the server answers for `thrown`, localized for `type`. */
async function served(thrown: unknown, type: string): Promise<Array<string>> {
  const handle = ban.handler({
    transform: localizeErrors(messages, { resource: () => type }),
  });
  const body: unknown = await (await handle(thrown, REQUEST, null)).json();
  const { errors } = body as { errors: Array<{ detail: string }> };
  return errors.map(({ detail }) => detail);
}

/** What jsonapi-core's parser throws for a create of `attributes`. */
async function refusal(attributes: Record<string, unknown>): Promise<unknown> {
  try {
    await parseCreateDocument(Contacts.resource, {
      data: { type: 'contacts', attributes },
    });
  } catch (error) {
    return error;
  }
  throw new Error('the create was accepted');
}

function issuesOf(
  validator: (typeof Contacts)['write']['create'],
  input: unknown,
): ReadonlyArray<ResourceIssue> {
  const result = validator['~standard'].validate(input);
  return result.issues ?? [];
}

const text = localizeIssues(messages);

describe('localizeIssues (SPEC 10.5)', () => {
  it("gives each attribute's issue the detail the server answers for the same value", async () => {
    const attributes = {
      name: 'x'.repeat(201),
      nickname: '',
      website: 'http://example.com',
      kind: 'robot',
      status: 'pending',
      priority: 9,
      discount: '1.005',
      email: 'ada.example.com',
      tags: 'vip',
    };
    const issues = issuesOf(Contacts.write.create, {
      attributes,
      relationships: {},
    });
    const texts = issues.map((issue) => text('contacts', issue));
    expect(texts).toStrictEqual(
      await served(await refusal(attributes), 'contacts'),
    );
    expect(texts).toStrictEqual([
      'Name: höchstens 200 Zeichen.',
      'Spitzname: mindestens 1 Zeichen.',
      'E-Mail verletzt eine Regel.',
      'Webseite hat nicht die erwartete Form.',
      'Art: erlaubt sind Person, Firma.',
      'Status: erlaubt sind active, archived.',
      'Priorität: höchstens 5.',
      'Rabatt: Vielfaches von 0.01.',
      'Tags muss vom Typ array sein.',
    ]);
  });

  it('reads a missing member and a wrong JSON type as the server does', async () => {
    const attributes = { priority: 'high' };
    const issues = issuesOf(Contacts.write.create, {
      attributes,
      relationships: {},
    });
    const texts = issues.map((issue) => text('contacts', issue));
    expect(texts).toStrictEqual(
      await served(await refusal(attributes), 'contacts'),
    );
    expect(texts).toContain('Name ist erforderlich.');
    expect(texts).toContain('Priorität muss vom Typ integer sein.');
  });

  it('computes each text when it is called, in the locale of that moment', () => {
    const [issue] = issuesOf(Contacts.write.create, {
      attributes: { name: '' },
      relationships: {},
    });
    expect(issue).toBeDefined();
    if (issue === undefined) {
      return;
    }
    locale = 'en';
    try {
      expect(text('contacts', issue)).toBe('Name: ≥ 1.');
    } finally {
      locale = 'de';
    }
    expect(text('contacts', issue)).toBe('Name: mindestens 1 Zeichen.');
  });

  it("names no member for a type the messages do not label, and falls back to VALIDATION_FAILED's detail for a code they do not derive", () => {
    const issue: ResourceIssue = {
      message: 'Must be at most 200 characters.',
      path: ['attributes', 'name'],
      code: 'maxLength',
      expected: '200',
    };
    expect(text('people', issue)).toBe(': höchstens 200 Zeichen.');
    const foreign: ResourceIssue = {
      message: 'Fails a rule.',
      path: ['attributes', 'name'],
      code: 'PEOPLE_NAME_CHECK',
    };
    expect(text('contacts', foreign)).toBe(
      english.errors.VALIDATION_FAILED.detail({ field: 'Name' }),
    );
  });

  it('refuses messages no definer returned', () => {
    expect(() => localizeIssues({ ...messages })).toThrow(
      new TypeError(
        'localizeIssues: messages must be what defineMessages or defaultMessages returned',
      ),
    );
  });
});
