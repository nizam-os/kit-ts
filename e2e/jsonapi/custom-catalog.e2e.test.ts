/**
 * One error model across the packages (SPEC 4.2, ADR 0014): an application
 * instance built with `@nizam-os/hono-ban`, carrying this package's catalog next to
 * its own entries, renders what `@nizam-os/jsonapi-core` throws (directly, or through
 * the validators and the middleware) and what the application throws in
 * the same document shape, with the error id in the body and the header.
 * @ref https://jsonapi.org/format/1.1/#errors
 */
import type { RunningServer } from './support/server.ts';

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBan } from '@nizam-os/hono-ban';
import { jsonApi as jsonApiFormat } from '@nizam-os/hono-ban/formats/json-api';
import {
  ERROR_CATALOG,
  jsonApi,
  jsonApiError,
  queryValidator,
} from '@nizam-os/hono-jsonapi';

import { JSON_API } from './support/http.ts';
import { Articles } from './support/resources.ts';
import { startServer } from './support/server.ts';

interface ErrorBody {
  readonly errors: Array<Record<string, unknown>>;
}

function createApp(): Hono {
  const ban = createBan({
    errors: {
      ...ERROR_CATALOG,
      QUOTA_EXHAUSTED: { status: 429, title: 'Quota Exhausted' },
    },
    format: jsonApiFormat({ mixedEntries: true }),
    docsBaseUrl: 'https://api.test/errors',
  });
  const app = new Hono();
  app.use(jsonApi());
  app.onError(ban.onError({ headers: { 'Cache-Control': 'no-store' } }));
  app.get('/articles', queryValidator(Articles), (c) => c.json({ ok: true }));
  app.get('/missing', () => {
    throw jsonApiError('NOT_FOUND', { detail: 'No such article' });
  });
  app.get('/quota', () => {
    throw ban.QUOTA_EXHAUSTED('Daily quota exhausted');
  });
  app.get('/hono', () => {
    throw new HTTPException(401, { message: 'Token expired' });
  });
  return app;
}

describe('a @nizam-os/hono-ban instance renders every package error', () => {
  let server: RunningServer;
  beforeAll(async () => {
    server = await startServer(createApp());
  });
  afterAll(async () => {
    await server.close();
  });

  async function get(
    path: string,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; headers: Headers; body: ErrorBody }> {
    const response = await server.fetch(path, { headers });
    return {
      status: response.status,
      headers: response.headers,
      body: (await response.json()) as ErrorBody,
    };
  }

  it('renders a thrown @nizam-os/jsonapi-core error with the id in the body and the header', async () => {
    const { status, headers, body } = await get('/missing');
    expect(status).toBe(404);
    expect(headers.get('content-type')).toBe(JSON_API);
    expect(headers.get('cache-control')).toBe('no-store');
    const [error] = body.errors;
    expect(error).toEqual({
      id: headers.get('x-error-id'),
      links: { type: 'https://api.test/errors/NOT_FOUND' },
      status: '404',
      code: 'NOT_FOUND',
      title: 'Not Found',
      detail: 'No such article',
    });
  });

  it('renders the validators and the middleware, which throw', async () => {
    const query = await get('/articles?sort=nope&bogus=1');
    expect(query.status).toBe(400);
    expect(query.body.errors.map((error) => error['source'])).toEqual([
      { parameter: 'sort' },
      { parameter: 'bogus' },
    ]);
    expect(query.body.errors.map((error) => error['code'])).toEqual([
      'UNSUPPORTED_SORT',
      'UNKNOWN_QUERY_PARAMETER',
    ]);
    const negotiated = await get('/missing', {
      accept: `${JSON_API}; charset=utf-8`,
    });
    expect(negotiated.status).toBe(406);
    expect(negotiated.headers.get('vary')).toBe('Accept');
    expect(negotiated.body.errors[0]).toMatchObject({
      code: 'NOT_ACCEPTABLE',
      source: { header: 'Accept' },
    });
  });

  it("renders the application's own entries and Hono's exceptions the same way", async () => {
    const quota = await get('/quota');
    expect(quota.status).toBe(429);
    expect(quota.body.errors[0]).toMatchObject({
      links: { type: 'https://api.test/errors/QUOTA_EXHAUSTED' },
      status: '429',
      code: 'QUOTA_EXHAUSTED',
      title: 'Quota Exhausted',
      detail: 'Daily quota exhausted',
    });
    const hono = await get('/hono');
    expect(hono.status).toBe(401);
    expect(hono.body.errors[0]).toMatchObject({
      status: '401',
      code: 'UNAUTHORIZED',
      detail: 'Token expired',
    });
  });
});
