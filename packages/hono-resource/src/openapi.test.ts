/**
 * The document's route (resource SPEC 19.5): with `openapi`, `GET
 * <base>/openapi.json` answers the runtime's document as
 * `application/json`, without an actor; another method answers 405 with
 * the methods it takes. The document is built when the routes are, so an
 * invalid one fails there, and a resource whose route takes its path is
 * refused. Without the option, the path is not served.
 * @ref https://spec.openapis.org/oas/v3.1.2.html
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.5.6
 */
import { describe, expect, it } from 'vitest';

import { createDeclareResource } from '@nizam-os/resource-core';
import { openapi } from '@nizam-os/resource-core/openapi';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { jsonApiRoutes } from './routes';
import { memberOf, testApp } from './test-support/app';
import { memoryRuntime } from './test-support/memory-runtime';
import { RESOURCES } from './test-support/resources';

const OPTIONS = { info: { title: 'Tasks API', version: '1.0.0' } };

describe('GET <base>/openapi.json (resource SPEC 19.5)', () => {
  it("answers the runtime's document, the operations endpoint listed, as application/json, without an actor", async () => {
    const app = testApp(memoryRuntime(RESOURCES), { openapi: OPTIONS });
    const response = await app.request('/api/openapi.json');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    const document: unknown = await response.json();
    expect(document).toStrictEqual(
      JSON.parse(JSON.stringify(openapi(RESOURCES, OPTIONS))),
    );
    expect(document).toHaveProperty(['paths', '/api/operations', 'post']);
  });

  it('answers HEAD with no body', async () => {
    const app = testApp(memoryRuntime(RESOURCES), { openapi: OPTIONS });
    const response = await app.request('/api/openapi.json', {
      method: 'HEAD',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.text()).toBe('');
  });

  it('answers another method 405 with Allow: GET, HEAD', async () => {
    const app = testApp(memoryRuntime(RESOURCES), { openapi: OPTIONS });
    const response = await app.request('/api/openapi.json', {
      method: 'DELETE',
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });

  it('is not served without the option', async () => {
    const response = await testApp(memoryRuntime(RESOURCES)).request(
      '/api/openapi.json',
    );
    expect(response.status).toBe(404);
  });

  it('fails when the routes are made for a document that cannot be built', () => {
    expect(() =>
      jsonApiRoutes({
        runtime: memoryRuntime(RESOURCES),
        actor: memberOf,
        openapi: {
          ...OPTIONS,
          examples: {
            tasks: { create: { bad: { attributes: { title: 5 } } } },
          },
        },
      }),
    ).toThrow(/^openapi: examples\.tasks\.create\.bad: /u);
  });

  it('refuses options that are not an object', () => {
    expect(() =>
      jsonApiRoutes({
        runtime: memoryRuntime(RESOURCES),
        actor: memberOf,
        openapi: 'Tasks API' as never,
      }),
    ).toThrow(
      new TypeError("jsonApiRoutes: options.openapi must be openapi's options"),
    );
  });

  it("refuses a resource whose route takes the document's path", () => {
    const declareResource = createDeclareResource({
      catalog: contractFixture.catalog,
      codecs: contractFixture.codecs,
      links: { self: (id) => `/api/openapi.json/${encodeURIComponent(id)}` },
    });
    const Documents = declareResource('logs', {
      as: 'documents',
      operations: ['list'],
      fields: { note: { access: 'read' } },
    });
    expect(() =>
      jsonApiRoutes({
        runtime: memoryRuntime([...RESOURCES, Documents]),
        actor: memberOf,
        openapi: OPTIONS,
      }),
    ).toThrow(
      new TypeError(
        'jsonApiRoutes: two routes have the path /api/openapi.json',
      ),
    );
  });
});
