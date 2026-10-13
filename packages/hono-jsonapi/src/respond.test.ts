import type { Context } from 'hono';

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { jsonApiError } from '@nizam-os/jsonapi-core';

import {
  isJsonApiResponse,
  respond,
  respondError,
  varyAccept,
} from './respond';

const ARTICLE = {
  type: 'articles',
  id: '1',
  attributes: { title: 'Hi' },
  links: { self: 'https://api.test/articles/1' },
};

async function handle(
  handler: (c: Context) => Response | Promise<Response>,
): Promise<Response> {
  const app = new Hono();
  app.all('/', async (c) => handler(c));
  return app.request('/', { method: 'POST' });
}

describe('respond', () => {
  it('sends the document with the bare media type and status 200 by default', async () => {
    const response = await handle((c) => respond(c, { data: ARTICLE }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.api+json',
    );
    expect(await response.json()).toEqual({ data: ARTICLE });
  });

  it('derives ext and profile parameters from the jsonapi object', async () => {
    const response = await handle((c) =>
      respond(c, {
        jsonapi: {
          version: '1.1',
          ext: ['https://jsonapi.org/ext/atomic'],
          profile: ['https://p.test/a', 'https://p.test/b'],
        },
        meta: {},
      }),
    );
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"; profile="https://p.test/a https://p.test/b"',
    );
  });

  it('adds Location from the created resource self link on 201 only', async () => {
    const created = await handle((c) => respond(c, { data: ARTICLE }, 201));
    expect(created.status).toBe(201);
    expect(created.headers.get('location')).toBe('https://api.test/articles/1');
    const ok = await handle((c) => respond(c, { data: ARTICLE }, 200));
    expect(ok.headers.get('location')).toBeNull();
    const collection = await handle((c) =>
      respond(c, { data: [ARTICLE] }, 201),
    );
    expect(collection.headers.get('location')).toBeNull();
    const noSelf = await handle((c) =>
      respond(c, { data: { type: 'a', id: '1' } }, 201),
    );
    expect(noSelf.headers.get('location')).toBeNull();
  });

  it('reads a link object self link and keeps a Location the caller sets', async () => {
    const linkObject = await handle((c) =>
      respond(
        c,
        {
          data: {
            type: 'a',
            id: '1',
            links: { self: { href: '/a/1', meta: { x: 1 } } },
          },
        },
        201,
      ),
    );
    expect(linkObject.headers.get('location')).toBe('/a/1');
    const explicit = await handle((c) =>
      respond(c, { data: ARTICLE }, 201, { location: '/elsewhere' }),
    );
    expect(explicit.headers.get('location')).toBe('/elsewhere');
  });

  it('passes extra headers through and keeps the content type ours', async () => {
    const response = await handle((c) =>
      respond(c, { meta: { ok: true } }, 200, {
        'Cache-Control': 'no-store',
        'content-type': 'text/plain',
      }),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.api+json',
    );
  });
});

describe('respondError', () => {
  it('sends the error document with the error status, its headers, and base members', async () => {
    const error = jsonApiError('NOT_FOUND', {
      detail: 'The requested resource does not exist',
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': 'error' },
    });
    const response = await handle((c) =>
      respondError(
        c,
        error,
        { meta: { requestId: 'r' } },
        { 'X-Request-Id': 'r', 'Cache-Control': 'private' },
      ),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.api+json',
    );
    // The error's own headers win over the caller's.
    expect(response.headers.get('x-request-id')).toBe('error');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      meta: { requestId: 'r' },
      errors: [
        {
          id: error.id,
          status: '404',
          code: 'NOT_FOUND',
          title: 'Not Found',
          detail: 'The requested resource does not exist',
        },
      ],
    });
  });
});

describe('isJsonApiResponse', () => {
  it('recognizes the media type with any parameters and nothing else', () => {
    expect(
      isJsonApiResponse(
        new Response('', {
          headers: { 'content-type': 'application/vnd.api+json; ext="x"' },
        }),
      ),
    ).toBe(true);
    expect(
      isJsonApiResponse(
        new Response('', { headers: { 'content-type': 'application/json' } }),
      ),
    ).toBe(false);
    expect(isJsonApiResponse(new Response(null, { status: 204 }))).toBe(false);
  });
});

describe('varyAccept', () => {
  it('adds Accept once, case-insensitively, and respects *', () => {
    expect(varyAccept(null)).toBe('Accept');
    expect(varyAccept('')).toBe('Accept');
    expect(varyAccept('Origin')).toBe('Origin, Accept');
    expect(varyAccept('origin, accept')).toBe('origin, accept');
    expect(varyAccept('*')).toBe('*');
  });
});
