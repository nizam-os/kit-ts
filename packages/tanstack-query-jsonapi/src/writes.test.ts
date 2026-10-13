import { MutationObserver, QueryObserver } from '@tanstack/query-core';
import { describe, expect, it, vi } from 'vitest';

import { isResponseError } from '@nizam-os/jsonapi-client';

import { resourceQueries } from './queries';
import { article, blogApi, held, ok } from './test-support/fetch-double';
import { sent, showing, titles } from './test-support/screens';

const ARRAYS = article('1', 'Arrays');
const BYTES = article('2', 'Bytes');
const NOT_FOUND = { status: 404, document: { errors: [{ status: '404' }] } };

describe('the writes of resourceQueries (SPEC 16.4)', () => {
  it('creates, pending until the list a screen shows has refetched, and leaves an unshown record stale', async () => {
    const refetched = held();
    const { clients, arrivals, queryClient } = blogApi(async (arrival) => {
      if (arrival.method === 'POST') {
        return { status: 201, document: { data: BYTES } };
      }
      if (arrival.target !== '/api/articles') {
        return ok(ARRAYS);
      }
      return arrivals.length === 1 ? ok([ARRAYS]) : refetched.answer;
    });
    const articles = resourceQueries(clients.articles);
    const list = await showing(queryClient, articles.list());
    await new QueryObserver(queryClient, articles.get('1')).refetch();
    const mutation = new MutationObserver(queryClient, articles.create());
    const creating = mutation.mutate({ attributes: { title: 'Bytes' } });
    await vi.waitFor(() => {
      expect(sent(arrivals)).toEqual([
        'GET /api/articles',
        'GET /api/articles/1',
        'POST /api/articles',
        'GET /api/articles',
      ]);
    });
    expect(mutation.getCurrentResult().isPending).toBe(true);
    refetched.release(ok([ARRAYS, BYTES]));
    await expect(creating).resolves.toMatchObject({
      status: 201,
      data: { id: '2', title: 'Bytes' },
    });
    expect(titles(list.getCurrentResult())).toEqual(['Arrays', 'Bytes']);
    expect(
      queryClient.getQueryState(articles.get('1').queryKey)?.isInvalidated,
    ).toBe(true);
    expect(arrivals).toHaveLength(4);
  });

  it('updates the record of { id, ...input } and refetches it where a screen shows it', async () => {
    const { clients, arrivals, queryClient } = blogApi((arrival) =>
      arrival.method === 'PATCH' || arrivals.length > 2
        ? ok(article('1', 'Arrays and Lists'))
        : ok(ARRAYS),
    );
    const articles = resourceQueries(clients.articles);
    const record = await showing(queryClient, articles.get('1'));
    const mutation = new MutationObserver(queryClient, articles.update());
    await mutation.mutate({
      id: '1',
      attributes: { title: 'Arrays and Lists' },
    });
    expect(sent(arrivals)).toEqual([
      'GET /api/articles/1',
      'PATCH /api/articles/1',
      'GET /api/articles/1',
    ]);
    expect(arrivals[1]?.body).toEqual({
      data: {
        type: 'articles',
        id: '1',
        attributes: { title: 'Arrays and Lists' },
      },
    });
    expect(record.getCurrentResult().data.data.title).toBe('Arrays and Lists');
  });

  it("removes the record's entries before the lists refetch, so a screen showing it does not ask for it again", async () => {
    let removed = false;
    const { clients, arrivals, queryClient } = blogApi((arrival) => {
      if (arrival.method === 'DELETE') {
        removed = true;
        return { status: 204 };
      }
      if (arrival.target === '/api/articles') {
        return ok(removed ? [BYTES] : [ARRAYS, BYTES]);
      }
      return removed ? NOT_FOUND : ok(ARRAYS);
    });
    const articles = resourceQueries(clients.articles);
    const list = await showing(queryClient, articles.list());
    const record = await showing(queryClient, articles.get('1'));
    await new QueryObserver(
      queryClient,
      articles.get('1', { include: ['author'] }),
    ).refetch();
    await new MutationObserver(queryClient, articles.remove()).mutate('1');
    expect(sent(arrivals)).toEqual([
      'GET /api/articles',
      'GET /api/articles/1',
      'GET /api/articles/1?include=author',
      'DELETE /api/articles/1',
      'GET /api/articles',
    ]);
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['articles', 'get', '1'] }),
    ).toEqual([]);
    expect(titles(list.getCurrentResult())).toEqual(['Bytes']);
    expect(record.getCurrentResult().isError).toBe(false);
  });

  it('invalidates the other types the write names, pending until they have refetched, then runs the onSuccess of mutate', async () => {
    const refetched = held();
    const { clients, arrivals, queryClient } = blogApi(async (arrival) => {
      if (arrival.method === 'DELETE') {
        return { status: 204 };
      }
      return arrival.target === '/api/people' && arrivals.length > 2
        ? refetched.answer
        : ok([]);
    });
    const articles = resourceQueries(clients.articles);
    const people = resourceQueries(clients.people);
    await showing(queryClient, articles.list());
    const shown = await showing(queryClient, people.list());
    const mutation = new MutationObserver(
      queryClient,
      articles.remove({ invalidates: [people.all] }),
    );
    // A mutate call's callbacks run while the observer has a listener, as
    // a mounted useMutation's does.
    mutation.subscribe(() => {});
    const seen: Array<number> = [];
    const removing = mutation.mutate('1', {
      onSuccess: () => {
        seen.push(shown.getCurrentResult().data.data.length);
      },
    });
    await vi.waitFor(() => {
      expect(sent(arrivals).slice(2).toSorted()).toEqual([
        'DELETE /api/articles/1',
        'GET /api/articles',
        'GET /api/people',
      ]);
    });
    expect(mutation.getCurrentResult().isPending).toBe(true);
    refetched.release(
      ok([{ type: 'people', id: '9', attributes: { name: 'Ada' } }]),
    );
    await removing;
    expect(seen).toEqual([1]);
  });

  it('refuses invalidates that is not a list of query keys', () => {
    const { clients } = blogApi(() => ok([]));
    const articles = resourceQueries(clients.articles);
    const writes = [
      (settings: object) => articles.create(settings),
      (settings: object) => articles.update(settings),
      (settings: object) => articles.remove(settings),
    ];
    for (const invalidates of [articles.all, 'articles', [articles.all, 'x']]) {
      for (const write of writes) {
        expect(() => write({ invalidates })).toThrow(
          new TypeError(
            'resourceQueries: invalidates must be a list of query keys',
          ),
        );
      }
    }
  });

  it('invalidates nothing when the server refuses the write', async () => {
    const { clients, arrivals, queryClient } = blogApi((arrival) =>
      arrival.method === 'POST'
        ? {
            status: 409,
            document: {
              errors: [{ status: '409', code: 'ARTICLE_TITLE_TAKEN' }],
            },
          }
        : ok([ARRAYS]),
    );
    const articles = resourceQueries(clients.articles);
    await showing(queryClient, articles.list());
    const mutation = new MutationObserver(queryClient, articles.create());
    await expect(
      mutation.mutate({ attributes: { title: 'Arrays' } }),
    ).rejects.toSatisfy((error) =>
      isResponseError(error, 'ARTICLE_TITLE_TAKEN'),
    );
    expect(sent(arrivals)).toEqual(['GET /api/articles', 'POST /api/articles']);
    expect(
      queryClient.getQueryState(articles.list().queryKey)?.isInvalidated,
    ).toBe(false);
  });
});
