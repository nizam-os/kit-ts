/**
 * Atomic Operations through the built client over HTTP (SPEC 17.5): a
 * person and an article linked to it by its `lid` in one request, each
 * result typed by its operation, the request as the server received it,
 * a `204`, and refusals whose errors point at their operation with
 * nothing committed. The client leaves the cap to the server.
 * @ref https://jsonapi.org/ext/atomic/
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  operationOf,
  operationsOf,
  sendOperations,
} from '@nizam-os/jsonapi-client';

import { refusal, useClientBlog } from './support/clients.ts';
import { Articles, People } from './support/resources.ts';

const ATOMIC = 'https://jsonapi.org/ext/atomic';
const MEDIA_TYPE = `application/vnd.api+json; ext="${ATOMIC}"`;
const NO_DATA = { data: undefined, meta: undefined };

const articles = operationsOf(Articles);
const people = operationsOf(People);

describe('client operations', () => {
  const blog = useClientBlog();

  it('creates a person and an article linked to it by its lid, each result typed by its operation', async () => {
    const { status, results, jsonapi } = await sendOperations(
      blog.transport(),
      [
        people.create({ lid: 'ada', attributes: { name: 'Ada' } }),
        articles.create({
          attributes: { title: 'Linked' },
          relationships: { author: { type: 'people', lid: 'ada' } },
        }),
        articles.addToRelationship('1', 'tags', ['t3']),
      ],
    );

    expect(status).toBe(200);
    expect(jsonapi).toEqual({ version: '1.1', ext: [ATOMIC] });
    const [person, article, tagged] = results;
    expect(person.data).toMatchObject({
      type: 'people',
      id: '6',
      name: 'Ada',
      twitter: null,
    });
    expect(article.data).toMatchObject({
      type: 'articles',
      id: '7',
      title: 'Linked',
      body: '',
      author: { type: 'people', id: '6' },
    });
    expect(tagged).toEqual(NO_DATA);
    expect(blog.store().articles.get('7')?.authorId).toBe('6');
    expect(blog.store().articles.get('1')?.tagIds).toEqual(['t1', 't2', 't3']);

    const sent = blog.arrivals().at(-1);
    expect(sent?.method).toBe('POST');
    expect(sent?.target).toBe('/operations');
    expect(sent?.headers.get('content-type')).toBe(MEDIA_TYPE);
    expect(sent?.headers.get('accept')).toBe(MEDIA_TYPE);
    expect(JSON.parse(sent?.body ?? '')).toEqual({
      'atomic:operations': [
        {
          op: 'add',
          data: { type: 'people', lid: 'ada', attributes: { name: 'Ada' } },
        },
        {
          op: 'add',
          data: {
            type: 'articles',
            attributes: { title: 'Linked' },
            relationships: {
              author: { data: { type: 'people', lid: 'ada' } },
            },
          },
        },
        {
          op: 'add',
          ref: { type: 'articles', id: '1', relationship: 'tags' },
          data: [{ type: 'tags', id: 't3' }],
        },
      ],
    });

    expectTypeOf(person.data?.name).toEqualTypeOf<string | undefined>();
    expectTypeOf(article.data?.title).toEqualTypeOf<string | undefined>();
    expectTypeOf(tagged.data).toEqualTypeOf<undefined>();
  });

  it('answers 204 when no result holds data, every result empty', async () => {
    const { status, results } = await sendOperations(blog.transport(), [
      articles.setRelationship('2', 'author', null),
      articles.remove('3'),
    ]);

    expect(status).toBe(204);
    expect(results).toEqual([NO_DATA, NO_DATA]);
    expect(blog.store().articles.get('2')?.authorId).toBeNull();
    expect(blog.store().articles.has('3')).toBe(false);
  });

  it.each([
    {
      refused: 'a member of an operation',
      operations: [
        people.create({ lid: 'grace', attributes: { name: 'Grace' } }),
        articles.create({
          attributes: { title: '' },
          relationships: { author: { type: 'people', lid: 'grace' } },
        }),
      ],
      message: 'people, articles operations answered 422',
      errors: [
        ['VALIDATION_FAILED', { index: 1, pointer: '/data/attributes/title' }],
      ],
    },
    {
      refused: 'an operation',
      operations: [
        articles.update('1', { attributes: { title: 'Renamed' } }),
        articles.remove('404'),
      ],
      message: 'articles operations answered 404',
      errors: [['NOT_FOUND', { index: 1, pointer: '' }]],
    },
  ])(
    'rejects a refusal of $refused, its errors pointing at the operation, the operations before it rolled back',
    async ({ operations, message, errors }) => {
      const before = blog.store().snapshot();
      const rollbacks = blog.store().rollbacks;

      const error = await refusal(sendOperations(blog.transport(), operations));

      expect(error.message).toBe(message);
      expect(
        error.errors.map((object) => [object.code, operationOf(object)]),
      ).toEqual(errors);
      expect(blog.store().snapshot()).toEqual(before);
      expect(blog.store().rollbacks).toBe(rollbacks + 1);
    },
  );

  it('leaves the cap to the server, which refuses a request over it at the list', async () => {
    const before = blog.store().snapshot();
    const over = Array.from({ length: Articles.atomic.max + 1 }, () =>
      articles.remove('1'),
    );

    const error = await refusal(sendOperations(blog.transport(), over));

    expect(error.status).toBe(400);
    expect(
      error.errors.map((object) => [
        object.source?.pointer,
        operationOf(object),
      ]),
    ).toEqual([['/atomic:operations', undefined]]);
    expect(blog.store().snapshot()).toEqual(before);
  });

  it('refuses what it cannot send before sending anything', async () => {
    const before = blog.arrivals().length;

    // A bulk action over no selection is the empty list a screen can make.
    await expect(sendOperations(blog.transport(), [])).rejects.toThrow(
      new TypeError(
        'sendOperations: operations must be a non-empty list of operations',
      ),
    );
    await expect(
      // @ts-expect-error -- a plain object is no operation
      sendOperations(blog.transport(), [articles.remove('1'), {}]),
    ).rejects.toThrow(
      new TypeError(
        'sendOperations: operations[1] is not an operation of operationsOf',
      ),
    );
    expect(blog.arrivals()).toHaveLength(before);
  });
});
