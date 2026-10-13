/**
 * The relationship routes (resource SPEC 19.3): a relationship link
 * answers the row's linkage and, where the relationship is writable on
 * update, updates it, moving the runtime's refusal to `/data`; an update a
 * relationship does not support answers 403 before the actor; a related
 * link answers the target's resource document, or `null`. The routes
 * exist where the document lists them (SPEC 13.1).
 * @ref https://jsonapi.org/format/1.1/#fetching-relationships-responses-200
 * @ref https://jsonapi.org/format/1.1/#crud-updating-relationship-responses-403
 * @ref https://jsonapi.org/format/1.1/#fetching-resources-responses-200
 */
import type { DeclaredResource } from '@nizam-os/resource-core';

import { describe, expect, it } from 'vitest';

import { createDeclareResource } from '@nizam-os/resource-core';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { testApp } from './test-support/app';
import { memoryRuntime } from './test-support/memory-runtime';
import { RESOURCES } from './test-support/resources';

const MEDIA_TYPE = 'application/vnd.api+json';
const TASK = '0b5a2d4e-6f0c-4f3e-9a1b-2c3d4e5f6a7b';
const CHILD = '2d7c4f6a-8b2e-4b5a-9c3d-4e5f6a7b8c9d';
const OTHER = '1c6b3e5f-7a1d-4a4f-8b2c-3d4e5f6a7b8c';
const MISSING = '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f';

function seeded() {
  return memoryRuntime(RESOURCES, {
    workspaces: [{ id: '1', name: 'One' }],
    tasks: [
      { id: TASK, title: 'Boot', done: false, workspace: '1', parent: null },
      { id: CHILD, title: 'Wire', done: false, workspace: '1', parent: TASK },
      { id: OTHER, title: 'Theirs', done: true, workspace: '2', parent: null },
    ],
  });
}

/** A request of the member `name`, or of no member at all for `null`. */
function as(name: string | null, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      'Content-Type': MEDIA_TYPE,
      ...(name === null ? {} : { 'X-Member': name }),
    },
  };
}

const linkage = (data: unknown) => ({ body: JSON.stringify({ data }) });

describe('GET <relationship link> (resource SPEC 19.3)', () => {
  it("answers the row's linkage with the relationship's links", async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      `/api/tasks/${CHILD}/relationships/parent`,
      as('ada'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(MEDIA_TYPE);
    expect(await response.json()).toEqual({
      jsonapi: { version: '1.1' },
      links: {
        self: `/api/tasks/${CHILD}/relationships/parent`,
        related: `/api/tasks/${CHILD}/parent`,
      },
      data: { type: 'tasks', id: TASK },
    });
    expect(
      runtime.calls.map(({ operation, args }) => [operation, args]),
    ).toEqual([['get', [CHILD]]]);
  });

  it('answers null for a row that links nothing', async () => {
    const response = await testApp(seeded()).request(
      `/api/tasks/${TASK}/relationships/parent`,
      as('ada'),
    );
    expect((await response.json()).data).toBeNull();
  });

  it('answers what the runtime refuses, and the actor first', async () => {
    const app = testApp(seeded());
    const theirs = await app.request(
      `/api/tasks/${OTHER}/relationships/workspace`,
      as('ada'),
    );
    const anonymous = await app.request(
      `/api/tasks/${TASK}/relationships/workspace`,
      as(null),
    );
    expect([theirs.status, anonymous.status]).toEqual([404, 401]);
  });
});

describe('PATCH <relationship link> (resource SPEC 19.3)', () => {
  it('updates the relationship and answers the linkage the server holds', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      `/api/tasks/${TASK}/relationships/parent`,
      as('ada', { method: 'PATCH', ...linkage({ type: 'tasks', id: CHILD }) }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ type: 'tasks', id: CHILD });
    expect(runtime.calls.at(-1)?.args).toEqual([
      TASK,
      { relationships: { parent: { type: 'tasks', id: CHILD } } },
    ]);
  });

  it('clears it with null', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      `/api/tasks/${CHILD}/relationships/parent`,
      as('ada', { method: 'PATCH', ...linkage(null) }),
    );
    expect((await response.json()).data).toBeNull();
    expect(runtime.calls.at(-1)?.args).toEqual([
      CHILD,
      { relationships: { parent: null } },
    ]);
  });

  it("moves the runtime's refusal of the linkage to /data", async () => {
    const response = await testApp(seeded()).request(
      `/api/tasks/${TASK}/relationships/parent`,
      as('ada', {
        method: 'PATCH',
        ...linkage({ type: 'tasks', id: MISSING }),
      }),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).errors).toEqual([
      expect.objectContaining({ source: { pointer: '/data' } }),
    ]);
  });

  it('refuses a linkage of another type before the runtime runs', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      `/api/tasks/${TASK}/relationships/parent`,
      as('ada', {
        method: 'PATCH',
        ...linkage({ type: 'workspaces', id: '1' }),
      }),
    );
    expect(response.status).toBe(409);
    expect(runtime.calls).toEqual([]);
  });

  it('resolves the actor before it reads the document', async () => {
    const response = await testApp(seeded()).request(
      `/api/tasks/${TASK}/relationships/parent`,
      as(null, { method: 'PATCH', body: '{' }),
    );
    expect(response.status).toBe(401);
  });
});

describe('an update the relationship does not support (JSON:API 403)', () => {
  it.each([
    ['PATCH', 'workspace'],
    ['POST', 'parent'],
    ['DELETE', 'parent'],
    ['POST', 'workspace'],
  ])(
    'answers %s on the %s link 403, before the actor',
    async (method, name) => {
      const runtime = seeded();
      const response = await testApp(runtime).request(
        `/api/tasks/${TASK}/relationships/${name}`,
        as(null, { method, ...linkage(null) }),
      );
      expect(response.status).toBe(403);
      expect((await response.json()).errors[0].detail).toBe(
        'The relationship does not support this update',
      );
      expect(runtime.calls).toEqual([]);
    },
  );

  it.each([
    ['parent', 'GET, HEAD, PATCH'],
    ['workspace', 'GET, HEAD'],
  ])(
    'answers any other method on the %s link 405 with %s',
    async (name, allow) => {
      const response = await testApp(seeded()).request(
        `/api/tasks/${TASK}/relationships/${name}`,
        as('ada', { method: 'PUT' }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe(allow);
    },
  );
});

describe('GET <related link> (resource SPEC 19.3)', () => {
  it("answers the target's resource document with its includes", async () => {
    const response = await testApp(seeded()).request(
      `/api/tasks/${CHILD}/parent?include=workspace&fields[tasks]=title,workspace`,
      as('ada'),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      type: 'tasks',
      id: TASK,
      attributes: { title: 'Boot' },
    });
    expect(body.included).toEqual([
      expect.objectContaining({ type: 'workspaces', id: '1' }),
    ]);
  });

  it('answers null for a row that links nothing, without a second get', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      `/api/tasks/${TASK}/parent`,
      as('ada'),
    );
    expect(await response.json()).toEqual({
      jsonapi: { version: '1.1' },
      data: null,
    });
    expect(runtime.calls.map(({ operation }) => operation)).toEqual(['get']);
  });

  it("reads the query as the target's", async () => {
    const response = await testApp(seeded()).request(
      `/api/tasks/${TASK}/workspace?include=parent`,
      as('ada'),
    );
    expect(response.status).toBe(400);
  });

  it('answers any other method 405', async () => {
    const response = await testApp(seeded()).request(
      `/api/tasks/${TASK}/parent`,
      as('ada', { method: 'DELETE' }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});

describe('where the relationship routes exist (resource SPEC 13.1)', () => {
  const declareResource = createDeclareResource({
    catalog: contractFixture.catalog,
    codecs: contractFixture.codecs,
    scopes: { workspace: { column: 'workspace_id' } },
    links: { base: '/api' },
  });
  const Listed: DeclaredResource = declareResource('workspaces', {
    operations: ['list'],
    fields: { name: { access: 'read' } },
  });
  const Linked: DeclaredResource = declareResource('tasks', {
    operations: ['get'],
    scope: 'workspace',
    fields: { title: { access: 'read' } },
    relationships: { workspace_id: { target: () => Listed, access: 'read' } },
  });

  it('serves no related route for a target that does not declare get', async () => {
    const runtime = memoryRuntime([Linked, Listed], {
      tasks: [{ id: TASK, title: 'Boot', workspace: '1' }],
    });
    const app = testApp(runtime);
    const related = await app.request(
      `/api/tasks/${TASK}/workspace`,
      as('ada'),
    );
    const self = await app.request(
      `/api/tasks/${TASK}/relationships/workspace`,
      as('ada'),
    );
    expect([related.status, self.status]).toEqual([404, 200]);
  });

  it('serves none for a resource that does not declare get', async () => {
    const response = await testApp(seeded()).request(
      '/api/entr%C3%A9es/5/relationships/owner',
      as('ada'),
    );
    expect(response.status).toBe(404);
  });
});
