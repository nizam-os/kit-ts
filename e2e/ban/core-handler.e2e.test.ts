import type { ErrorReport } from '@nizam-os/ban-core';

import type { RunningServer } from './support/server';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBan, fromRequest } from '@nizam-os/ban-core';

import { startServer } from './support/server';

/**
 * `@nizam-os/ban-core` without Hono (SPEC 6): a plain `fetch` handler that catches what
 * its routes throw and answers through `ban.handler()` with the request facts
 * read by `fromRequest`. The server is `@hono/node-server`, used here only
 * as a `fetch` host; nothing from Hono touches the error path.
 */

// @ref https://www.w3.org/TR/trace-context/#traceparent-header
const TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';

interface RequestContext {
  readonly startedAt: number;
}

const ban = createBan({
  errors: { ORDER_CONFLICT: { status: 409, title: 'Order Conflict' } },
  adopt: (value, b) =>
    value instanceof RangeError ? b.badRequest(value.message) : undefined,
});
const reports: Array<{ report: ErrorReport; ctx: RequestContext }> = [];
const handle = ban.handler<RequestContext>({
  requestId: (ctx) => `ctx-${String(ctx.startedAt)}`,
  onReport: (report, ctx) => {
    reports.push({ report, ctx });
  },
});

function route(request: Request): Response {
  const { pathname } = new URL(request.url);
  switch (pathname) {
    case '/orders/42':
      throw ban.notFound('Order 42 does not exist');
    case '/orders/conflict':
      throw ban.ORDER_CONFLICT({ headers: { 'Retry-After': '30' } });
    case '/range':
      throw new RangeError('quantity must be positive');
    case '/boom':
      throw new Error('secret database string');
    default:
      return new Response('ok');
  }
}

const app = {
  fetch: async (request: Request): Promise<Response> => {
    const ctx: RequestContext = { startedAt: 7 };
    try {
      return route(request);
    } catch (thrown) {
      return handle(thrown, fromRequest(request), ctx);
    }
  },
};

describe('@nizam-os/ban-core handler without Hono', () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startServer(app);
  });
  afterAll(async () => {
    await server.close();
  });

  it('serves Problem Details for a thrown BanError', async () => {
    reports.splice(0);
    const res = await server.fetch('/orders/42?expand=items', {
      headers: { traceparent: TRACEPARENT },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Order 42 does not exist',
      instance: '/orders/42',
      traceId: TRACE_ID,
    });
    expect(res.headers.get('x-error-id')).toBe(body['id']);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.ctx).toEqual({ startedAt: 7 });
    expect(reports[0]?.report.context).toMatchObject({
      method: 'GET',
      path: '/orders/42',
      requestId: 'ctx-7',
      traceId: TRACE_ID,
    });
  });

  it('keeps error headers and the custom entry', async () => {
    const res = await server.fetch('/orders/conflict');
    expect(res.status).toBe(409);
    expect(res.headers.get('retry-after')).toBe('30');
    await expect(res.json()).resolves.toMatchObject({
      code: 'ORDER_CONFLICT',
      title: 'Order Conflict',
    });
  });

  it('adopts what the adopt hook recognizes and hides the rest', async () => {
    const adopted = await server.fetch('/range');
    expect(adopted.status).toBe(400);
    await expect(adopted.json()).resolves.toMatchObject({
      code: 'BAD_REQUEST',
      detail: 'quantity must be positive',
    });
    const hidden = await server.fetch('/boom');
    expect(hidden.status).toBe(500);
    const text = await hidden.text();
    expect(text).not.toContain('secret');
    expect(JSON.parse(text)).toMatchObject({
      detail: 'An unexpected error occurred',
    });
  });
});
