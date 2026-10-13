/**
 * Atomic Operations through TanStack Query over the blog API (SPEC 17.4):
 * the mutation options `operationsMutation` of the built
 * `@nizam-os/tanstack-query-jsonapi` makes over the built client's
 * transport, run through query-core's `MutationObserver`, which every
 * adapter's `useMutation` is made of, against the blog served over a
 * socket. A request settles once the reads a screen shows of every type
 * it writes have refetched, the records it removed dropped first; a
 * refused request leaves the cache and the store as they were.
 * @ref https://jsonapi.org/ext/atomic/
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
 */
import type { QueryObserverOptions } from '@tanstack/query-core';

import {
  MutationObserver,
  QueryClient,
  QueryObserver,
} from '@tanstack/query-core';
import { describe, expect, it, vi } from 'vitest';

import {
  isResponseError,
  operationOf,
  operationsOf,
} from '@nizam-os/jsonapi-client';
import {
  operationsMutation,
  resourceQueries,
} from '@nizam-os/tanstack-query-jsonapi';

import { useClientBlog } from '../support/clients.ts';
import { Articles, People } from '../support/resources.ts';

const articleOperations = operationsOf(Articles);
const peopleOperations = operationsOf(People);

/** A cache that does not retry, so a refused request settles at once. */
function cache(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** A screen showing what `options` reads, once it has. */
async function showing(
  queryClient: QueryClient,
  options: QueryObserverOptions<any, any, any, any, any>,
) {
  const observer = new QueryObserver(queryClient, options);
  observer.subscribe(() => {});
  await vi.waitFor(() => {
    expect(observer.getCurrentResult().isSuccess).toBe(true);
  });
  return observer;
}

/** The names a list result holds under `field`. */
function shown(observer: QueryObserver<any>, field: string): Array<unknown> {
  return observer.getCurrentResult().data.data.map((row: any) => row[field]);
}

describe('operations in one request', () => {
  const blog = useClientBlog();
  const sentSince = (count: number) =>
    blog
      .arrivals()
      .slice(count)
      .map(({ method, target }) => `${method} ${target}`)
      .toSorted();

  it('settles once the reads shown of each type written have refetched, the removed record dropped first', async () => {
    const queryClient = cache();
    const { articles: articleClient, people: peopleClient } = blog.clients();
    const articles = resourceQueries(articleClient);
    const people = resourceQueries(peopleClient);
    const list = await showing(queryClient, articles.list({ sort: ['title'] }));
    await showing(queryClient, articles.get('3'));
    const authors = await showing(queryClient, people.list());
    const before = blog.arrivals().length;

    const { status, results } = await new MutationObserver(
      queryClient,
      operationsMutation(blog.transport()),
    ).mutate([
      peopleOperations.create({ lid: 'aug', attributes: { name: 'Augusta' } }),
      articleOperations.create({
        attributes: { title: 'Babbage' },
        relationships: { author: { type: 'people', lid: 'aug' } },
      }),
      articleOperations.remove('3'),
    ]);

    expect(status).toBe(200);
    expect(results.map(({ data }) => data)).toMatchObject([
      { type: 'people', id: '6', name: 'Augusta' },
      { type: 'articles', id: '7', author: { type: 'people', id: '6' } },
      undefined,
    ]);
    expect(sentSince(before)).toEqual([
      'GET /articles?sort=title',
      'GET /people',
      'POST /operations',
    ]);
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['articles', 'get', '3'] }),
    ).toEqual([]);
    expect(shown(list, 'title')).toEqual(['Babbage', 'Compilers']);
    expect(shown(authors, 'name')).toContain('Augusta');
  });

  it('rejects a refused request with errors at their operation, leaving the cache and the store as they were', async () => {
    const queryClient = cache();
    const articles = resourceQueries(blog.clients().articles);
    const list = await showing(queryClient, articles.list({ sort: ['title'] }));
    const data = list.getCurrentResult().data;
    const stored = blog.store().snapshot();
    const before = blog.arrivals().length;

    const error = await new MutationObserver(
      queryClient,
      operationsMutation(blog.transport()),
    )
      .mutate([
        articleOperations.update('4', { attributes: { title: 'Renamed' } }),
        articleOperations.create({ attributes: { title: '' } }),
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
    expect(sentSince(before)).toEqual(['POST /operations']);
    expect(
      queryClient.getQueryState(articles.list({ sort: ['title'] }).queryKey)
        ?.isInvalidated,
    ).toBe(false);
    expect(list.getCurrentResult().data).toBe(data);
    expect(blog.store().snapshot()).toEqual(stored);
  });
});
