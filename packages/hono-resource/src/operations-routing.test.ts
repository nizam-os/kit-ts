import type { TestEnv } from './test-support/app';

/**
 * How the operations endpoint is served (resource SPEC 19.2, 19.4): at
 * `<base>/operations` when a resource declares a write, answering another
 * method 405 before the actor, then the actor, then the extension's media
 * type and the document; an `href` names what a route serves. A runtime
 * whose routes take the endpoint's path is refused before anything is
 * served.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.5.6
 */
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { errorHandler, jsonApi } from '@nizam-os/hono-jsonapi';
import { createDeclareResource } from '@nizam-os/resource-core';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { jsonApiRoutes } from './routes';
import { memberOf, testApp } from './test-support/app';
import { memoryRuntime } from './test-support/memory-runtime';
import {
  ATOMIC,
  TASK,
  postOperations,
  refusal,
  seeded,
} from './test-support/operations';
import { RESOURCES, Workspaces } from './test-support/resources';

const MEDIA_TYPE = 'application/vnd.api+json';

describe('the operations endpoint (resource SPEC 19.4)', () => {
  it.each(['GET', 'PATCH', 'DELETE', 'PUT'])(
    'answers %s with 405 and Allow: POST, before the actor',
    async (method) => {
      const response = await testApp(seeded()).request('/api/operations', {
        method,
      });
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('POST');
    },
  );

  it('resolves the actor before it reads the document', async () => {
    const response = await testApp(seeded()).request('/api/operations', {
      method: 'POST',
      headers: { 'Content-Type': ATOMIC },
      body: '{',
    });
    expect(await refusal(response)).toEqual([
      401,
      [['UNAUTHORIZED', undefined]],
    ]);
  });

  it('answers 415 for a request without the extension', async () => {
    const response = await testApp(seeded()).request('/api/operations', {
      method: 'POST',
      headers: { 'Content-Type': MEDIA_TYPE, 'X-Member': 'ada' },
      body: JSON.stringify({ 'atomic:operations': [] }),
    });
    expect(response.status).toBe(415);
  });

  it('answers 415 behind a jsonApi() that does not list the extension', async () => {
    const app = new Hono<TestEnv>();
    app.use(jsonApi());
    app.onError(errorHandler());
    app.route('/', jsonApiRoutes({ runtime: seeded(), actor: memberOf }));
    const response = await postOperations(app, [
      { op: 'remove', ref: { type: 'tasks', id: TASK } },
    ]);
    expect(response.status).toBe(415);
  });

  it("answers the processor's 400 for a document it refuses", async () => {
    const app = testApp(seeded());
    const tooMany = Array.from({ length: 11 }, () => ({
      op: 'remove',
      ref: { type: 'tasks', id: TASK },
    }));
    expect(await refusal(await postOperations(app, tooMany))).toEqual([
      400,
      [['INVALID_DOCUMENT', '/atomic:operations']],
    ]);
    expect(
      await refusal(
        await postOperations(app, [{ op: 'remove', href: '/api/projects/1' }]),
      ),
    ).toEqual([400, [['INVALID_DOCUMENT', '/atomic:operations/0/href']]]);
  });

  it('targets the resources, relationships, and collections an href names', async () => {
    const runtime = seeded();
    const response = await postOperations(testApp(runtime), [
      {
        op: 'add',
        href: '/api/entr%C3%A9es',
        data: { type: 'entrées', id: '41', attributes: { note: 'Booted' } },
      },
      {
        op: 'update',
        href: `/api/tasks/${TASK}`,
        data: { type: 'tasks', id: TASK, attributes: { done: true } },
      },
      {
        op: 'update',
        href: `/api/tasks/${TASK}/relationships/parent`,
        data: null,
      },
    ]);
    expect(response.status).toBe(200);
    expect(
      runtime.calls.map(({ type, operation, args }) => [
        type,
        operation,
        args[0],
      ]),
    ).toEqual([
      ['entrées', 'create', expect.objectContaining({ id: '41' })],
      ['tasks', 'update', TASK],
      ['tasks', 'update', TASK],
    ]);
  });

  it('is not served when no resource declares a write', async () => {
    const response = await postOperations(
      testApp(memoryRuntime([Workspaces])),
      [{ op: 'remove', ref: { type: 'workspaces', id: '1' } }],
    );
    expect(response.status).toBe(404);
  });

  it("refuses a resource whose route takes the endpoint's path", () => {
    const declareResource = createDeclareResource({
      catalog: contractFixture.catalog,
      codecs: contractFixture.codecs,
      links: { base: '/api' },
    });
    const Operations = declareResource('logs', {
      as: 'operations',
      operations: ['list'],
      fields: { note: { access: 'read' } },
    });
    expect(() =>
      jsonApiRoutes({
        runtime: memoryRuntime([...RESOURCES, Operations]),
        actor: memberOf,
      }),
    ).toThrow(
      new TypeError('jsonApiRoutes: two routes have the path /api/operations'),
    );
  });
});
