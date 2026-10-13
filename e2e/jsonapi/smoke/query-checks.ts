/**
 * The TanStack Query binding's runtime checks (SPEC 16.7, 17.5):
 * `@nizam-os/tanstack-query-jsonapi`'s options read and write a blog of their
 * own through a query-core `QueryClient`, Atomic Operations among the
 * writes, inside the runtime under test, where server rendering prefetches.
 * `app.ts` answers `GET /query-checks` with the outcome, which each harness
 * reports beside the app's checks. Web standards only, as the binding
 * itself.
 * @ref https://tanstack.com/query/v5/docs/framework/react/guides/ssr
 */
import type { DehydratedState } from '@tanstack/query-core';

import type { Transport } from '@nizam-os/jsonapi-client';
import type { ResourceQueries } from '@nizam-os/tanstack-query-jsonapi';

import type { InRuntimeCheck, SmokeResult } from './checks.ts';

import {
  dehydrate,
  hydrate,
  InfiniteQueryObserver,
  MutationObserver,
  QueryClient,
  QueryObserver,
} from '@tanstack/query-core';

import {
  createClients,
  createTransport,
  isResponseError,
  operationsOf,
} from '@nizam-os/jsonapi-client';
import {
  operationsMutation,
  resourceQueries,
} from '@nizam-os/tanstack-query-jsonapi';

import { createBlog } from '../support/blog.ts';
import { Articles, People, Tags } from '../support/resources.ts';
import { check, equal, runInRuntime } from './checks.ts';

/** Where the client believes the blog is; each request is answered in-process. */
const ORIGIN = 'http://query.invalid';
const DEFINITIONS = { articles: Articles, people: People, tags: Tags };

/** A cache that does not retry, so a refused call settles at once. */
function cache(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Whether `value` lists queries, as a dehydrated state does. */
function isDehydrated(value: unknown): value is Partial<DehydratedState> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray(Reflect.get(value, 'queries'))
  );
}

/** What `call` rejects with; throws when it resolves. */
async function rejection(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new TypeError('the write resolved');
}

interface QueryBlog {
  readonly articles: ResourceQueries<typeof DEFINITIONS, typeof Articles>;
  readonly transport: Transport;
}

/** The articles' options over a fresh blog, and the transport they send through. */
function openBlog(): QueryBlog {
  const { app } = createBlog();
  const transport = createTransport({
    origin: ORIGIN,
    fetch: async (request) => app.fetch(request),
  });
  const { articles } = createClients(DEFINITIONS, transport);
  return { articles: resourceQueries(articles), transport };
}

const CHECKS: Readonly<Record<string, InRuntimeCheck>> = {
  'prefetched reads dehydrate as JSON and hydrate typed': async () => {
    const { articles } = openBlog();
    const server = cache();
    const list = articles.list({ sort: ['title'] });
    const record = articles.get('1', { include: ['author'] });
    await new QueryObserver(server, list).refetch();
    await new QueryObserver(server, record).refetch();
    const browser = cache();
    const state: unknown = JSON.parse(JSON.stringify(dehydrate(server)));
    check(isDehydrated(state), 'the state round-trips through JSON');
    hydrate(browser, state);
    const ids = browser.getQueryData(list.queryKey)?.data.map(({ id }) => id);
    equal(ids?.join(), '3,4', 'hydrated list');
    const author = browser.getQueryData(record.queryKey)?.data.author;
    equal(author?.name, 'Dan Gebhardt', 'hydrated record');
    server.clear();
    browser.clear();
  },
  "pages an infinite list by the server's links": async () => {
    const queryClient = cache();
    const observer = new InfiniteQueryObserver(
      queryClient,
      openBlog().articles.pages({ sort: ['title'] }),
    );
    await observer.refetch();
    let result = observer.getCurrentResult();
    while (result.hasNextPage) {
      result = await observer.fetchNextPage();
    }
    const pages = result.data?.pages.map(({ data }) =>
      data.map(({ id }) => id).join(),
    );
    equal(pages?.join('|'), '3,4|1,5|2', 'pages');
    queryClient.clear();
  },
  'a write settles once the list shown has refetched': async () => {
    const { articles } = openBlog();
    const queryClient = cache();
    const list = new QueryObserver(queryClient, {
      ...articles.list({ sort: ['-createdAt'] }),
      staleTime: Infinity,
    });
    await list.refetch();
    const unsubscribe = list.subscribe(() => {});
    await new MutationObserver(queryClient, articles.create()).mutate({
      attributes: { title: 'Everywhere' },
    });
    equal(list.getCurrentResult().data?.data[0]?.title, 'Everywhere', 'list');
    unsubscribe();
    queryClient.clear();
  },
  'operations settle once the list shown has refetched, the removed record dropped':
    async () => {
      const { articles, transport } = openBlog();
      const queryClient = cache();
      const list = new QueryObserver(queryClient, {
        ...articles.list({ sort: ['title'] }),
        staleTime: Infinity,
      });
      await list.refetch();
      await new QueryObserver(queryClient, articles.get('3')).refetch();
      const unsubscribe = list.subscribe(() => {});
      const { results } = await new MutationObserver(
        queryClient,
        operationsMutation(transport),
      ).mutate([
        operationsOf(Articles).create({ attributes: { title: 'Babbage' } }),
        operationsOf(Articles).remove('3'),
      ]);
      equal(results.length, 2, 'a result per operation');
      const titles = list
        .getCurrentResult()
        .data?.data.map(({ title }) => title);
      equal(titles?.join(), 'Babbage,Compilers', 'list');
      equal(
        queryClient
          .getQueryCache()
          .findAll({ queryKey: ['articles', 'get', '3'] }).length,
        0,
        'removed record dropped',
      );
      unsubscribe();
      queryClient.clear();
    },
  'a refused write rejects and leaves the cache as it was': async () => {
    const { articles } = openBlog();
    const queryClient = cache();
    await new QueryObserver(queryClient, articles.list()).refetch();
    const refusal = await rejection(
      new MutationObserver(queryClient, articles.create()).mutate({
        attributes: { title: '' },
      }),
    );
    check(
      isResponseError(refusal, 'VALIDATION_FAILED'),
      'a 422 is a ResponseError',
    );
    equal(
      queryClient.getQueryState(articles.list().queryKey)?.isInvalidated,
      false,
      'the list stays valid',
    );
    queryClient.clear();
  },
};

/** Runs every check in the current runtime; one report covers them all. */
export async function runQueryChecks(): Promise<SmokeResult> {
  return runInRuntime(CHECKS);
}
