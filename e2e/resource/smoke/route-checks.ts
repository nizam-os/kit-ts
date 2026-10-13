/**
 * Runtime-neutral checks of `@nizam-os/hono-resource` (resource SPEC 19.8)
 * over the built package: the routes of a runtime of the contract held in
 * memory answer a declared resource at the path its links name, another
 * method with 405 and `Allow`, a request without an actor with what the
 * actor threw, a relationship link with its linkage, an update the
 * relationship does not support with 403, a related link with the
 * target's document, an operations request with its results, and the
 * OpenAPI document without an actor, and the error handler reads the type
 * a route serves through `resourceTypeOf`, through Hono's `fetch` as every
 * runtime calls it. No Node.js API, so the module runs on Bun, Deno, and
 * workerd.
 */
import type {
  PublicRow,
  ResourceInput,
  ResourceRuntime,
} from '@nizam-os/resource-core/server';

import type { Checks } from './report.ts';

import { Hono } from 'hono';

import {
  ATOMIC_OPERATIONS_EXTENSION,
  CURSOR_PAGINATION_PROFILE,
  errorHandler,
  jsonApi,
  jsonApiError,
  notFoundHandler,
} from '@nizam-os/hono-jsonapi';
import { jsonApiRoutes, resourceTypeOf } from '@nizam-os/hono-resource';

import { Contacts } from '../resources/contacts.ts';
import { Organizations } from '../resources/organizations.ts';
import { check } from './report.ts';

const ACME: PublicRow = {
  id: '1',
  name: 'Acme',
  slug: 'acme',
  handle: null,
  seats: 5,
  country: 'DE',
  createdAt: '2026-10-11T08:00:00.000Z',
};

/** A contact of Acme's, its relationship held by public name. */
const ADA: PublicRow = { id: '7', name: 'Ada', organization: ACME.id };

/** The row of `rows` that `id` names, once a turn of the microtask queue has passed. */
async function rowOf(
  rows: ReadonlyArray<PublicRow>,
  id: string,
): Promise<PublicRow> {
  await Promise.resolve();
  const row = rows.find((candidate) => candidate.id === id);
  if (row === undefined) {
    throw jsonApiError('NOT_FOUND', { detail: 'The resource does not exist' });
  }
  return row;
}

const ATOMIC = `application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"`;

/**
 * The domain of the smoke runtime, which keeps no write, so a transaction
 * is its domain as it is: an update answers the row it would write.
 */
const domain = {
  organizations: {
    get: async (id: string) => rowOf([ACME], id),
    update: async (id: string, input: ResourceInput) => ({
      ...(await rowOf([ACME], id)),
      ...input.attributes,
    }),
  },
  contacts: { get: async (id: string) => rowOf([ADA], id) },
};

const runtime: ResourceRuntime = {
  warnings: [],
  resources: [Organizations, Contacts],
  as: () => domain,
  transaction: async (_actor, work) => work(domain),
};

/** The error handler, which adds the type `resourceTypeOf` names to each error document's `meta`. */
const handle = errorHandler({
  transform: (body, _error, c) =>
    typeof body === 'object' && body !== null
      ? { ...body, meta: { type: resourceTypeOf(c) ?? null } }
      : body,
});

/** The host: negotiation, the error handlers, and the routes at `/`, with the document. */
function host(): Hono {
  const app = new Hono();
  app.use(
    jsonApi({
      profiles: [CURSOR_PAGINATION_PROFILE],
      extensions: [ATOMIC_OPERATIONS_EXTENSION],
    }),
  );
  app.onError(handle);
  app.notFound(notFoundHandler());
  app.route(
    '/',
    jsonApiRoutes({
      runtime,
      actor: (c) => {
        if (c.req.header('X-Actor') !== 'smoke') {
          throw jsonApiError('UNAUTHORIZED', {
            detail: 'The request names no actor',
          });
        }
        return { id: 'smoke', can: () => false };
      },
      openapi: { info: { title: 'Contacts', version: '1.0.0' } },
    }),
  );
  return app;
}

export const routeChecks: Checks = {
  'hono-resource answers a declared resource at the path its links name':
    async () => {
      const response = await host().request('/api/organizations/1', {
        headers: { 'X-Actor': 'smoke' },
      });
      check(response.status === 200, `status ${String(response.status)}`);
      const text = await response.text();
      check(
        text.includes('"self":"/api/organizations/1"') &&
          text.includes('"name":"Acme"'),
        text,
      );
    },
  'hono-resource answers another method with 405 and Allow': async () => {
    const response = await host().request('/api/organizations/1', {
      method: 'DELETE',
      headers: { 'X-Actor': 'smoke' },
    });
    check(response.status === 405, `status ${String(response.status)}`);
    const allow = response.headers.get('Allow');
    check(allow === 'GET, HEAD, PATCH', `Allow ${String(allow)}`);
  },
  'hono-resource answers what the actor threw': async () => {
    const response = await host().request('/api/organizations/1');
    check(response.status === 401, `status ${String(response.status)}`);
  },
  'hono-resource answers a relationship link with its linkage': async () => {
    const response = await host().request(
      '/api/contacts/7/relationships/organization',
      { headers: { 'X-Actor': 'smoke' } },
    );
    check(response.status === 200, `status ${String(response.status)}`);
    const text = await response.text();
    check(
      text.includes('"related":"/api/contacts/7/organization"') &&
        text.includes('"data":{"type":"organizations","id":"1"}'),
      text,
    );
  },
  'hono-resource answers an update the relationship does not support with 403':
    async () => {
      const response = await host().request(
        '/api/contacts/7/relationships/organization',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/vnd.api+json' },
          body: JSON.stringify({ data: null }),
        },
      );
      check(response.status === 403, `status ${String(response.status)}`);
    },
  "hono-resource answers a related link with the target's document":
    async () => {
      const response = await host().request('/api/contacts/7/organization', {
        headers: { 'X-Actor': 'smoke' },
      });
      check(response.status === 200, `status ${String(response.status)}`);
      const text = await response.text();
      check(
        text.includes('"self":"/api/organizations/1"') &&
          text.includes('"name":"Acme"'),
        text,
      );
    },
  'hono-resource answers an operations request with its results': async () => {
    const response = await host().request('/api/operations', {
      method: 'POST',
      headers: { 'X-Actor': 'smoke', 'Content-Type': ATOMIC, Accept: ATOMIC },
      body: JSON.stringify({
        'atomic:operations': [
          {
            op: 'update',
            href: '/api/organizations/1',
            data: { type: 'organizations', id: '1', attributes: { seats: 6 } },
          },
        ],
      }),
    });
    check(response.status === 200, `status ${String(response.status)}`);
    const text = await response.text();
    check(
      text.includes(
        '"atomic:results":[{"data":{"type":"organizations","id":"1"',
      ) && text.includes('"seats":6'),
      text,
    );
  },
  'hono-resource serves the OpenAPI document without an actor, the operations endpoint listed':
    async () => {
      const response = await host().request('/api/openapi.json');
      check(response.status === 200, `status ${String(response.status)}`);
      const type = response.headers.get('Content-Type');
      check(type === 'application/json', `Content-Type ${String(type)}`);
      const text = await response.text();
      check(
        text.includes('"openapi":"3.1.2"') &&
          text.includes('"/api/contacts/{id}/organization"') &&
          text.includes(
            '"/api/operations":{"post":{"operationId":"atomic:operations"',
          ),
        text.slice(0, 200),
      );
    },
  'hono-resource tells the error handler the type a route serves': async () => {
    const response = await host().request('/api/contacts/9/organization', {
      headers: { 'X-Actor': 'smoke' },
    });
    check(response.status === 404, `status ${String(response.status)}`);
    const text = await response.text();
    check(text.includes('"meta":{"type":"organizations"}'), text);
  },
};
