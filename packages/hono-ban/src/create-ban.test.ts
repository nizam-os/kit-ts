import type { Context } from 'hono';

import type { ErrorReport } from '@nizam-os/ban-core';

import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { describe, expect, it } from 'vitest';

import { fromRequest } from '@nizam-os/ban-core';

import { createBan } from './create-ban';
import { MALFORMED_JSON_MESSAGE } from './http-exception';

type AppEnv = { Variables: { user: string } };

const ban = createBan({
  errors: { ORDER_CONFLICT: { status: 409, title: 'Order Conflict' } },
});

function build(options: Parameters<typeof ban.onError<AppEnv>>[0] = {}): {
  app: Hono<AppEnv>;
  reports: Array<ErrorReport>;
} {
  const app = new Hono<AppEnv>();
  const reports: Array<ErrorReport> = [];
  app.use(async (c, next) => {
    c.set('user', 'u1');
    await next();
  });
  app.onError(
    ban.onError<AppEnv>({
      ...options,
      onReport: async (report, c) => {
        reports.push(report);
        await options.onReport?.(report, c);
      },
    }),
  );
  app.get('/missing', () => {
    throw ban.notFound('Order 42 does not exist');
  });
  app.get('/conflict', () => {
    throw new HTTPException(409, { message: 'taken' });
  });
  app.get('/silent', () => {
    throw new HTTPException(503);
  });
  app.get('/redirect', () => {
    throw new HTTPException(302, {
      res: new Response(null, { status: 302, headers: { Location: '/new' } }),
    });
  });
  app.get('/upstream', () => {
    throw new HTTPException(502, {
      res: new Response('<html>Bad Gateway</html>', {
        status: 502,
        headers: {
          'Content-Type': 'text/html',
          'Content-Length': '23',
          'Content-Encoding': 'identity',
          'Retry-After': '5',
        },
      }),
    });
  });
  app.get('/range', () => {
    throw new HTTPException(416, {
      res: new Response(null, {
        status: 416,
        headers: { 'Content-Range': 'bytes */1000', 'Content-Length': '0' },
      }),
    });
  });
  app.use('/secure/*', bearerAuth({ token: 'secret' }));
  app.get('/secure/orders', (c) => c.json({ ok: true }));
  app.post(
    '/orders',
    validator('json', (value) => value),
    (c) => c.json({ ok: true }),
  );
  app.get('/boom', () => {
    throw new Error('secret database string');
  });
  app.get('/string', () => {
    // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error -- reason: Hono's own handling of non-Error throws is what this route exercises
    throw 'a string';
  });
  return { app, reports };
}

describe('ban.onError', () => {
  it('renders a BanError with the request path as instance and reports it', async () => {
    const { app, reports } = build();
    const response = await app.request('/missing');
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json',
    );
    expect(body).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Order 42 does not exist',
      instance: '/missing',
    });
    expect(response.headers.get('x-error-id')).toBe(body['id']);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.context).toMatchObject({
      method: 'GET',
      path: '/missing',
    });
  });

  it('converts HTTPException by status and keeps its message as detail', async () => {
    const { app, reports } = build();
    const response = await app.request('/conflict');
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONFLICT',
      detail: 'taken',
    });
    expect(reports[0]?.handled).toBe(true);
    expect(reports[0]?.cause).toBeInstanceOf(HTTPException);
    const silent = await app.request('/silent');
    expect(silent.status).toBe(503);
    await expect(silent.json()).resolves.not.toHaveProperty('detail');
  });

  it('keeps status and WWW-Authenticate from hono/bearer-auth', async () => {
    const { app } = build();
    const response = await app.request('/secure/orders');
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toMatch(/^Bearer/u);
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json',
    );
    await expect(response.json()).resolves.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('maps Hono validator JSON failures to MALFORMED_JSON', async () => {
    const { app } = build();
    const response = await app.request('/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'MALFORMED_JSON',
      detail: MALFORMED_JSON_MESSAGE,
    });
  });

  it('adopts the headers of an HTTPException response except those describing its body', async () => {
    const { app } = build();
    const response = await app.request('/upstream');
    expect(response.status).toBe(502);
    expect(response.headers.get('retry-after')).toBe('5');
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json',
    );
    expect(response.headers.get('content-encoding')).toBeNull();
    const text = await response.text();
    expect(response.headers.get('content-length')).not.toBe('23');
    expect(JSON.parse(text)).toMatchObject({ code: 'BAD_GATEWAY' });
  });

  it('keeps Content-Range on a 416 because there it describes the resource', async () => {
    const { app } = build();
    const response = await app.request('/range');
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */1000');
    await expect(response.json()).resolves.toMatchObject({
      code: 'RANGE_NOT_SATISFIABLE',
    });
  });

  it('answers an HTTPException outside the error classes with its own response', async () => {
    const { app, reports } = build();
    const response = await app.request('/redirect');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/new');
    expect(reports).toHaveLength(0);
  });

  it('hides unknown errors behind a constant 500 and reports the cause', async () => {
    const { app, reports } = build();
    const response = await app.request('/boom');
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain('secret');
    expect(JSON.parse(text)).toMatchObject({
      detail: 'An unexpected error occurred',
    });
    expect(reports[0]?.handled).toBe(false);
    expect(reports[0]?.cause).toMatchObject({
      message: 'secret database string',
    });
  });

  it('never sees non-Error throws because Hono rethrows them before onError', async () => {
    // @ref https://github.com/honojs/hono/blob/main/src/hono-base.ts (errorHandler)
    const { app, reports } = build();
    await expect(app.request('/string')).rejects.toBe('a string');
    expect(reports).toHaveLength(0);
  });

  it('hands the Hono context to every callback', async () => {
    const seen: Array<Context<AppEnv>> = [];
    const { app, reports } = build({
      requestId: (c) => {
        seen.push(c);
        return c.get('user');
      },
      traceId: (c) => {
        seen.push(c);
        return c.req.header('x-trace');
      },
      transform: (body, _error, c) => {
        seen.push(c);
        return body;
      },
      onReport: (_report, c) => {
        seen.push(c);
      },
    });
    await app.request('/missing');
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]?.req.path).toBe('/missing');
    expect(reports[0]?.context.requestId).toBe('u1');
  });

  it('reads the request id and traceparent headers', async () => {
    const { app, reports } = build();
    await app.request('/missing', {
      headers: {
        'X-Request-Id': 'req-1',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
    });
    expect(reports[0]?.context).toMatchObject({
      requestId: 'req-1',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
    });
  });
});

describe('createBan (@nizam-os/hono-ban)', () => {
  it('rejects the reserved catalog key onError', () => {
    expect(() =>
      createBan({ errors: { onError: { status: 400 } } as never }),
    ).toThrow(
      new TypeError(
        'Catalog key "onError" collides with a ban instance member',
      ),
    );
  });

  it('adopts HTTPException in from() and keeps a user adopt hook after it', () => {
    const adopting = createBan({
      adopt: (value, b) =>
        value instanceof RangeError ? b.badRequest(value.message) : undefined,
    });
    expect(adopting.from(new HTTPException(404)).code).toBe('NOT_FOUND');
    expect(adopting.from(new RangeError('r')).detail).toBe('r');
    expect(adopting.from(new Error('x')).status).toBe(500);
    expect(ban.from(new HTTPException(302)).status).toBe(500);
  });

  it('exposes the core members unchanged', async () => {
    expect(ban.fromStatus(409).code).toBe('CONFLICT');
    expect(ban.ORDER_CONFLICT().title).toBe('Order Conflict');
    const handle = ban.handler();
    const response = await handle(
      ban.gone(),
      fromRequest(new Request('http://localhost/x')),
    );
    expect(response.status).toBe(410);
  });
});
