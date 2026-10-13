/**
 * TanStack Query over the blog API (SPEC 16): the options
 * `resourceQueries` of the built `@nizam-os/tanstack-query-jsonapi` makes
 * from the built client's clients, read and written through query-core's
 * observers, which every adapter's hooks are made of, against the blog
 * served over a socket. A screen is an observer with a listener, as a
 * mounted query is. A list and a record are keyed by the request each
 * sends; an infinite list pages both ways by the server's links from the
 * query's own cursors; each write settles once what the screens show has
 * refetched; a refused write leaves the cache as it was.
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/infinite-queries
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
 */
import type { QueryObserverOptions } from '@tanstack/query-core';

import {
  InfiniteQueryObserver,
  MutationObserver,
  QueryClient,
  QueryObserver,
} from '@tanstack/query-core';
import { describe, expect, it, vi } from 'vitest';

import { isResponseError, pageCursors } from '@nizam-os/jsonapi-client';
import { resourceQueries } from '@nizam-os/tanstack-query-jsonapi';

import { useClientBlog } from '../support/clients.ts';

/** A cache that does not retry, so a refused call settles at once. */
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

/** The titles on each page of an infinite list. */
function titles(pages: ReadonlyArray<{ readonly data: ReadonlyArray<any> }>) {
  return pages.map(({ data }) => data.map(({ title }) => title));
}

describe('reads keyed by the request', () => {
  const blog = useClientBlog();
  const sentSince = (count: number) =>
    blog
      .arrivals()
      .slice(count)
      .map(({ method, target }) => `${method} ${target}`);

  it('reads a list and a record through the client, one entry for one request', async () => {
    const queryClient = cache();
    const articles = resourceQueries(blog.clients().articles);
    const before = blog.arrivals().length;
    const list = await showing(
      queryClient,
      articles.list({ sort: ['title'], include: ['author'] }),
    );
    // A screen that reads the list fresh for its lifetime adds its option
    // by spreading, and shares the entry the first screen filled.
    const again = await showing(queryClient, {
      ...articles.list({ include: ['author'], sort: ['title'] }),
      staleTime: Infinity,
    });
    expect(sentSince(before)).toEqual([
      'GET /articles?include=author&sort=title',
    ]);
    expect(
      queryClient.getQueryCache().findAll({ queryKey: ['articles', 'list'] }),
    ).toHaveLength(1);
    expect(again.getCurrentResult().data).toBe(list.getCurrentResult().data);
    expect(
      list
        .getCurrentResult()
        .data.data.map(({ title, author }: any) => [title, author.name]),
    ).toEqual([
      ['Analytical engines', 'Ada Lovelace'],
      ['Compilers', 'Grace Hopper'],
    ]);
    const record = await showing(
      queryClient,
      articles.get('1', { include: ['author'], sort: ['title'] }),
    );
    expect(sentSince(before + 1)).toEqual(['GET /articles/1?include=author']);
    expect(record.getCurrentResult().data.data).toMatchObject({
      id: '1',
      title: 'JSON:API paints my bikeshed!',
      author: { id: '1', name: 'Dan Gebhardt' },
    });
  });

  it("pages both ways by the server's links from the query's own cursors", async () => {
    const queryClient = cache();
    const articles = resourceQueries(blog.clients().articles);
    const all = new InfiniteQueryObserver(
      queryClient,
      articles.pages({ sort: ['title'], page: { size: 2 } }),
    );
    await all.refetch();
    let result = all.getCurrentResult();
    while (result.hasNextPage) {
      result = await all.fetchNextPage();
    }
    const pages = result.data?.pages ?? [];
    expect(titles(pages)).toEqual([
      ['Analytical engines', 'Compilers'],
      ['JSON:API paints my bikeshed!', 'Nanoseconds'],
      ['Rails is Omakase'],
    ]);
    expect(result.hasPreviousPage).toBe(false);
    const [first] = pages;
    if (first === undefined) {
      throw new TypeError('the list has a first page');
    }
    const middle = new InfiniteQueryObserver(
      queryClient,
      articles.pages({
        sort: ['title'],
        page: { size: 2, after: pageCursors(first).next },
      }),
    );
    await middle.refetch();
    expect(titles(middle.getCurrentResult().data?.pages ?? [])).toEqual([
      ['JSON:API paints my bikeshed!', 'Nanoseconds'],
    ]);
    result = await middle.fetchPreviousPage();
    expect(titles(result.data?.pages ?? [])).toEqual([
      ['Analytical engines', 'Compilers'],
      ['JSON:API paints my bikeshed!', 'Nanoseconds'],
    ]);
    expect(result.hasPreviousPage).toBe(false);
  });
});

describe('writes that settle once the reads shown have refetched', () => {
  const blog = useClientBlog();
  const queryClient = cache();
  const sentSince = (count: number) =>
    blog
      .arrivals()
      .slice(count)
      .map(({ method, target }) => `${method} ${target}`)
      .toSorted();

  it('creates, and the list shown holds the new article once the write settles', async () => {
    const articles = resourceQueries(blog.clients().articles);
    const list = await showing(
      queryClient,
      articles.list({ sort: ['-createdAt'] }),
    );
    const before = blog.arrivals().length;
    const created = await new MutationObserver(
      queryClient,
      articles.create(),
    ).mutate({
      attributes: { title: 'Observers' },
      relationships: { author: '2' },
    });
    expect(created).toMatchObject({ status: 201, data: { id: '6' } });
    expect(sentSince(before)).toEqual([
      'GET /articles?sort=-createdAt',
      'POST /articles',
    ]);
    expect(
      list.getCurrentResult().data.data.map(({ title }: any) => title),
    ).toEqual(['Observers', 'Nanoseconds']);
  });

  it('updates, and the record and the list shown have refetched once the write settles', async () => {
    const articles = resourceQueries(blog.clients().articles);
    const record = await showing(queryClient, articles.get('6'));
    const before = blog.arrivals().length;
    await new MutationObserver(queryClient, articles.update()).mutate({
      id: '6',
      attributes: { body: 'Hooks are made of them.' },
    });
    expect(sentSince(before)).toEqual([
      'GET /articles/6',
      'GET /articles?sort=-createdAt',
      'PATCH /articles/6',
    ]);
    expect(record.getCurrentResult().data.data.body).toBe(
      'Hooks are made of them.',
    );
  });

  it("removes, dropping the record's entries, and refetches the author the write names", async () => {
    const { articles: articleClient, people: peopleClient } = blog.clients();
    const articles = resourceQueries(articleClient);
    const people = resourceQueries(peopleClient);
    const author = await showing(queryClient, people.get('2'));
    const ids = () =>
      author.getCurrentResult().data.data.articles.map(({ id }: any) => id);
    expect(ids()).toEqual(['3', '6']);
    const before = blog.arrivals().length;
    await new MutationObserver(
      queryClient,
      articles.remove({ invalidates: [people.all] }),
    ).mutate('6');
    expect(sentSince(before)).toEqual([
      'DELETE /articles/6',
      'GET /articles?sort=-createdAt',
      'GET /people/2',
    ]);
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['articles', 'get', '6'] }),
    ).toEqual([]);
    expect(ids()).toEqual(['3']);
  });
});

describe('a refused write', () => {
  const blog = useClientBlog();

  it('rejects with the client ResponseError and leaves the cache as it was', async () => {
    const queryClient = cache();
    const articles = resourceQueries(blog.clients().articles);
    const list = await showing(queryClient, articles.list());
    const shown = list.getCurrentResult().data;
    const before = blog.arrivals().length;
    await expect(
      new MutationObserver(queryClient, articles.create()).mutate({
        attributes: { title: '' },
      }),
    ).rejects.toSatisfy(
      (error) =>
        isResponseError(error, 'VALIDATION_FAILED') && error.status === 422,
    );
    expect(blog.arrivals().length - before).toBe(1);
    expect(
      queryClient.getQueryState(articles.list().queryKey)?.isInvalidated,
    ).toBe(false);
    expect(list.getCurrentResult().data).toBe(shown);
  });
});
