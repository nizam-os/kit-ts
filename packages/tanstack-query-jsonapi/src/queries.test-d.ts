/**
 * The types `resourceQueries` gives (SPEC 16.5), read through query-core's
 * `QueryClient` and the observers every adapter's hooks are made of; the
 * hooks of each adapter are checked against the built package in
 * `e2e/jsonapi/query/adapters/`. The blog is defined here, since an
 * exported definition needs an annotation under `isolatedDeclarations` and
 * the point is what `defineResource` infers.
 */
import type { InfiniteData } from '@tanstack/query-core';

import type {
  CreateInput,
  UpdateInput,
  WriteResult,
} from '@nizam-os/jsonapi-client';
import type { AnyResource } from '@nizam-os/jsonapi-core';

import {
  InfiniteQueryObserver,
  MutationObserver,
  QueryClient,
  QueryObserver,
} from '@tanstack/query-core';
import { describe, expectTypeOf, it } from 'vitest';

import { createClients, createTransport } from '@nizam-os/jsonapi-client';
import { createDefineResource } from '@nizam-os/jsonapi-core';

import { resourceQueries } from './queries';

const defineResource = createDefineResource({ links: { base: '/api' } });

/** A Standard Schema whose input is `TInput`, as a write validator is. */
interface Validator<TInput> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'test';
    readonly validate: (value: unknown) => { value: TInput };
    readonly types: { input: TInput; output: TInput };
  };
}

declare const createArticle: Validator<{
  readonly title: string;
  readonly body?: string | undefined;
}>;
declare const updateArticle: Validator<{
  readonly title?: string | undefined;
  readonly body?: string | undefined;
}>;

const Tags = defineResource({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
});

const People = defineResource({
  type: 'people',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
  query: { sort: ['name'], page: { default: 10, max: 50 } },
});

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  relationships: {
    author: {
      type: 'people',
      cardinality: 'one',
      resource: (): AnyResource => People,
    },
  },
  serialize: (row: {
    readonly id: string;
    readonly title: string;
    readonly body: string;
  }) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body },
  }),
  query: {
    sort: ['title'],
    filter: { title: ['eq'] },
    include: ['author'],
    page: { default: 2, max: 4 },
  },
  validate: { create: createArticle, update: updateArticle },
  writable: { create: ['title', 'body', 'author'], update: ['title', 'body'] },
});

const clients = createClients(
  { articles: Articles, people: People, tags: Tags },
  createTransport({ origin: 'https://api.example.test' }),
);
const articles = resourceQueries(clients.articles);
const people = resourceQueries(clients.people);
const queryClient = new QueryClient();

/** What the client's own calls resolve to, for the queries the reads below pass. */
const listed = clients.articles.list({ include: ['author'] });
const got = clients.articles.get('1', { fields: { articles: ['title'] } });
const feedPage = clients.articles.list({ sort: ['-title'] });
const created = clients.articles.create({ attributes: { title: 'Keys' } });

type Article = typeof Articles;

describe('resourceQueries (SPEC 16.5)', () => {
  it("types each read's data as the client's call for the query passed", () => {
    expectTypeOf(articles.all).toEqualTypeOf<readonly ['articles']>();
    const list = new QueryObserver(
      queryClient,
      articles.list({ include: ['author'] }),
    );
    expectTypeOf(list.getCurrentResult().data).toEqualTypeOf<
      Awaited<typeof listed> | undefined
    >();
    const record = new QueryObserver(
      queryClient,
      articles.get('1', { fields: { articles: ['title'] } }),
    );
    expectTypeOf(record.getCurrentResult().data).toEqualTypeOf<
      Awaited<typeof got> | undefined
    >();
    const feed = new InfiniteQueryObserver(
      queryClient,
      articles.pages({ sort: ['-title'] }),
    );
    expectTypeOf(feed.getCurrentResult().data).toEqualTypeOf<
      InfiniteData<Awaited<typeof feedPage>> | undefined
    >();
  });

  it('infers a select from the data, and reads getQueryData through the tagged keys', () => {
    const title = new QueryObserver(queryClient, {
      ...articles.get('1'),
      select: (result) => result.data.title,
    });
    expectTypeOf(title.getCurrentResult().data).toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf(
      queryClient.getQueryData(articles.list({ include: ['author'] }).queryKey),
    ).toEqualTypeOf<Awaited<typeof listed> | undefined>();
    expectTypeOf(
      queryClient.getQueryData(
        articles.get('1', { fields: { articles: ['title'] } }).queryKey,
      ),
    ).toEqualTypeOf<Awaited<typeof got> | undefined>();
    expectTypeOf(
      queryClient.getQueryData(articles.pages({ sort: ['-title'] }).queryKey),
    ).toEqualTypeOf<InfiniteData<Awaited<typeof feedPage>> | undefined>();
  });

  it("types each write's variables as the client's call takes them", () => {
    const create = new MutationObserver(queryClient, articles.create());
    const update = new MutationObserver(queryClient, articles.update());
    const remove = new MutationObserver(queryClient, articles.remove());
    expectTypeOf<typeof create.mutate>()
      .parameter(0)
      .toEqualTypeOf<CreateInput<Article>>();
    expectTypeOf<typeof create.mutate>().returns.resolves.toEqualTypeOf<
      Awaited<typeof created>
    >();
    expectTypeOf<typeof update.mutate>()
      .parameter(0)
      .toEqualTypeOf<{ readonly id: string } & UpdateInput<Article>>();
    expectTypeOf<typeof remove.mutate>().parameter(0).toEqualTypeOf<string>();
    void update.mutate({ id: '1', attributes: { title: 'Keys and Values' } });
    // @ts-expect-error -- an update names the record it writes
    void update.mutate({ attributes: { title: 'Keys and Values' } });
    // @ts-expect-error -- the definition writes no such attribute
    void update.mutate({ id: '1', attributes: { subtitle: 'Values' } });
    expectTypeOf<WriteResult<undefined>>().toEqualTypeOf<
      Awaited<ReturnType<typeof clients.articles.remove>>
    >();
  });

  it('takes the definition query members alone, and invalidates any key', () => {
    articles.list({ sort: ['title'], filter: { title: 'Keys' } });
    // @ts-expect-error -- the definition sorts by no such field
    articles.list({ sort: ['body'] });
    // @ts-expect-error -- a get sends no sort
    articles.get('1', { sort: ['title'] });
    articles.create({ invalidates: [people.all, people.list().queryKey] });
  });

  it('has no pages on a definition that does not paginate', () => {
    expectTypeOf(resourceQueries(clients.tags).pages).toBeNever();
    expectTypeOf(articles.pages).not.toBeNever();
  });
});
