import type { BlogApi } from './test-support/fetch-double';

import { InfiniteQueryObserver, QueryObserver } from '@tanstack/query-core';
import { describe, expect, it, vi } from 'vitest';

import { isResponseError } from '@nizam-os/jsonapi-client';

import { resourceQueries } from './queries';
import { Tags } from './test-support/blog';
import {
  article,
  blogApi,
  ok,
  untilAborted,
} from './test-support/fetch-double';

/** A read started as a component starts it, and the key it caches under. */
type Started = (api: BlogApi) => {
  readonly reading: Promise<unknown>;
  readonly queryKey: ReadonlyArray<unknown>;
};

const READS: ReadonlyArray<readonly [string, Started]> = [
  [
    'a list',
    ({ clients, queryClient }) => {
      const options = resourceQueries(clients.articles).list();
      const reading = new QueryObserver(queryClient, options).refetch();
      return { reading, queryKey: options.queryKey };
    },
  ],
  [
    'a page',
    ({ clients, queryClient }) => {
      const options = resourceQueries(clients.articles).pages();
      const reading = new InfiniteQueryObserver(queryClient, options).refetch();
      return { reading, queryKey: options.queryKey };
    },
  ],
  [
    'a record',
    ({ clients, queryClient }) => {
      const options = resourceQueries(clients.articles).get('7');
      const reading = new QueryObserver(queryClient, options).refetch();
      return { reading, queryKey: options.queryKey };
    },
  ],
];

describe('the reads of resourceQueries (SPEC 16.3)', () => {
  it('lists through the client, resolving to its page of records with the links', async () => {
    const links = { next: '/api/articles?page%5Bafter%5D=c1' };
    const { clients, arrivals, queryClient } = blogApi(() =>
      ok([article('1', 'Keys', 'c1')], links),
    );
    const options = resourceQueries(clients.articles).list({
      sort: ['title'],
    });
    const { data } = await new QueryObserver(queryClient, options).refetch();
    expect(arrivals.map(({ method, target }) => [method, target])).toEqual([
      ['GET', '/api/articles?sort=title'],
    ]);
    expect(data?.data).toEqual([
      {
        type: 'articles',
        id: '1',
        title: 'Keys',
        $meta: { page: { cursor: 'c1' } },
      },
    ]);
    expect(data?.links).toEqual(links);
    expect(queryClient.getQueryData(options.queryKey)).toBe(data);
  });

  it('gets a record with the include and fields it asks for', async () => {
    const { clients, arrivals, queryClient } = blogApi(() => ({
      status: 200,
      document: {
        data: {
          ...article('7', 'Keys'),
          relationships: { author: { data: { type: 'people', id: '9' } } },
        },
        included: [{ type: 'people', id: '9', attributes: { name: 'Ada' } }],
      },
    }));
    const options = resourceQueries(clients.articles).get('7', {
      include: ['author'],
      fields: { articles: ['title', 'author'] },
    });
    const { data } = await new QueryObserver(queryClient, options).refetch();
    expect(arrivals.map(({ target }) => target)).toEqual([
      '/api/articles/7?include=author&fields[articles]=title,author',
    ]);
    expect(data?.data).toMatchObject({
      id: '7',
      title: 'Keys',
      author: { type: 'people', id: '9', name: 'Ada' },
    });
  });

  it.each(READS)(
    'aborts the request of %s whose query is cancelled',
    async (_name, start) => {
      const api = blogApi(untilAborted);
      const { reading, queryKey } = start(api);
      await vi.waitFor(() => {
        expect(api.arrivals).toHaveLength(1);
      });
      expect(api.arrivals[0]?.signal.aborted).toBe(false);
      await api.queryClient.cancelQueries({ queryKey });
      expect(api.arrivals[0]?.signal.aborted).toBe(true);
      await reading;
      expect(api.queryClient.getQueryState(queryKey)).toMatchObject({
        data: undefined,
        fetchStatus: 'idle',
      });
    },
  );

  it("settles a refused read with the client's ResponseError", async () => {
    const { clients, queryClient } = blogApi(() => ({
      status: 404,
      document: { errors: [{ status: '404', code: 'NOT_FOUND' }] },
    }));
    const options = resourceQueries(clients.articles).get('9');
    const { error } = await new QueryObserver(queryClient, options).refetch();
    expect(error).toSatisfy(
      (refusal) =>
        isResponseError(refusal, 'NOT_FOUND') && refusal.status === 404,
    );
  });

  it('refuses what is not a client, and pages of a definition that does not paginate', () => {
    for (const value of [undefined, {}, { definition: Tags }, Tags]) {
      expect(() => resourceQueries(value as never)).toThrow(
        new TypeError(
          'resourceQueries: client must be a client createClients returned',
        ),
      );
    }
    const { clients } = blogApi(() => ok([]));
    const tags = resourceQueries(clients.tags);
    expect(tags.list().queryKey).toEqual(['tags', 'list', '']);
    expect(() => tags.pages()).toThrow(
      new TypeError(
        'resourceQueries: tags does not paginate, so it has no pages',
      ),
    );
  });
});
