import type { RunningServer } from './support/server';

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBan } from '@nizam-os/hono-ban';
import { jsonApi } from '@nizam-os/hono-ban/formats/json-api';
import { errorResponses, validationResponse } from '@nizam-os/hono-ban/openapi';
import { defaultHook } from '@nizam-os/hono-ban/zod';

import { documentValidator } from './support/openapi-document';
import { startServer } from './support/server';

/**
 * Localized error bodies against the served OpenAPI 3.1 document (SPEC 6.2,
 * 7.1.4, 7.2.3; ADR 0020). The handler's `transform` puts a German `title`
 * in each body when the request asks for German, the one change RFC 9457
 * allows a title; each body fetched over HTTP must still validate (Ajv
 * 2020-12, strict) against the schema its route documents, which keeps
 * `status` and `code` pinned.
 * @ref https://www.rfc-editor.org/rfc/rfc9457#section-3.1.3
 */

const ERRORS = {
  ORDER_CONFLICT: {
    status: 409,
    description: 'The order changed underneath you',
  },
} as const;

/** The titles a host's German messages give each code. */
const GERMAN: Readonly<Record<string, string>> = {
  NOT_FOUND: 'Nicht gefunden',
  ORDER_CONFLICT: 'Bestellkonflikt',
  VALIDATION_FAILED: 'Validierung fehlgeschlagen',
};

/** Each object that has a `code` and a `title`, its title in German. */
function german(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => german(item));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const object = Object.fromEntries(
    Object.entries(value).map(([key, member]) => [key, german(member)]),
  );
  const code = object['code'];
  const title = typeof code === 'string' ? GERMAN[code] : undefined;
  return title === undefined || !('title' in object)
    ? object
    : { ...object, title };
}

const OrderInput = z.object({
  email: z.email(),
  quantity: z.number().int().positive(),
});

/** One ban per format, over the same catalog. */
const FORMATS = [
  { name: 'Problem Details', ban: createBan({ errors: ERRORS }) },
  { name: 'JSON:API', ban: createBan({ errors: ERRORS, format: jsonApi() }) },
];

function buildApp(ban: (typeof FORMATS)[number]['ban']): OpenAPIHono {
  const app = new OpenAPIHono({ defaultHook: defaultHook(ban) });
  app.onError(
    ban.onError({
      transform: (body, _error, c) =>
        c.req.header('accept-language')?.startsWith('de') === true
          ? german(body)
          : body,
    }),
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/orders/{id}',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { description: 'The order' },
        ...errorResponses(ban, ['NOT_FOUND', 'ORDER_CONFLICT']),
      },
    }),
    (c) => {
      throw c.req.valid('param').id === 'stale'
        ? ban.error('ORDER_CONFLICT', { detail: 'Order was modified' })
        : ban.notFound('Order does not exist');
    },
  );
  app.openapi(
    createRoute({
      method: 'post',
      path: '/orders',
      request: {
        body: {
          required: true,
          content: { 'application/json': { schema: OrderInput } },
        },
      },
      responses: {
        201: { description: 'Created' },
        422: validationResponse(ban),
      },
    }),
    (c) => c.body(null, 201),
  );
  app.doc31('/doc', {
    openapi: '3.1.0',
    info: { title: 'Orders', version: '1' },
  });
  return app;
}

describe.each(FORMATS)('localized $name bodies', ({ ban }) => {
  const media = ban.format.contentType;
  let server: RunningServer;
  let validator: ReturnType<typeof documentValidator>;

  beforeAll(async () => {
    server = await startServer(buildApp(ban));
    const res = await server.fetch('/doc');
    expect(res.status).toBe(200);
    validator = documentValidator(await res.json());
  });
  afterAll(async () => {
    await server.close();
  });

  const schemaAt = (path: string, method: string, status: number) =>
    validator([
      'paths',
      path,
      method,
      'responses',
      String(status),
      'content',
      media,
      'schema',
    ]);

  it.each([
    ['/orders/missing', 404, 'Nicht gefunden'],
    ['/orders/stale', 409, 'Bestellkonflikt'],
  ] as const)(
    'GET %s answers %i in German, matching the served schema',
    async (path, status, title) => {
      const res = await server.fetch(path, {
        headers: { 'accept-language': 'de-DE' },
      });
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(JSON.stringify(body)).toContain(`"title":"${title}"`);
      expect(schemaAt('/orders/{id}', 'get', status)(body)).toEqual([]);
    },
  );

  it('answers an invalid body with a German 422 matching the served schema', async () => {
    const res = await server.fetch('/orders', {
      method: 'POST',
      headers: {
        'accept-language': 'de',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'not-an-email', quantity: -1 }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain('Validierung fehlgeschlagen');
    expect(schemaAt('/orders', 'post', 422)(body)).toEqual([]);
  });

  it('keeps the English titles without German, matching the same schema', async () => {
    const body = await (await server.fetch('/orders/missing')).json();
    expect(JSON.stringify(body)).toContain('"title":"Not Found"');
    expect(schemaAt('/orders/{id}', 'get', 404)(body)).toEqual([]);
  });

  it('still refuses a body whose code belongs to another entry', async () => {
    const res = await server.fetch('/orders/missing', {
      headers: { 'accept-language': 'de' },
    });
    const text = (await res.text()).replace(
      '"code":"NOT_FOUND"',
      '"code":"ORDER_CONFLICT"',
    );
    const schema = schemaAt('/orders/{id}', 'get', 404);
    expect(schema(JSON.parse(text))).not.toEqual([]);
  });
});
