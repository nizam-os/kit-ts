import type { ResourceExamples } from './examples';

import { describe, expect, it } from 'vitest';

import { resourceDocument } from '@nizam-os/jsonapi-core';

import { Contacts, Organizations } from '../test-support/definition-resources';
import { documentValidator } from '../test-support/openapi-document';
import { openapi } from './document';

/**
 * `options.examples` (SPEC 13.1): each example lands on its body and passes
 * the schema the document gives that body, checked with Ajv against the
 * emitted document itself; an example the server would refuse fails the
 * build with its name, path, and issue, never its value; and examples of an
 * unknown type or body fail it too instead of being dropped.
 */

const INFO = { title: 'Contacts', version: '1' };
const MEDIA = 'application/vnd.api+json';
const ADA_ID = '00000000-0000-4000-8000-000000000001';
const ACME = { type: 'organizations', id: '7' };
const SECRET = 'SECRET-'.repeat(40);

const ADA = {
  kind: 'person',
  name: 'Ada',
  alias: null,
  email: 'ada@example.com',
  status: 'active',
  priority: 2,
  tags: ['math'],
  createdAt: '2026-10-10T12:00:00.000Z',
};

const EXAMPLES = {
  contacts: {
    create: {
      ada: {
        summary: 'A person at Acme',
        attributes: { kind: 'person', name: 'Ada', email: 'ada@example.com' },
        relationships: { organization: ACME },
      },
    },
    update: { rename: { id: ADA_ID, attributes: { name: 'Ada L.' } } },
    get: {
      ada: {
        description: 'As the server sends it',
        id: ADA_ID,
        attributes: ADA,
        relationships: { organization: ACME },
      },
    },
  },
  organizations: { get: { acme: { id: '7', attributes: { name: 'Acme' } } } },
} satisfies ResourceExamples;

function documented(examples: ResourceExamples) {
  return openapi([Organizations, Contacts], { info: INFO, examples });
}

type Segments = ReadonlyArray<string>;

/** The media type of a request body or a response, and the examples on it. */
function mediaAt(document: unknown, segments: Segments) {
  let node: unknown = document;
  for (const segment of segments) {
    node = (node as Record<string, unknown>)[segment];
  }
  return node as { examples: Record<string, { value: unknown }> };
}

describe('examples', () => {
  const document = documented(EXAMPLES);
  const schemaAt = documentValidator(document);
  const bodies: ReadonlyArray<readonly [string, Segments]> = [
    [
      'contacts create',
      ['paths', '/api/contacts', 'post', 'requestBody', 'content', MEDIA],
    ],
    [
      'contacts update',
      ['paths', '/api/contacts/{id}', 'patch', 'requestBody', 'content', MEDIA],
    ],
    [
      'contacts get',
      [
        'paths',
        '/api/contacts/{id}',
        'get',
        'responses',
        '200',
        'content',
        MEDIA,
      ],
    ],
    [
      'organizations get',
      [
        'paths',
        '/api/organizations/{id}',
        'get',
        'responses',
        '200',
        'content',
        MEDIA,
      ],
    ],
  ];

  it.each(bodies)(
    'lands on the %s body and passes the schema the document gives it',
    (_, segments) => {
      const media = mediaAt(document, segments);
      const validate = schemaAt([...segments, 'schema']);
      const values = Object.values(media.examples);
      expect(values).toHaveLength(1);
      for (const example of values) {
        expect(validate(example.value)).toBe(true);
      }
    },
  );

  it('shows a get as the server builds it, links included, and keeps summaries and descriptions', () => {
    const contacts = mediaAt(document, bodies[2]![1]).examples;
    expect(contacts['ada']).toEqual({
      description: 'As the server sends it',
      value: resourceDocument(Contacts.resource, {
        id: ADA_ID,
        ...ADA,
        organization: '7',
      }),
    });
    expect(JSON.stringify(contacts['ada'])).toContain(
      `"self":"/api/contacts/${ADA_ID}"`,
    );
    expect(mediaAt(document, bodies[0]![1]).examples['ada']).toEqual({
      summary: 'A person at Acme',
      value: {
        data: {
          type: 'contacts',
          attributes: EXAMPLES.contacts.create.ada.attributes,
          relationships: { organization: { data: ACME } },
        },
      },
    });
  });

  it.each([
    [
      'create',
      { attributes: { name: SECRET }, relationships: { organization: ACME } },
      /^openapi: examples\.contacts\.create\.bad: attributes\.name: /u,
    ],
    [
      'create',
      {
        id: ADA_ID,
        attributes: { name: 'Ada' },
        relationships: { organization: ACME },
      },
      /: id: the resource takes no client id$/u,
    ],
    [
      'create',
      { attributes: { kind: 'person' }, relationships: { organization: ACME } },
      /: attributes\.name: /u,
    ],
    [
      'update',
      { attributes: { name: 'Ada' } },
      /: id: a resource object of this body carries an id$/u,
    ],
    ['update', { id: SECRET, attributes: { name: 'Ada' } }, /: id: /u],
    [
      'get',
      {
        id: ADA_ID,
        attributes: { ...ADA, fax: SECRET },
        relationships: { organization: ACME },
      },
      /: attributes\.fax: not a member of the response$/u,
    ],
    [
      'get',
      {
        id: ADA_ID,
        attributes: { ...ADA, tags: undefined },
        relationships: { organization: ACME },
      },
      /: attributes\.tags: /u,
    ],
    [
      'get',
      {
        id: ADA_ID,
        attributes: ADA,
        relationships: { organization: { type: 'people', id: '7' } },
      },
      /: relationships\.organization/u,
    ],
  ] as const)(
    'refuses a %s example its schema refuses: %o',
    (body, example, message) => {
      const run = () => documented({ contacts: { [body]: { bad: example } } });
      expect(run).toThrow(TypeError);
      expect(run).toThrow(message);
      expect(() => run()).not.toThrow(new RegExp(SECRET.slice(0, 14), 'u'));
    },
  );

  it('refuses examples of a type the document does not list, or of a body its resource lacks', () => {
    expect(() => documented({ people: { get: {} } })).toThrow(
      new TypeError(
        'openapi: examples.people: not the type of a listed resource',
      ),
    );
    expect(() => documented({ organizations: { create: {} } })).toThrow(
      /^openapi: examples\.organizations\.create: the resource has no such body/u,
    );
    expect(() =>
      documented({ contacts: { remove: {} } as ResourceExamples[string] }),
    ).toThrow(/^openapi: examples\.contacts\.remove: /u);
  });
});
