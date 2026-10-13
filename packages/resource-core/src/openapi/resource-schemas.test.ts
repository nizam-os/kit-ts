import { describe, expect, it } from 'vitest';

import {
  parseCreateDocument,
  parseUpdateDocument,
} from '@nizam-os/jsonapi-core';

import { internalsOf } from '../declare/declared-resource';
import { Contacts, Organizations } from '../test-support/definition-resources';
import { documentValidator } from '../test-support/openapi-document';
import { openapi } from './document';
import { identifierSchema, resourceObjectSchema } from './resource-schemas';

/**
 * The request objects against what a route runs on a body, two-sided:
 * over the structural cases of a create and an update, the document's
 * schema accepts exactly the bodies that `parseCreateDocument` or
 * `parseUpdateDocument` of `@nizam-os/jsonapi-core` parse and the
 * declaration's `write` schema then takes (SPEC 6.2), which holds the
 * relationships' requiredness and nullability. Values are the value
 * schemas' concern (`value-schema-oracle.test.ts`). An update's id that
 * differs from the URL's is the one refusal a schema cannot state.
 */

const MEDIA = 'application/vnd.api+json';
const ADA_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';
const ACME = { type: 'organizations', id: '7' };
const DOCUMENT = openapi([Organizations, Contacts], {
  info: { title: 'Contacts', version: '1' },
});
const schemaAt = documentValidator(DOCUMENT);
const CREATE = schemaAt([
  'paths',
  '/api/contacts',
  'post',
  'requestBody',
  'content',
  MEDIA,
  'schema',
]);
const UPDATE = schemaAt([
  'paths',
  '/api/contacts/{id}',
  'patch',
  'requestBody',
  'content',
  MEDIA,
  'schema',
]);

type Data = Record<string, unknown>;
const document = (data: unknown, extra: Data = {}) => ({ data, ...extra });

const created: Data = {
  type: 'contacts',
  attributes: { name: 'Ada' },
  relationships: { organization: { data: ACME } },
};
const ALL_CREATED = {
  kind: 'person',
  name: 'Ada',
  alias: 'A',
  email: 'ada@example.com',
  status: 'active',
  priority: 2,
  tags: ['math'],
  website: 'https://ada.example',
};
const withAttributes = (base: Data, attributes: Data): Data => ({
  ...base,
  attributes: { ...(base['attributes'] as Data), ...attributes },
});
const withOrganization = (base: Data, organization: unknown): Data => ({
  ...base,
  relationships: { organization },
});

const CREATES: ReadonlyArray<readonly [string, unknown]> = [
  ['the required members', document(created)],
  [
    'every member a create carries',
    document(withAttributes(created, ALL_CREATED)),
  ],
  [
    'a nullable attribute as null',
    document(withAttributes(created, { alias: null })),
  ],
  [
    'a non-nullable attribute as null',
    document(withAttributes(created, { name: null })),
  ],
  [
    'no required attribute',
    document({ ...created, attributes: { kind: 'person' } }),
  ],
  [
    'no attributes',
    document({ type: 'contacts', relationships: created['relationships'] }),
  ],
  [
    'no relationships',
    document({ type: 'contacts', attributes: { name: 'Ada' } }),
  ],
  [
    'a read attribute',
    document(
      withAttributes(created, { createdAt: '2026-10-10T12:00:00.000Z' }),
    ),
  ],
  ['an unknown attribute', document(withAttributes(created, { fax: '1' }))],
  ['an @-member attribute', document(withAttributes(created, { '@note': 1 }))],
  ['an @-member on the resource object', document({ ...created, '@note': 1 })],
  ['an id without client ids', document({ ...created, id: ADA_ID })],
  ['another type', document({ ...created, type: 'organizations' })],
  [
    'a null required relationship',
    document(withOrganization(created, { data: null })),
  ],
  [
    'linkage of another type',
    document(withOrganization(created, { data: { type: 'people', id: '7' } })),
  ],
  [
    'linkage with a number id',
    document(
      withOrganization(created, { data: { type: 'organizations', id: 7 } }),
    ),
  ],
  ['linkage without data', document(withOrganization(created, ACME))],
  [
    'a relationship with meta',
    document(withOrganization(created, { data: ACME, meta: { a: 1 } })),
  ],
  [
    'a relationship with links',
    document(withOrganization(created, { data: ACME, links: { self: '/x' } })),
  ],
  [
    'an unknown relationship',
    document({
      ...created,
      relationships: { organization: { data: ACME }, owner: { data: null } },
    }),
  ],
  [
    'links and meta on the resource object',
    document({ ...created, links: { self: '/x' }, meta: { a: 1 } }),
  ],
  [
    'an unknown member on the resource object',
    document({ ...created, extra: 1 }),
  ],
  [
    'top-level meta and jsonapi',
    document(created, { meta: { a: 1 }, jsonapi: { version: '1.1' } }),
  ],
  ['an unknown top-level member', document(created, { extra: 1 })],
  ['a list as data', document([created])],
  ['null as data', document(null)],
  ['no data', { meta: {} }],
];

const updated: Data = {
  type: 'contacts',
  id: ADA_ID,
  attributes: { name: 'Ada L.' },
};

const UPDATES: ReadonlyArray<readonly [string, unknown]> = [
  ['one attribute', document(updated)],
  ['no members', document({ type: 'contacts', id: ADA_ID })],
  [
    'a write attribute',
    document(withAttributes(updated, { website: 'https://ada.example' })),
  ],
  [
    'an immutable attribute',
    document(withAttributes(updated, { kind: 'person' })),
  ],
  [
    'a read attribute',
    document(
      withAttributes(updated, { createdAt: '2026-10-10T12:00:00.000Z' }),
    ),
  ],
  ['a relationship', document(withOrganization(updated, { data: ACME }))],
  [
    'a null required relationship',
    document(withOrganization(updated, { data: null })),
  ],
  ['no id', document({ type: 'contacts', attributes: { name: 'Ada L.' } })],
  ['an id that is not the key form', document({ ...updated, id: '7' })],
  ['another type', document({ ...updated, type: 'organizations' })],
];

/** Whether a route takes `body`: the parser's object, then the declaration's `write` schema. */
async function accepted(
  side: 'create' | 'update',
  body: unknown,
  id = ADA_ID,
): Promise<boolean> {
  try {
    const parsed =
      side === 'create'
        ? await parseCreateDocument(Contacts.resource, body)
        : await parseUpdateDocument(Contacts.resource, body, id);
    const result = Contacts.write[side]['~standard'].validate({
      attributes: parsed.attributes,
      relationships: parsed.relationships,
    });
    return result.issues === undefined;
  } catch {
    return false;
  }
}

describe('request objects', () => {
  it.each(CREATES)(
    'a create with %s: the schema accepts it exactly when a route does',
    async (_, body) => {
      expect(CREATE(body)).toBe(await accepted('create', body));
    },
  );

  it.each(UPDATES)(
    'an update with %s: the schema accepts it exactly when a route does',
    async (_, body) => {
      expect(UPDATE(body)).toBe(await accepted('update', body));
    },
  );

  it('cannot state that an update names the id of its URL, which the parser refuses with a conflict', async () => {
    const body = document({ ...updated, id: OTHER_ID });
    expect(UPDATE(body)).toBe(true);
    expect(await accepted('update', body)).toBe(false);
    expect(await accepted('update', body, OTHER_ID)).toBe(true);
  });
});

describe('response objects', () => {
  const internals = internalsOf(Contacts);
  if (internals === undefined) {
    throw new Error('not declared');
  }

  it('require no attribute, since a sparse fieldset may leave any out, and stay open to members a server adds', () => {
    const schema = resourceObjectSchema(internals);
    expect(schema['required']).toEqual(['type', 'id']);
    expect(schema).not.toHaveProperty('additionalProperties');
    expect((schema['properties'] as Data)['attributes']).not.toHaveProperty(
      'required',
    );
  });

  it('name a resource by its type and an id in its key form', () => {
    expect(identifierSchema(internals)).toEqual({
      type: 'object',
      properties: {
        type: { const: 'contacts' },
        id: { type: 'string', format: 'uuid' },
        meta: { type: 'object' },
      },
      required: ['type', 'id'],
    });
  });
});
