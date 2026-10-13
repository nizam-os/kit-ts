/**
 * The queries a client may send, typed by the definitions (SPEC 15.4,
 * 15.5): what the server would refuse with a 400 fails `tsc`. The blog is
 * defined here, since an exported definition needs an annotation under
 * `isolatedDeclarations` and the point is what `defineResource` infers.
 */
import type { AnyResource } from '@nizam-os/jsonapi-core';

import type { GetQuery, ListQuery, Query } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDefineResource } from '@nizam-os/jsonapi-core';

const defineResource = createDefineResource({ links: { base: '/api' } });

const Tags = defineResource({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
  query: { sort: ['name'], filter: { name: ['eq', 'in'] } },
});

const People = defineResource({
  type: 'people',
  attributes: ['name', 'twitter'],
  serialize: (row: {
    readonly id: string;
    readonly name: string;
    readonly twitter: string | null;
  }) => ({
    id: row.id,
    attributes: { name: row.name, twitter: row.twitter },
  }),
});

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body', 'createdAt'],
  relationships: {
    author: {
      type: 'people',
      cardinality: 'one',
      resource: (): AnyResource => People,
    },
    tags: {
      type: 'tags',
      cardinality: 'many',
      resource: (): AnyResource => Tags,
    },
  },
  serialize: (row: {
    readonly id: string;
    readonly title: string;
    readonly body: string;
    readonly createdAt: Date;
  }) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body, createdAt: row.createdAt },
  }),
  query: {
    sort: ['title', 'createdAt', 'author.name'],
    filter: {
      title: ['eq', 'like'],
      createdAt: ['gte', 'lt'],
      author: ['eq', 'in', 'isNull'],
    },
    include: ['author', 'author.articles', 'tags'],
    page: { default: 2, max: 4 },
    search: 'filter[q]',
    custom: ['highlightMode'],
  },
});

const BLOG = { articles: Articles, people: People, tags: Tags };
type Blog = typeof BLOG;
type ArticleList = ListQuery<Blog, typeof Articles>;
type TagList = ListQuery<Blog, typeof Tags>;
type PeopleList = ListQuery<Blog, typeof People>;

describe('ListQuery and GetQuery (SPEC 15.4)', () => {
  it('takes the declared include paths and sorts, a sort descending with -', () => {
    expectTypeOf<NonNullable<ArticleList['include']>[number]>().toEqualTypeOf<
      'author' | 'author.articles' | 'tags'
    >();
    expectTypeOf<NonNullable<ArticleList['sort']>[number]>().toEqualTypeOf<
      | 'title'
      | 'createdAt'
      | 'author.name'
      | '-title'
      | '-createdAt'
      | '-author.name'
    >();
  });

  it('takes the declared operators, a bare value only where eq is one', () => {
    const query: ArticleList = {
      filter: {
        title: 'x',
        createdAt: { gte: '2026-01-01', lt: 2027 },
        author: { in: ['1', '2'], isNull: false },
        or: [{ title: { like: 'J%' } }, { author: '3' }],
      },
    };
    expectTypeOf(query).toExtend<Query>();
    // @ts-expect-error createdAt does not declare eq
    const bare: ArticleList = { filter: { createdAt: '2026' } };
    // @ts-expect-error title does not declare gt
    const operator: ArticleList = { filter: { title: { gt: 'a' } } };
    // @ts-expect-error body is not filterable
    const field: ArticleList = { filter: { body: 'x' } };
    void [bare, operator, field];
  });

  it('takes page, search, and custom parameters only where the definition declares them', () => {
    const articles: ArticleList = {
      page: { size: 2, after: 'c' },
      search: 'graph',
      custom: { highlightMode: 'on', 'highlightMode[fields]': ['title'] },
    };
    // @ts-expect-error tags do not paginate
    const page: TagList = { page: { size: 1 } };
    // @ts-expect-error tags have no search parameter
    const search: TagList = { search: 'x' };
    // @ts-expect-error tags declare no custom parameter
    const custom: TagList = { custom: { highlightMode: 'on' } };
    // @ts-expect-error not a declared custom name
    const name: ArticleList = { custom: { other: 'x' } };
    void [articles, page, search, custom, name];
  });

  it('takes fieldsets of the types a response can hold, by the fields a client reads', () => {
    const query: ArticleList = {
      fields: { articles: ['title', 'author'], people: ['name'], tags: [] },
    };
    // @ts-expect-error title is not a field of people
    const field: ArticleList = { fields: { people: ['title'] } };
    // @ts-expect-error a response to articles holds no comments
    const type: ArticleList = { fields: { comments: ['body'] } };
    // @ts-expect-error no include path of people reaches articles
    const unreached: PeopleList = { fields: { articles: [] } };
    void [query, field, type, unreached];
  });

  it('takes any name for a reached type the client has no definition of', () => {
    type Alone = ListQuery<{ articles: typeof Articles }, typeof Articles>;
    const query: Alone = { fields: { people: ['anything'], tags: ['name'] } };
    // @ts-expect-error comments are not reached
    const type: Alone = { fields: { comments: [] } };
    void [query, type];
  });

  it('takes no fieldsets where the definition refuses them', () => {
    const Bare = defineResource({
      type: 'bare',
      attributes: ['name'],
      serialize: (row: { readonly id: string; readonly name: string }) => ({
        id: row.id,
        attributes: { name: row.name },
      }),
      query: { fields: false },
    });
    // @ts-expect-error bare sets fields: false
    const query: GetQuery<Blog, typeof Bare> = { fields: { bare: ['name'] } };
    void query;
  });

  it('gives get only include and fields', () => {
    const query: GetQuery<Blog, typeof Articles> = {
      include: ['tags'],
      fields: { tags: ['name'] },
    };
    expectTypeOf(query).toExtend<Query>();
    // @ts-expect-error a get takes no sort
    const sort: GetQuery<Blog, typeof Articles> = { sort: ['title'] };
    void sort;
  });

  it('is wide for definitions typed wide', () => {
    const query: ListQuery<
      Readonly<Record<string, AnyResource>>,
      AnyResource
    > = {
      include: ['a.b'],
      fields: { any: ['x'] },
      sort: ['-x'],
      filter: { a: 'b', c: { d: 1 }, or: [{ e: true }] },
      page: { size: 1 },
      search: 's',
      custom: { anything: ['v'] },
    };
    expectTypeOf(query).toExtend<Query>();
  });
});
