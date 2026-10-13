import type { Context } from 'hono';

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';

import { createBan } from '@nizam-os/hono-ban';
import { jsonApi } from '@nizam-os/hono-ban/formats/json-api';
import { ERROR_CATALOG, jsonApiError } from '@nizam-os/jsonapi-core';

import { errorHandler, notFoundHandler } from './handlers';

interface ErrorBody {
  readonly errors: Array<Record<string, unknown>>;
  readonly jsonapi?: unknown;
  readonly meta?: unknown;
}

async function thrown(
  error: unknown,
  options?: Parameters<typeof errorHandler>[0],
): Promise<{ status: number; headers: Headers; body: ErrorBody }> {
  const app = new Hono();
  app.onError(errorHandler(options));
  app.get('/', () => {
    throw error;
  });
  const response = await app.request('/', {
    headers: {
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    },
  });
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as ErrorBody,
  };
}

describe('errorHandler', () => {
  it('renders a thrown error with its status and objects, the id in the body and the header', async () => {
    const error = jsonApiError('CONFLICT', {
      detail: 'Taken',
      source: { pointer: '/data/id' },
    });
    const { status, headers, body } = await thrown(error);
    expect(status).toBe(409);
    expect(headers.get('content-type')).toBe('application/vnd.api+json');
    expect(headers.get('x-error-id')).toBe(error.id);
    expect(headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({
      errors: [
        {
          id: error.id,
          status: '409',
          code: 'CONFLICT',
          title: 'Conflict',
          detail: 'Taken',
          source: { pointer: '/data/id' },
          meta: { traceId: '0af7651916cd43dd8448eb211c80319c' },
        },
      ],
    });
  });

  it('adopts an HTTPException by status with @nizam-os/ban-core built-in identity', async () => {
    const withMessage = await thrown(
      new HTTPException(413, { message: 'Body exceeds 1 MiB' }),
    );
    expect(withMessage.status).toBe(413);
    expect(withMessage.body.errors).toEqual([
      {
        id: expect.any(String),
        status: '413',
        code: 'CONTENT_TOO_LARGE',
        title: 'Content Too Large',
        detail: 'Body exceeds 1 MiB',
        meta: { traceId: expect.any(String) },
      },
    ]);
    const bare = await thrown(new HTTPException(401));
    expect(bare.body.errors[0]).toMatchObject({
      status: '401',
      code: 'UNAUTHORIZED',
      title: 'Unauthorized',
    });
    expect(bare.body.errors[0]).not.toHaveProperty('detail');
  });

  it('turns anything else into a constant 500 that reveals nothing', async () => {
    const { status, body } = await thrown(
      new Error('connection string postgres://user:secret@db'),
    );
    expect(status).toBe(500);
    expect(body.errors[0]).toMatchObject({
      status: '500',
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred',
    });
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('lets an HTTPException outside the error classes answer for itself', async () => {
    const app = new Hono();
    app.onError(errorHandler());
    app.get('/', () => {
      throw new HTTPException(302, {
        res: new Response(null, { status: 302, headers: { Location: '/x' } }),
      });
    });
    const response = await app.request('/');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/x');
  });

  it('reports once, survives a throwing reporter, and applies document, format, and headers', async () => {
    const onReport = vi.fn((_report: unknown, _c: Context) => {
      throw new Error('logger down');
    });
    const error = jsonApiError('FORBIDDEN', { detail: 'No' });
    const { status, headers, body } = await thrown(error, {
      onReport,
      document: { jsonapi: { version: '1.1' }, meta: { requestId: 'abc' } },
      format: { typeLinkBaseUrl: 'https://api.test/errors', includeId: false },
      headers: { 'Cache-Control': 'public' },
    });
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onReport.mock.calls[0]?.[0]).toMatchObject({
      error,
      handled: true,
      context: { method: 'GET', path: '/' },
    });
    expect(status).toBe(403);
    expect(headers.get('cache-control')).toBe('public');
    expect(body.jsonapi).toEqual({ version: '1.1' });
    expect(body.meta).toEqual({ requestId: 'abc' });
    expect(body.errors[0]).toEqual({
      links: { type: 'https://api.test/errors/FORBIDDEN' },
      status: '403',
      code: 'FORBIDDEN',
      title: 'Forbidden',
      detail: 'No',
      meta: { traceId: expect.any(String) },
    });
  });

  it('maps domain errors through the instance that carries the catalog', async () => {
    class Stale extends Error {}
    const { status, body } = await thrown(new Stale('stale'), {
      map: (error, ban) =>
        error instanceof Stale
          ? ban.INVALID_DOCUMENT({ detail: 'The document is stale' })
          : undefined,
    });
    expect(status).toBe(400);
    expect(body.errors[0]).toMatchObject({
      code: 'INVALID_DOCUMENT',
      detail: 'The document is stale',
    });
  });

  it('is interchangeable with an application instance built on @nizam-os/hono-ban', async () => {
    const ban = createBan({
      errors: { ...ERROR_CATALOG, QUOTA: { status: 429, title: 'Quota' } },
      format: jsonApi({ mixedEntries: true }),
    });
    const app = new Hono();
    app.onError(ban.onError());
    app.get('/kit', () => {
      throw jsonApiError('INVALID_DOCUMENT', {
        detail: 'bad',
        source: { pointer: '/data' },
      });
    });
    app.get('/own', () => {
      throw ban.QUOTA('Daily quota exhausted');
    });
    const kit = await app.request('/kit');
    expect(kit.status).toBe(400);
    expect(((await kit.json()) as ErrorBody).errors[0]).toMatchObject({
      code: 'INVALID_DOCUMENT',
      source: { pointer: '/data' },
    });
    const own = await app.request('/own');
    expect(own.status).toBe(429);
    expect(((await own.json()) as ErrorBody).errors[0]).toMatchObject({
      code: 'QUOTA',
      title: 'Quota',
      detail: 'Daily quota exhausted',
    });
  });
});

describe('notFoundHandler', () => {
  it('answers unmatched routes with a 404 error document', async () => {
    const app = new Hono();
    app.notFound(
      notFoundHandler({
        document: { meta: { requestId: 'r' } },
        headers: { 'X-Id': '1' },
      }),
    );
    const response = await app.request('/nowhere');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.api+json',
    );
    expect(response.headers.get('x-id')).toBe('1');
    expect(await response.json()).toEqual({
      meta: { requestId: 'r' },
      errors: [
        {
          id: expect.any(String),
          status: '404',
          code: 'NOT_FOUND',
          title: 'Not Found',
          detail: 'No resource exists at the requested URL',
        },
      ],
    });
  });
});
