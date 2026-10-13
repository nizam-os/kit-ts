/**
 * `operationsMutation` (SPEC 17.4) through query-core's `QueryClient` and
 * the `MutationObserver` every adapter's `useMutation` is made of: every
 * operation in one request, pending until the reads a screen shows of
 * each type written have refetched, the removed records' entries removed
 * first, the keys `invalidates` names, a refused request that invalidates
 * nothing, and the `TypeError`s.
 */
import type { Transport } from '@nizam-os/jsonapi-client';

import { MutationObserver } from '@tanstack/query-core';
import { describe, expect, it, vi } from 'vitest';

import {
  isResponseError,
  operationOf,
  operationsOf,
} from '@nizam-os/jsonapi-client';

import { operationsMutation } from './operations';
import { resourceQueries } from './queries';
import { Articles, People } from './test-support/blog';
import { article, blogApi, held, ok } from './test-support/fetch-double';
import { sent, showing, titles } from './test-support/screens';

const articles = operationsOf(Articles);
const people = operationsOf(People);
const ARRAYS = article('1', 'Arrays');
const BYTES = article('2', 'Bytes');
const ADA = { type: 'people', id: '9', attributes: { name: 'Ada' } };
const NOT_FOUND = { status: 404, document: { errors: [{ status: '404' }] } };

describe('operationsMutation (SPEC 17.4)', () => {
  it('sends every operation in one request, pending until the reads a screen shows of each type written have refetched', async () => {
    const refetched = held();
    const { clients, transport, arrivals, queryClient } = blogApi(
      async (arrival) => {
        if (arrival.method === 'POST') {
          return {
            status: 200,
            document: {
              'atomic:results': [
                { data: article('1', 'Arrays and Lists') },
                { data: ADA },
              ],
            },
          };
        }
        if (arrival.target === '/api/people') {
          return arrivals.length > 2 ? refetched.answer : ok([]);
        }
        return ok([ARRAYS]);
      },
    );
    await showing(queryClient, resourceQueries(clients.articles).list());
    const shown = await showing(
      queryClient,
      resourceQueries(clients.people).list(),
    );
    const mutation = new MutationObserver(
      queryClient,
      operationsMutation(transport),
    );
    const sending = mutation.mutate([
      articles.update('1', { attributes: { title: 'Arrays and Lists' } }),
      people.create({ attributes: { name: 'Ada' } }),
    ]);
    await vi.waitFor(() => {
      expect(sent(arrivals).slice(2).toSorted()).toEqual([
        'GET /api/articles',
        'GET /api/people',
        'POST /api/operations',
      ]);
    });
    expect(arrivals[2]?.body).toEqual({
      'atomic:operations': [
        {
          op: 'update',
          data: {
            type: 'articles',
            id: '1',
            attributes: { title: 'Arrays and Lists' },
          },
        },
        { op: 'add', data: { type: 'people', attributes: { name: 'Ada' } } },
      ],
    });
    expect(mutation.getCurrentResult().isPending).toBe(true);
    refetched.release(ok([ADA]));
    await expect(sending).resolves.toMatchObject({
      status: 200,
      results: [
        { data: { id: '1', title: 'Arrays and Lists' } },
        { data: { id: '9', name: 'Ada' } },
      ],
    });
    expect(shown.getCurrentResult().data.data).toHaveLength(1);
    expect(arrivals).toHaveLength(5);
  });

  it("removes each removed record's entries before the reads refetch, and keeps a record whose relationship loses a member", async () => {
    let removed = false;
    const { clients, transport, arrivals, queryClient } = blogApi((arrival) => {
      if (arrival.method === 'POST') {
        removed = true;
        return { status: 204 };
      }
      if (arrival.target === '/api/articles') {
        return ok(removed ? [BYTES] : [ARRAYS, BYTES]);
      }
      if (arrival.target === '/api/articles/2') {
        return ok(BYTES);
      }
      return removed ? NOT_FOUND : ok(ARRAYS);
    });
    const queries = resourceQueries(clients.articles);
    const list = await showing(queryClient, queries.list());
    const record = await showing(queryClient, queries.get('1'));
    await showing(queryClient, queries.get('2'));
    await new MutationObserver(
      queryClient,
      operationsMutation(transport),
    ).mutate([
      articles.remove('1'),
      articles.removeFromRelationship('2', 'tags', ['t1']),
    ]);
    expect(sent(arrivals).slice(0, 4)).toEqual([
      'GET /api/articles',
      'GET /api/articles/1',
      'GET /api/articles/2',
      'POST /api/operations',
    ]);
    expect(sent(arrivals).slice(4).toSorted()).toEqual([
      'GET /api/articles',
      'GET /api/articles/2',
    ]);
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['articles', 'get', '1'] }),
    ).toEqual([]);
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['articles', 'get', '2'] }),
    ).toHaveLength(1);
    expect(titles(list.getCurrentResult())).toEqual(['Bytes']);
    expect(record.getCurrentResult().isError).toBe(false);
  });

  it('invalidates the keys invalidates names beside the types written', async () => {
    const { clients, transport, arrivals, queryClient } = blogApi((arrival) =>
      arrival.method === 'POST' ? { status: 204 } : ok([]),
    );
    await showing(queryClient, resourceQueries(clients.people).list());
    await showing(queryClient, resourceQueries(clients.tags).list());
    const mutation = new MutationObserver(
      queryClient,
      operationsMutation(transport, {
        invalidates: [resourceQueries(clients.tags).all],
      }),
    );
    await mutation.mutate([articles.setRelationship('1', 'author', '9')]);
    expect(sent(arrivals).slice(2)).toEqual([
      'POST /api/operations',
      'GET /api/tags',
    ]);
  });

  it('invalidates nothing when the server refuses the request, whose errors point at their operation', async () => {
    const { clients, transport, arrivals, queryClient } = blogApi((arrival) =>
      arrival.method === 'POST'
        ? {
            status: 422,
            document: {
              errors: [
                {
                  status: '422',
                  code: 'VALIDATION_FAILED',
                  source: {
                    pointer: '/atomic:operations/1/data/attributes/title',
                  },
                },
              ],
            },
          }
        : ok(arrival.target === '/api/articles' ? [ARRAYS] : ARRAYS),
    );
    const queries = resourceQueries(clients.articles);
    await showing(queryClient, queries.list());
    await showing(queryClient, queries.get('1'));
    const mutation = new MutationObserver(
      queryClient,
      operationsMutation(transport),
    );
    const error = await mutation
      .mutate([
        articles.remove('1'),
        articles.create({ attributes: { title: '' } }),
      ])
      .then(
        () => expect.unreachable('the request was refused'),
        (refused: unknown) => refused,
      );
    expect(isResponseError(error, 'VALIDATION_FAILED')).toBe(true);
    expect(
      isResponseError(error) &&
        error.errors.map((object) => operationOf(object)),
    ).toEqual([{ index: 1, pointer: '/data/attributes/title' }]);
    expect(sent(arrivals)).toEqual([
      'GET /api/articles',
      'GET /api/articles/1',
      'POST /api/operations',
    ]);
    expect(
      queryClient.getQueryState(queries.list().queryKey)?.isInvalidated,
    ).toBe(false);
    expect(queryClient.getQueryState(queries.get('1').queryKey)?.status).toBe(
      'success',
    );
  });

  it('refuses invalidates that is not a list of query keys, and a transport createTransport did not make at the first mutation', async () => {
    const { clients, transport, arrivals, queryClient } = blogApi(() => ok([]));
    const { all } = resourceQueries(clients.articles);
    const make = (settings: object) => operationsMutation(transport, settings);
    for (const invalidates of [all, 'articles', [all, 'x']]) {
      expect(() => make({ invalidates })).toThrow(
        new TypeError(
          'operationsMutation: invalidates must be a list of query keys',
        ),
      );
    }
    const mutation = new MutationObserver(
      queryClient,
      operationsMutation({} as Transport),
    );
    await expect(mutation.mutate([articles.remove('1')])).rejects.toThrow(
      new TypeError(
        'sendOperations: transport must be made by createTransport',
      ),
    );
    expect(arrivals).toEqual([]);
  });
});
