/**
 * The Atomic Operations endpoint in the document (SPEC 13.1): listed at
 * `<base>/operations` exactly when a resource declares a write, under the
 * extension's media type, with the components its operations read, its
 * results, which validate what the processor answers, the codes of every
 * write, and the refusals of a registry whose links give different
 * operations paths or whose resource takes the endpoint's path.
 * @ref https://jsonapi.org/ext/atomic/
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX_OPERATIONS } from '@nizam-os/jsonapi-core/atomic';

import { createDeclareResource } from '../declare/create-declare-resource';
import { ACCEPTED } from '../test-support/atomic-documents';
import {
  ATOMIC_RESOURCES,
  AtomicContacts,
  AtomicOrganizations,
  People,
  resultsOf,
  Teams,
} from '../test-support/atomic-registry';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { Organizations } from '../test-support/definition-resources';
import { openApiErrors } from '../test-support/openapi-conformance';
import { documentValidator } from '../test-support/openapi-document';
import { openapi } from './document';

const INFO = { title: 'Teams', version: '1' };
const ATOMIC = 'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"';
const PATH = '/api/operations';
const DOCUMENT = openapi(ATOMIC_RESOURCES, {
  info: INFO,
  codes: {
    all: ['UNAUTHORIZED'],
    resources: { teams: { create: ['QUOTA_EXCEEDED'] } },
  },
});
const OPERATION = DOCUMENT.paths[PATH]?.post;
const ERROR_OBJECT = /_error\.([A-Z0-9_]+)/gu;

/** The codes the response of `status` references. */
function codesAt(status: string): Array<string | undefined> {
  const response = OPERATION?.responses[status];
  const where =
    response !== undefined && '$ref' in response
      ? DOCUMENT.components.responses[response.$ref.split('/').at(-1) ?? '']
      : response;
  return [...JSON.stringify(where).matchAll(ERROR_OBJECT)].map(
    ([, code]) => code,
  );
}

/** A definer over the unit-test catalog whose links sit under `base`. */
function definerAt(base: string) {
  return createDeclareResource({
    catalog: contactsCatalog,
    ...TEST_REGISTRIES,
    links: { base },
  });
}

/** The operations the endpoint of `document` takes. */
function variantsOf(
  document: ReturnType<typeof openapi>,
): Array<{ properties: Record<string, unknown> }> {
  const schema = document.paths[PATH]?.post?.requestBody?.content[ATOMIC]
    ?.schema as
    | {
        properties: {
          'atomic:operations': {
            items: { anyOf: Array<{ properties: Record<string, unknown> }> };
          };
        };
      }
    | undefined;
  return schema?.properties['atomic:operations'].items.anyOf ?? [];
}

/** The 2xx statuses the endpoint answers with for `resources`. */
function statuses(resources: Parameters<typeof openapi>[0]): Array<string> {
  const responses = openapi(resources, { info: INFO }).paths[PATH]?.post
    ?.responses;
  return Object.keys(responses ?? {}).filter((status) =>
    status.startsWith('2'),
  );
}

/** The server and the endpoint's path for a resource linked under `base`. */
function placedAt(base: string): Array<string | undefined> {
  const document = openapi(
    [definerAt(base)('teams', { operations: ['remove'], fields: {} })],
    { info: INFO },
  );
  return [document.servers?.[0]?.url, Object.keys(document.paths).at(-1)];
}

describe('the operations endpoint (SPEC 13.1)', () => {
  it('conforms to the OpenAPI 3.1 schema', () => {
    expect(openApiErrors(DOCUMENT)).toEqual([]);
  });

  it('is POST <base>/operations, atomic:operations, under the extension media type', () => {
    expect(OPERATION?.operationId).toBe('atomic:operations');
    expect(OPERATION?.tags).toEqual(['atomic:operations']);
    expect(Object.keys(OPERATION?.requestBody?.content ?? {})).toEqual([
      ATOMIC,
    ]);
    const schema = OPERATION?.requestBody?.content[ATOMIC]?.schema;
    expect(schema?.['properties']).toMatchObject({
      'atomic:operations': { minItems: 1, maxItems: DEFAULT_MAX_OPERATIONS },
    });
  });

  it('lists each operation once, such as the remove by href every removable resource takes', () => {
    const declareResource = definerAt('/api');
    const variants = variantsOf(
      openapi(
        [
          declareResource('teams', { operations: ['remove'], fields: {} }),
          declareResource('people', { operations: ['remove'], fields: {} }),
        ],
        { info: INFO },
      ),
    );
    expect(variants.map((variant) => Object.keys(variant.properties))).toEqual([
      ['op', 'ref', 'meta'],
      ['op', 'href', 'meta'],
      ['op', 'ref', 'meta'],
    ]);
    expect(variantsOf(DOCUMENT).length).toBe(
      new Set(variantsOf(DOCUMENT).map((variant) => JSON.stringify(variant)))
        .size,
    );
  });

  it('is not listed without a write, nor are the components its operations read', () => {
    const document = openapi([Organizations], { info: INFO });
    expect(Object.keys(document.paths)).toEqual([
      '/api/organizations',
      '/api/organizations/{id}',
    ]);
    expect(Object.keys(document.components.schemas)).not.toContain(
      'organizations.atomic-update',
    );
  });

  it("holds each resource's local identifier and operation objects where an operation reads them", () => {
    const keys = Object.keys(DOCUMENT.components.schemas).filter(
      (key) => key.endsWith('.local') || key.includes('.atomic-'),
    );
    expect(keys).toEqual([
      'teams.local',
      'teams.atomic-add',
      'teams.atomic-update',
      'people.local',
      'people.atomic-add',
      'people.atomic-update',
      'contacts.local',
      'contacts.atomic-add',
      'contacts.atomic-update',
      'organizations.atomic-update',
      'meetings.atomic-update',
    ]);
  });

  it('answers results the processor builds, 204 when none has data', async () => {
    const results = documentValidator(DOCUMENT)([
      'paths',
      PATH,
      'post',
      'responses',
      '200',
      'content',
      ATOMIC,
      'schema',
    ]);
    const answered = await Promise.all(
      ACCEPTED.map(async ([, document]) => resultsOf(document)),
    );
    const documents = answered.filter((document) => document !== undefined);
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.filter((document) => !results(document))).toEqual([]);
    expect(answered).toContain(undefined);
    expect(results({ 'atomic:results': [] })).toBe(false);
    expect(OPERATION?.responses['204']).toEqual({
      description: 'Every operation ran, and none has a result.',
    });
  });

  it('lists 200 only where an operation answers a resource object, and 204 only where a result can be empty', () => {
    const declareResource = definerAt('/api');
    const Removed = declareResource('teams', {
      operations: ['remove'],
      fields: {},
    });
    const Added = declareResource('people', {
      operations: ['create'],
      fields: { name: { access: 'readWrite' } },
      relationships: { team_id: { target: () => Removed, access: 'read' } },
    });
    expect(statuses([Removed])).toEqual(['204']);
    expect(statuses([Added, Removed])).toEqual(['200', '204']);
    expect(statuses([People, Teams])).toEqual(['200', '204']);
    expect(statuses([AtomicOrganizations])).toEqual(['200']);
    expect(statuses([AtomicContacts, AtomicOrganizations])).toEqual([
      '200',
      '204',
    ]);
  });

  it("lists the processor's codes and every write's, the application's included", () => {
    expect(codesAt('400')).toEqual(
      expect.arrayContaining(['MALFORMED_JSON', 'INVALID_DOCUMENT']),
    );
    expect(codesAt('401')).toEqual(['UNAUTHORIZED']);
    expect(codesAt('403')).toEqual(
      expect.arrayContaining([
        'FORBIDDEN',
        'QUOTA_EXCEEDED',
        'CLIENT_GENERATED_ID_NOT_SUPPORTED',
      ]),
    );
    expect(codesAt('404')).toEqual([
      'NOT_FOUND',
      'TEAMS_LEAD_ID_FKEY',
      'PEOPLE_TEAM_ID_FKEY',
      'CONTACTS_ORGANIZATION_ID_FKEY',
      'MEETINGS_ORGANIZATION_ID_FKEY',
    ]);
    expect(codesAt('409')).toEqual(
      expect.arrayContaining(['CONFLICT', 'TEAMS_SLUG_KEY']),
    );
    expect(codesAt('415')).toEqual(['UNSUPPORTED_MEDIA_TYPE']);
    expect(codesAt('422')).toEqual(
      expect.arrayContaining(['VALIDATION_FAILED']),
    );
  });

  it('sits under the base of root-relative links, and of absolute links, whose origin is the server', () => {
    expect(placedAt('')).toEqual([undefined, '/operations']);
    expect(placedAt('https://api.example.com/v2')).toEqual([
      'https://api.example.com',
      '/v2/operations',
    ]);
  });

  it('refuses links that give different operations paths, and a collection at the endpoint path, listed or not', () => {
    const elsewhere = definerAt('/v2');
    expect(() =>
      openapi(
        [
          AtomicOrganizations,
          elsewhere('people', {
            operations: ['get'],
            fields: { name: { access: 'read' } },
          }),
        ],
        { info: INFO },
      ),
    ).toThrow(
      new TypeError(
        "openapi: the resources' links have different operations paths (/api/operations, /v2/operations); one endpoint has one path",
      ),
    );
    const Operations = definerAt('/api')('people', {
      as: 'operations',
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    expect(() =>
      openapi([AtomicOrganizations, Operations], { info: INFO }),
    ).toThrow(
      new TypeError(
        "openapi: the operations endpoint's path, /api/operations, is the collection path of operations",
      ),
    );
  });
});
