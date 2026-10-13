/**
 * Writes through the built client over HTTP (SPEC 15.4): the documents a
 * create and an update send, as the server parses and stores them, the
 * records read back from 201 and 200, a remove's 204, and a write the
 * types refuse, answered 403 by the server all the same.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import { isResponseError } from '@nizam-os/jsonapi-client';

import { refusal, useClientBlog } from './support/clients.ts';

describe('client writes', () => {
  const blog = useClientBlog();

  it('creates from attributes and relationships given as an id, an identifier, and a record', async () => {
    const { articles } = blog.clients();
    const tagged = await articles.get('1', { include: ['tags'] });
    const json = tagged.data.tags?.[0];
    if (json === undefined) {
      throw new TypeError('article 1 has its tags');
    }

    const created = await articles.create({
      attributes: { title: 'Typed clients' },
      relationships: {
        author: '2',
        tags: ['t3', { type: 'tags', id: 't2' }, json],
      },
    });

    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({
      type: 'articles',
      id: '6',
      title: 'Typed clients',
      body: '',
      createdAt: '2026-02-01T00:00:00Z',
      author: { type: 'people', id: '2' },
      tags: [
        { type: 'tags', id: 't3' },
        { type: 'tags', id: 't2' },
        { type: 'tags', id: 't1' },
      ],
    });
    // A record passed as an identifier sends its type and id alone.
    const sent = blog.arrivals().at(-1);
    expect(sent?.method).toBe('POST');
    expect(JSON.parse(sent?.body ?? '')).toEqual({
      data: {
        type: 'articles',
        attributes: { title: 'Typed clients' },
        relationships: {
          author: { data: { type: 'people', id: '2' } },
          tags: {
            data: [
              { type: 'tags', id: 't3' },
              { type: 'tags', id: 't2' },
              { type: 'tags', id: 't1' },
            ],
          },
        },
      },
    });
    expect(blog.store().articles.get('6')).toMatchObject({
      authorId: '2',
      tagIds: ['t3', 't2', 't1'],
    });

    expectTypeOf(created.data?.title).toEqualTypeOf<string | undefined>();
  });

  it('updates the attributes sent and keeps the rest', async () => {
    const updated = await blog
      .clients()
      .articles.update('6', { attributes: { body: 'Generated from nothing' } });

    expect(updated.status).toBe(200);
    expect(updated.data).toMatchObject({
      id: '6',
      title: 'Typed clients',
      body: 'Generated from nothing',
    });
    expect(JSON.parse(blog.arrivals().at(-1)?.body ?? '')).toEqual({
      data: {
        type: 'articles',
        id: '6',
        attributes: { body: 'Generated from nothing' },
      },
    });
  });

  it('removes a resource with a 204 and no data, after which it reads as 404', async () => {
    const { articles } = blog.clients();
    const removed = await articles.remove('6');

    expect(removed).toEqual({
      status: 204,
      data: undefined,
      links: undefined,
      meta: undefined,
      jsonapi: undefined,
    });
    const gone = await refusal(articles.get('6'));
    expect(gone.status).toBe(404);
    expect(isResponseError(gone, 'NOT_FOUND')).toBe(true);
    expect(gone.errors[0]?.detail).toBe('Article 6 does not exist');
  });

  it('refuses in the types what the server refuses with 403: a member the write does not take', async () => {
    const { articles } = blog.clients();
    const refused = await refusal(
      articles.create({
        attributes: {
          title: 'Backdated',
          // @ts-expect-error -- the server stamps createdAt
          createdAt: '2020-01-01T00:00:00Z',
        },
      }),
    );

    expect(refused.status).toBe(403);
    expect(isResponseError(refused, 'FORBIDDEN')).toBe(true);
    expect(refused.errors[0]?.source).toEqual({
      pointer: '/data/attributes/createdAt',
    });
    expect(blog.store().articles.size).toBe(5);
  });
});
