/**
 * A collection's routes (resource SPEC 19.3): `GET` hands `list` the
 * query as `keysetRequest` turns it into the keyset's request, adds each
 * include, and answers the page; `POST` hands `create` the parsed
 * document and answers 201 with `Location`. The query and the document
 * are refused before the runtime runs, and the actor before either is
 * read.
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 * @ref https://jsonapi.org/format/1.1/#crud-creating-responses-201
 */
import { describe, expect, it } from 'vitest';

import { parseQuery } from '@nizam-os/hono-jsonapi';
import { keysetRequest } from '@nizam-os/resource-core/server';

import { testApp } from './test-support/app';
import { memoryRuntime } from './test-support/memory-runtime';
import { RESOURCES, Tasks } from './test-support/resources';

const MEDIA_TYPE = 'application/vnd.api+json';
const TASK = '0b5a2d4e-6f0c-4f3e-9a1b-2c3d4e5f6a7b';
const OTHER = '1c6b3e5f-7a1d-4a4f-8b2c-3d4e5f6a7b8c';

/** The tests' rows: a task in each workspace and both workspaces. */
function seeded() {
  return memoryRuntime(RESOURCES, {
    workspaces: [
      { id: '1', name: 'One' },
      { id: '2', name: 'Two' },
    ],
    tasks: [
      { id: TASK, title: 'Boot', done: false, workspace: '1', parent: null },
      { id: OTHER, title: 'Theirs', done: true, workspace: '2', parent: null },
    ],
  });
}

function as(
  name: string,
  init: Omit<RequestInit, 'headers'> = {},
): RequestInit {
  return {
    ...init,
    headers: { 'X-Member': name, 'Content-Type': MEDIA_TYPE },
  };
}

describe('GET <collection> (resource SPEC 19.3)', () => {
  it('lists the rows the actor sees, handing list the keyset request of the query and its filter parameters', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      '/api/tasks?filter[title][eq]=Boot&sort=-title',
      as('ada'),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      data: [
        {
          type: 'tasks',
          id: TASK,
          attributes: { title: 'Boot', done: false },
          relationships: {
            workspace: { data: { type: 'workspaces', id: '1' } },
          },
          links: { self: `/api/tasks/${TASK}` },
        },
      ],
    });
    expect(body).not.toHaveProperty('included');
    const [call] = runtime.calls;
    expect(call?.operation).toBe('list');
    expect(call?.actor.id).toBe('ada');
    expect(call?.args[0]).toEqual(
      keysetRequest(
        Tasks,
        parseQuery(Tasks.resource, 'filter[title][eq]=Boot&sort=-title'),
      ),
    );
    expect(call?.args).toEqual([
      {
        sort: [{ field: 'title', direction: 'desc' }],
        filter: { field: 'title', op: 'eq', value: 'Boot' },
        page: { size: 20 },
      },
      { parameters: [{ path: [], parameter: 'filter[title][eq]' }] },
    ]);
  });

  it('adds each include as the target resource objects, through include', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      '/api/tasks?include=workspace',
      as('ada'),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      included: [{ type: 'workspaces', id: '1', attributes: { name: 'One' } }],
    });
    expect(runtime.calls.map((call) => call.operation)).toEqual([
      'list',
      'include',
    ]);
    expect(runtime.calls[1]?.args[0]).toBe('workspace');
  });

  it('answers what the include refused with, as its policy decides', async () => {
    const response = await testApp(seeded()).request(
      '/api/tasks?include=workspace',
      as('grace'),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      errors: [{ code: 'FORBIDDEN' }],
    });
  });

  it('refuses a query the declaration does not serve before the runtime runs', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      '/api/tasks?sort=done',
      as('ada'),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      errors: [{ code: 'UNSUPPORTED_SORT', source: { parameter: 'sort' } }],
    });
    expect(runtime.calls).toEqual([]);
  });

  it('answers the refusal of the actor whatever else is wrong with the request', async () => {
    const response = await testApp(seeded()).request('/api/tasks?sort=done');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      errors: [{ code: 'UNAUTHORIZED' }],
    });
  });
});

describe('POST <collection> (resource SPEC 19.3)', () => {
  it('creates the row from the parsed document and answers 201 with Location', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      '/api/tasks',
      as('ada', {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'tasks',
            attributes: { title: 'Ship', done: false },
            relationships: { parent: { data: { type: 'tasks', id: TASK } } },
          },
        }),
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      data: {
        type: 'tasks',
        attributes: { title: 'Ship', done: false },
        relationships: {
          workspace: { data: { type: 'workspaces', id: '1' } },
          parent: { data: { type: 'tasks', id: TASK } },
        },
      },
    });
    expect(response.headers.get('Location')).toBe(`/api/tasks/${body.data.id}`);
    expect(runtime.calls[0]?.args[0]).toEqual({
      type: 'tasks',
      attributes: { title: 'Ship', done: false },
      relationships: { parent: { type: 'tasks', id: TASK } },
    });
  });

  it('creates with a client id where the declaration takes one, at a type outside ASCII', async () => {
    const response = await testApp(seeded()).request(
      '/api/entr%C3%A9es',
      as('ada', {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'entrées',
            id: '7',
            attributes: { note: 'Booted' },
            relationships: { owner: { data: { type: 'workspaces', id: '1' } } },
          },
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe('/api/entr%C3%A9es/7');
  });

  it('refuses a document the declaration does not accept before the runtime runs, at its pointer', async () => {
    const runtime = seeded();
    const response = await testApp(runtime).request(
      '/api/tasks',
      as('ada', {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'tasks',
            attributes: { title: 'Ship' },
            relationships: {
              workspace: { data: { type: 'workspaces', id: '2' } },
            },
          },
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      errors: [
        {
          code: 'FORBIDDEN',
          source: { pointer: '/data/relationships/workspace' },
        },
      ],
    });
    expect(runtime.calls).toEqual([]);
  });

  it('answers the refusal of the actor before it reads the document', async () => {
    const response = await testApp(seeded()).request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': MEDIA_TYPE },
      body: '{',
    });
    expect(response.status).toBe(401);
  });
});
