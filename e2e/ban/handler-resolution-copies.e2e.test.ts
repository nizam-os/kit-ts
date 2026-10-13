import type * as BanCore from '@nizam-os/ban-core';

import type { RunningServer } from './support/server';

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BanError, isBanError } from '@nizam-os/ban-core';
import { createBan } from '@nizam-os/hono-ban';

import { startServer } from './support/server';

/**
 * Errors of another copy of `@nizam-os/ban-core` over real HTTP (ban ADR 0019, SPEC 4): the built
 * package copied to another directory, as a package manager nests a second copy, is a second
 * module instance with classes of its own, and the built `@nizam-os/hono-ban` handler answers what
 * that copy builds with its own status, code, and items.
 * @ref https://nodejs.org/api/esm.html#urls (a module is identified by its URL)
 */
const COPY = await mkdtemp(join(tmpdir(), 'ban-copy-'));
await cp(
  dirname(createRequire(import.meta.url).resolve('@nizam-os/ban-core')),
  COPY,
  { recursive: true },
);
const href = pathToFileURL(join(COPY, 'index.js')).href;
const copy = (await import(
  // A path known only at run time; Vite leaves the import to Node.
  /* @vite-ignore */
  href
)) as typeof BanCore;
const theirs = copy.createBan({
  errors: { ORDER_CONFLICT: { status: 409, title: 'Order Conflict' } },
});

const app = new Hono();
app.onError(createBan().onError());
app.get('/missing', () => {
  throw theirs.notFound('The order does not exist');
});
app.get('/conflict', () => {
  throw theirs.ORDER_CONFLICT({ detail: 'The order changed meanwhile' });
});
app.get('/invalid', () => {
  throw theirs.unprocessableEntity({
    detail: 'The order cannot be placed',
    errors: [{ detail: 'Must be positive', path: ['quantity'] }],
  });
});

let server: RunningServer;
beforeAll(async () => {
  server = await startServer(app);
});
afterAll(async () => {
  await server.close();
  await rm(COPY, { recursive: true, force: true });
});

describe('an error of another copy of @nizam-os/ban-core', () => {
  it('comes from a second module instance, and is a BanError to this one', () => {
    const error = theirs.notFound();
    expect(copy.BanError).not.toBe(BanError);
    expect(isBanError(error)).toBe(true);
    expect(error instanceof BanError).toBe(true);
  });

  it('answers with its catalog status and detail', async () => {
    const response = await server.fetch('/missing');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      status: 404,
      title: 'Not Found',
      detail: 'The order does not exist',
      instance: '/missing',
    });
  });

  it('answers with a code of its own catalog', async () => {
    const response = await server.fetch('/conflict');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      status: 409,
      title: 'Order Conflict',
      detail: 'The order changed meanwhile',
    });
  });

  it('answers with its items', async () => {
    const response = await server.fetch('/invalid');
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      errors: [{ detail: 'Must be positive', pointer: '/quantity' }],
    });
  });
});
