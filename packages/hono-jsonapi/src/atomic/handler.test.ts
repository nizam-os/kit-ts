import type { Context } from 'hono';

import type { AnyResourceHandlers } from '@nizam-os/jsonapi-core/atomic';

import type { JsonApiEnv } from '../types';

import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ATOMIC_OPERATIONS_EXTENSION,
  jsonApiError,
  defineResource,
} from '@nizam-os/jsonapi-core';

import { errorHandler } from '../handlers';
import { jsonApi } from '../middleware';
import { atomicOperations } from './handler';

interface TagRow {
  readonly id: string;
  readonly name: string;
}

/** A store whose transaction is a snapshot of the one table. */
class Store {
  public tags: Map<string, TagRow> = new Map([
    ['t1', { id: 't1', name: 'one' }],
  ]);
  public nextId = 1;
  public rollbacks = 0;

  public id(): string {
    const id = String(this.nextId);
    this.nextId += 1;
    return id;
  }

  public snapshot(): Map<string, TagRow> {
    return new Map(this.tags);
  }

  public restore(snapshot: Map<string, TagRow>): void {
    this.tags = snapshot;
    this.rollbacks += 1;
  }
}

const Tags = defineResource({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: TagRow) => ({ id: row.id, attributes: { name: row.name } }),
});

// The Hono context reaches handlers as `ctx`: the name comes from a header.
const tags: AnyResourceHandlers<Store, Context<JsonApiEnv>> = {
  resource: Tags,
  create: (_input, { tx, ctx }) => {
    const row: TagRow = { id: tx.id(), name: ctx.req.header('x-name') ?? '' };
    tx.tags.set(row.id, row);
    return row;
  },
  remove: ({ id }, { tx }) => {
    if (id === 'boom') {
      throw new Error('disk on fire');
    }
    if (!tx.tags.delete(id)) {
      throw jsonApiError('NOT_FOUND', {
        detail: `Tag "${id}" does not exist`,
      });
    }
  },
};

const ATOMIC_MEDIA_TYPE = `application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"`;

function createApp(store: Store): Hono<JsonApiEnv> {
  const app = new Hono<JsonApiEnv>();
  app.use(jsonApi({ extensions: [ATOMIC_OPERATIONS_EXTENSION] }));
  app.onError(errorHandler());
  app.all(
    '/operations',
    atomicOperations<Store, JsonApiEnv>({
      resources: [tags],
      transaction: async (_c, run) => {
        const snapshot = store.snapshot();
        try {
          return await run(store);
        } catch (error) {
          store.restore(snapshot);
          throw error;
        }
      },
    }),
  );
  return app;
}

interface Reply {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

interface PostInit {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly raw?: string;
}

async function post(
  app: Hono<JsonApiEnv>,
  operations: ReadonlyArray<unknown>,
  init: PostInit = {},
): Promise<Reply> {
  const method = init.method ?? 'POST';
  const response = await app.request('/operations', {
    method,
    headers: { 'content-type': ATOMIC_MEDIA_TYPE, ...init.headers },
    ...(method === 'GET'
      ? {}
      : {
          body: init.raw ?? JSON.stringify({ 'atomic:operations': operations }),
        }),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text === '' ? undefined : (JSON.parse(text) as unknown),
  };
}

interface Errors {
  readonly errors: Array<Record<string, unknown>>;
}

let store: Store;

beforeEach(() => {
  store = new Store();
});

describe('atomicOperations: request requirements', () => {
  it('answers 405 with Allow: POST to any other method', async () => {
    const { status, headers, body } = await post(createApp(store), [], {
      method: 'GET',
    });
    expect(status).toBe(405);
    expect(headers.get('allow')).toBe('POST');
    expect(headers.get('content-type')).toBe('application/vnd.api+json');
    expect((body as Errors).errors[0]).toMatchObject({
      status: '405',
      code: 'METHOD_NOT_ALLOWED',
      title: 'Method Not Allowed',
    });
  });

  it('answers 415 when Content-Type does not declare the extension', async () => {
    const { status, body } = await post(createApp(store), [], {
      headers: { 'content-type': 'application/vnd.api+json' },
    });
    expect(status).toBe(415);
    expect((body as Errors).errors[0]?.['detail']).toContain('ext=');
  });

  it('answers 400 to a body that is not JSON', async () => {
    const { status, body } = await post(createApp(store), [], { raw: '{' });
    expect(status).toBe(400);
    expect((body as Errors).errors[0]?.['code']).toBe('MALFORMED_JSON');
  });
});

describe('atomicOperations: responses', () => {
  it('sends atomic:results with the extension on Content-Type and Vary: Accept, handing handlers the Hono context', async () => {
    const { status, headers, body } = await post(
      createApp(store),
      [{ op: 'add', data: { type: 'tags', attributes: {} } }],
      { headers: { 'x-name': 'from the request' } },
    );
    expect(status).toBe(200);
    expect(headers.get('content-type')).toBe(ATOMIC_MEDIA_TYPE);
    expect(headers.get('vary')).toBe('Accept');
    expect(body).toEqual({
      jsonapi: { version: '1.1', ext: [ATOMIC_OPERATIONS_EXTENSION] },
      'atomic:results': [
        {
          data: {
            type: 'tags',
            id: '1',
            attributes: { name: 'from the request' },
          },
        },
      ],
    });
  });

  it('answers 204 with no body when no operation returned data', async () => {
    const { status, headers, body } = await post(createApp(store), [
      { op: 'remove', ref: { type: 'tags', id: 't1' } },
    ]);
    expect(status).toBe(204);
    expect(body).toBeUndefined();
    expect(headers.get('content-type')).toBeNull();
    expect(store.tags.size).toBe(0);
  });

  it('renders an error from an operation with its status and pointer, after the rollback', async () => {
    const { status, body } = await post(createApp(store), [
      { op: 'add', data: { type: 'tags', attributes: {} } },
      { op: 'remove', ref: { type: 'tags', id: 'nope' } },
    ]);
    expect(status).toBe(404);
    expect((body as Errors).errors[0]).toMatchObject({
      code: 'NOT_FOUND',
      detail: 'Tag "nope" does not exist',
      source: { pointer: '/atomic:operations/1' },
    });
    expect(store.tags.size).toBe(1);
    expect(store.rollbacks).toBe(1);
  });

  it('lets other errors reach app.onError after the rollback', async () => {
    const { status, body } = await post(createApp(store), [
      { op: 'add', data: { type: 'tags', attributes: {} } },
      { op: 'remove', ref: { type: 'tags', id: 'boom' } },
    ]);
    expect(status).toBe(500);
    expect((body as Errors).errors[0]?.['code']).toBe('INTERNAL_SERVER_ERROR');
    expect(store.tags.size).toBe(1);
    expect(store.rollbacks).toBe(1);
  });
});
