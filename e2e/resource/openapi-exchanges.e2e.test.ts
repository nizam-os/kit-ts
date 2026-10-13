/**
 * The contacts application's API answers as its OpenAPI document says
 * (resource SPEC 13.1): over Hono and `@nizam-os/hono-jsonapi`, with the
 * runtime on PGlite behind every route, each answer's status, media type,
 * body, and `Location` conform to the document (`support/api-session.ts`):
 * a page filtered, searched, sorted, sparse, and followed to the next; a
 * contact with its organization included; a create, an update, and a
 * remove; and a call stored in a partition under the client's id. Each
 * request document passes the operation's request body schema.
 */
import type { ApiSession } from './support/api-session.ts';
import type { Sent } from './support/http.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ADA, ARCHIVED } from './runtime/seed.ts';
import { APP_CONTRACT, openApiSession } from './support/api-session.ts';

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const CALL = '00000000-0000-4000-8000-00000000c001';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A member of the body, by path. */
function member(sent: Sent, ...path: ReadonlyArray<string | number>): unknown {
  let node: unknown = sent.body;
  for (const key of path) {
    node =
      Array.isArray(node) || isRecord(node)
        ? (node as Record<string | number, unknown>)[key]
        : undefined;
  }
  return node;
}

function ids(sent: Sent): Array<unknown> {
  const data = member(sent, 'data');
  return Array.isArray(data)
    ? data.map((item: unknown) => (isRecord(item) ? item['id'] : undefined))
    : [];
}

describe('the API answers as its OpenAPI document says', () => {
  let session: ApiSession;

  beforeAll(async () => {
    session = await openApiSession();
  });
  beforeEach(async () => {
    await session.database.reset();
  });
  afterAll(async () => {
    await session.database.close();
  });

  it('pages contacts filtered, sorted, and sparse, and follows the next link', async () => {
    const query = [
      'filter[status][in]=active',
      'filter[status][in]=archived',
      'sort=-priority,name',
      'page[size]=1',
      'fields[contacts]=name,email,priority',
    ].join('&');
    const first = await session.exchange(
      'get',
      '/api/contacts',
      `/api/contacts?${query}`,
      {
        actor: 'viewer',
      },
    );
    expect(first.status).toBe(OK);
    expect(ids(first)).toHaveLength(1);
    const next = member(first, 'links', 'next');
    expect(typeof next).toBe('string');
    const second = await session.exchange(
      'get',
      '/api/contacts',
      String(next),
      { actor: 'viewer' },
    );
    expect(second.status).toBe(OK);
    expect(ids(second)).toHaveLength(1);
    expect(ids(second)).not.toEqual(ids(first));
  });

  it('searches and filters an array, a decimal, and a timestamp', async () => {
    const query = [
      'filter[q]=ada',
      'filter[tags][overlaps]=vip',
      'filter[priority][gte]=1',
      'filter[createdAt][lt]=2999-01-01T00:00:00Z',
    ].join('&');
    const sent = await session.exchange(
      'get',
      '/api/contacts',
      `/api/contacts?${query}`,
      {
        actor: 'viewer',
      },
    );
    expect(sent.status).toBe(OK);
  });

  it('includes the organizations of a page for a member who may read them', async () => {
    const sent = await session.exchange(
      'get',
      '/api/contacts',
      '/api/contacts?include=organization',
      {
        actor: 'manager',
      },
    );
    expect(sent.status).toBe(OK);
    expect(member(sent, 'included', 0, 'type')).toBe('organizations');
  });

  it('gets a contact with its organization, each sparse', async () => {
    const query =
      'include=organization&fields[contacts]=name,organization&fields[organizations]=name';
    const sent = await session.exchange(
      'get',
      '/api/contacts/{id}',
      `/api/contacts/${ADA}?${query}`,
      {
        actor: 'manager',
      },
    );
    expect(sent.status).toBe(OK);
    expect(member(sent, 'data', 'attributes')).toEqual({ name: 'Ada' });
    expect(member(sent, 'included', 0, 'attributes')).toEqual({ name: 'Acme' });
  });

  it("creates a contact, answering 201 with the created resource's Location", async () => {
    const body = {
      data: {
        type: 'contacts',
        attributes: {
          name: 'Bea',
          email: 'bea@example.com',
          website: 'https://bea.example',
          priority: 3,
          discount: '12.50',
          tags: ['vip'],
        },
      },
    };
    expect(APP_CONTRACT.request('post', '/api/contacts', body)).toEqual([]);
    const sent = await session.exchange(
      'post',
      '/api/contacts',
      '/api/contacts',
      {
        actor: 'editor',
        body,
      },
    );
    expect(sent.status).toBe(CREATED);
    expect(sent.headers.get('Location')).toBe(
      member(sent, 'data', 'links', 'self'),
    );
  });

  it('updates a contact', async () => {
    const body = {
      data: {
        type: 'contacts',
        id: ADA,
        attributes: { nickname: 'Countess', priority: null },
      },
    };
    expect(APP_CONTRACT.request('patch', '/api/contacts/{id}', body)).toEqual(
      [],
    );
    const sent = await session.exchange(
      'patch',
      '/api/contacts/{id}',
      `/api/contacts/${ADA}`,
      {
        actor: 'editor',
        body,
      },
    );
    expect(sent.status).toBe(OK);
    expect(member(sent, 'data', 'attributes', 'nickname')).toBe('Countess');
  });

  it('removes a contact nothing references, answering 204 without a body', async () => {
    const sent = await session.exchange(
      'delete',
      '/api/contacts/{id}',
      `/api/contacts/${ARCHIVED}`,
      {
        actor: 'editor',
      },
    );
    expect(sent.status).toBe(NO_CONTENT);
    expect(sent.body).toBeUndefined();
  });

  it("creates a call in a partition under the client's id, and gets it", async () => {
    const body = {
      data: {
        type: 'calls',
        id: CALL,
        attributes: { minutes: 12, note: 'Introduced the plan.' },
        relationships: { contact: { data: { type: 'contacts', id: ADA } } },
      },
    };
    expect(APP_CONTRACT.request('post', '/api/calls', body)).toEqual([]);
    const created = await session.exchange('post', '/api/calls', '/api/calls', {
      actor: 'editor',
      body,
    });
    expect(created.status).toBe(CREATED);
    const got = await session.exchange(
      'get',
      '/api/calls/{id}',
      `/api/calls/${CALL}`,
      {
        actor: 'viewer',
      },
    );
    expect(got.status).toBe(OK);
    expect(member(got, 'data', 'relationships', 'contact', 'data')).toEqual({
      type: 'contacts',
      id: ADA,
    });
  });
});
