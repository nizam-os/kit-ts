/**
 * `resourceTypeOf(c)` (resource SPEC 19.6): the type a request's route
 * serves, as the host's error handler reads it: the resource's on its
 * collection, resource, and relationship routes, from before the actor
 * resolves; the target's on a related route; on the operations endpoint,
 * the type of the operation that failed, read as the processor reads it,
 * and none for a type the runtime does not run or a refusal of the whole
 * document; none for a 405. With it, `localizeErrors` labels the member an
 * error points at in the resource's words, on a route and inside an
 * operation.
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 */
import { describe, expect, it } from 'vitest';

import { errorHandler } from '@nizam-os/hono-jsonapi';
import {
  defaultMessages,
  defineMessages,
  localizeErrors,
} from '@nizam-os/resource-core';

import { resourceTypeOf } from './resource-type';
import { testApp } from './test-support/app';
import {
  ATOMIC,
  MISSING,
  TASK,
  postOperations,
  seeded,
} from './test-support/operations';
import { RESOURCES } from './test-support/resources';

const MEDIA_TYPE = 'application/vnd.api+json';

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

const body = (document: unknown) => ({ body: JSON.stringify(document) });

/** The host over the seeded rows, and the type of each request that failed, as its error handler saw it. */
function recording() {
  const types: Array<string | undefined> = [];
  const app = testApp(seeded(), {
    onError: (_error, c) => {
      types.push(resourceTypeOf(c));
    },
  });
  return { app, types };
}

/** The detail of each error object of `response`. */
async function details(response: Response): Promise<Array<unknown>> {
  const { errors } = (await response.json()) as {
    readonly errors: ReadonlyArray<{ readonly detail: unknown }>;
  };
  return errors.map((error) => error.detail);
}

describe('resourceTypeOf on the routes (resource SPEC 19.6)', () => {
  it.each([
    ['a collection', '/api/tasks?sort=nope', as('ada'), 'tasks'],
    [
      'a create',
      '/api/tasks',
      as('ada', {
        method: 'POST',
        ...body({ data: { type: 'tasks', attributes: { title: 5 } } }),
      }),
      'tasks',
    ],
    ['a resource', `/api/tasks/${MISSING}`, as('ada'), 'tasks'],
    ["the actor's refusal", '/api/tasks', as(null), 'tasks'],
    [
      'a relationship link',
      `/api/tasks/${TASK}/relationships/parent`,
      as('ada', {
        method: 'PATCH',
        ...body({ data: { type: 'tasks', id: MISSING } }),
      }),
      'tasks',
    ],
    [
      "a relationship link's 403",
      `/api/tasks/${TASK}/relationships/parent`,
      as('ada', { method: 'POST', ...body({ data: null }) }),
      'tasks',
    ],
    [
      "the target's on a related link",
      `/api/tasks/${TASK}/workspace?fields[workspaces]=nope`,
      as('ada'),
      'workspaces',
    ],
    ['none for a 405', '/api/tasks', as('ada', { method: 'PUT' }), undefined],
  ])('%s', async (_name, path, init, type) => {
    const { app, types } = recording();
    const response = await app.request(path, init);
    expect(response.ok).toBe(false);
    expect(types).toStrictEqual([type]);
  });
});

describe('resourceTypeOf on the operations endpoint (resource SPEC 19.6)', () => {
  const UPDATE = {
    op: 'update',
    ref: { type: 'tasks', id: TASK },
    data: { type: 'tasks', id: TASK, attributes: { title: 'Boot' } },
  };

  it.each([
    [
      "an operation's data, refused before it runs",
      [
        UPDATE,
        { op: 'add', data: { type: 'entrées', attributes: { note: 5 } } },
      ],
      'entrées',
    ],
    [
      'an operation its resource does not declare',
      [UPDATE, { op: 'remove', ref: { type: 'workspaces', id: '1' } }],
      'workspaces',
    ],
    [
      "an operation's href",
      [{ op: 'remove', href: `/api/tasks/${MISSING}` }],
      'tasks',
    ],
    [
      'none for a type the runtime does not run',
      [{ op: 'remove', ref: { type: 'ghosts', id: '1' } }],
      undefined,
    ],
  ])('%s', async (_name, operations, type) => {
    const { app, types } = recording();
    const response = await postOperations(app, operations);
    expect(response.ok).toBe(false);
    expect(types).toStrictEqual([type]);
  });

  it('is none for a refusal of the whole document', async () => {
    const { app, types } = recording();
    const response = await app.request('/api/operations', {
      method: 'POST',
      headers: { 'Content-Type': ATOMIC, 'X-Member': 'ada' },
      body: '{}',
    });
    expect(response.status).toBe(400);
    expect(types).toStrictEqual([undefined]);
  });
});

describe('labels from resourceTypeOf (resource SPEC 19.6, 10.4)', () => {
  const english = defaultMessages(RESOURCES);
  const labeled = defineMessages(
    RESOURCES,
    {},
    {
      ...english,
      validation: {
        ...english.validation,
        type: ({ field, type }) => `${field} must be a ${type}.`,
      },
      fields: {
        ...english.fields,
        tasks: { ...english.fields['tasks'], title: () => 'Task title' },
        entrées: { ...english.fields['entrées'], note: () => 'Entry note' },
      },
    },
  );

  it('label the member an error points at, on a route and inside an operation', async () => {
    const app = testApp(seeded(), {
      handler: errorHandler({
        transform: localizeErrors(labeled, { resource: resourceTypeOf }),
      }),
    });
    const created = await app.request(
      '/api/tasks',
      as('ada', {
        method: 'POST',
        ...body({ data: { type: 'tasks', attributes: { title: 5 } } }),
      }),
    );
    const operated = await postOperations(app, [
      { op: 'add', data: { type: 'tasks', attributes: { title: 'Wire' } } },
      { op: 'add', data: { type: 'entrées', attributes: { note: 5 } } },
    ]);
    expect(await details(created)).toStrictEqual([
      'Task title must be a string.',
    ]);
    expect(await details(operated)).toStrictEqual([
      'Entry note must be a string.',
    ]);
  });

  it('leave a member unlabeled without it', async () => {
    const app = testApp(seeded(), {
      handler: errorHandler({ transform: localizeErrors(labeled) }),
    });
    const response = await app.request(
      '/api/tasks',
      as('ada', {
        method: 'POST',
        ...body({ data: { type: 'tasks', attributes: { title: 5 } } }),
      }),
    );
    expect(await details(response)).toStrictEqual([' must be a string.']);
  });
});
