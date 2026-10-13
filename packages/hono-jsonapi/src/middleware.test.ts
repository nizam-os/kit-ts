import type { JsonApiContext, JsonApiEnv } from './types';

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { ATOMIC_OPERATIONS_EXTENSION } from '@nizam-os/jsonapi-core';

import { jsonApi } from './middleware';
import { respond } from './respond';

const PROFILE = 'https://p.test/timestamps';

function app(options?: Parameters<typeof jsonApi>[0]): Hono<JsonApiEnv> {
  const instance = new Hono<JsonApiEnv>();
  instance.use(jsonApi(options));
  instance.get('/state', (c) => c.json(c.get('jsonApi')));
  instance.get('/doc', (c) => respond(c, { meta: { ok: true } }));
  instance.get('/text', (c) => c.text('plain'));
  instance.get('/vary', (c) => {
    c.header('Vary', 'Origin');
    return respond(c, { meta: {} });
  });
  return instance;
}

async function state(
  headers: Record<string, string>,
  options?: Parameters<typeof jsonApi>[0],
): Promise<JsonApiContext> {
  const response = await app(options).request('/state', { headers });
  expect(response.status).toBe(200);
  return (await response.json()) as JsonApiContext;
}

describe('jsonApi', () => {
  it('records what a plain request declared and adds Vary to JSON:API responses', async () => {
    expect(await state({})).toEqual({
      request: { jsonApi: false, extensions: [], profiles: [] },
      extensions: [],
      profiles: [],
    });
    const doc = await app().request('/doc');
    expect(doc.headers.get('vary')).toBe('Accept');
    const text = await app().request('/text');
    expect(text.headers.get('vary')).toBeNull();
    expect(await text.text()).toBe('plain');
  });

  it('merges Vary with what the handler set', async () => {
    const response = await app().request('/vary');
    expect(response.headers.get('vary')).toBe('Origin, Accept');
  });

  it('rejects a JSON:API Content-Type with other parameters with 415', async () => {
    const response = await app().request('/state', {
      headers: { 'content-type': 'application/vnd.api+json; charset=utf-8' },
    });
    expect(response.status).toBe(415);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.api+json',
    );
    expect(response.headers.get('vary')).toBe('Accept');
    const body = (await response.json()) as {
      errors: Array<Record<string, unknown>>;
    };
    expect(body.errors[0]).toMatchObject({
      status: '415',
      code: 'UNSUPPORTED_MEDIA_TYPE',
      source: { header: 'Content-Type' },
    });
  });

  it('rejects an unsupported request extension with 415 and accepts a supported one', async () => {
    const atomic = `application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"`;
    const rejected = await app().request('/state', {
      headers: { 'content-type': atomic },
    });
    expect(rejected.status).toBe(415);
    const accepted = await state(
      { 'content-type': atomic },
      { extensions: [ATOMIC_OPERATIONS_EXTENSION] },
    );
    expect(accepted.request).toMatchObject({
      jsonApi: true,
      extensions: [ATOMIC_OPERATIONS_EXTENSION],
    });
  });

  it('responds 406 when every JSON:API Accept instance is unusable', async () => {
    const other = await app().request('/state', {
      headers: { accept: 'application/vnd.api+json; charset=utf-8' },
    });
    expect(other.status).toBe(406);
    const body = (await other.json()) as {
      errors: Array<Record<string, unknown>>;
    };
    expect(body.errors[0]).toMatchObject({
      status: '406',
      code: 'NOT_ACCEPTABLE',
      source: { header: 'Accept' },
    });
    const unsupported = await app().request('/state', {
      headers: { accept: 'application/vnd.api+json; ext="https://x.test/e"' },
    });
    expect(unsupported.status).toBe(406);
  });

  it('exposes the extensions the response must apply and the supported profiles asked for', async () => {
    const result = await state(
      {
        accept: `application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"; profile="${PROFILE} https://p.test/unknown", application/vnd.api+json;q=0.5`,
      },
      { extensions: [ATOMIC_OPERATIONS_EXTENSION], profiles: [PROFILE] },
    );
    expect(result.extensions).toEqual([ATOMIC_OPERATIONS_EXTENSION]);
    expect(result.profiles).toEqual([PROFILE]);
  });
});
