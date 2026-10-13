/**
 * The calls `createClients` types (SPEC 15.4): queries and records from
 * the definitions passed, and writes from the validators' inputs and the
 * writable lists; `relationship-calls.test-d.ts` holds the relationship
 * calls. The blog is defined here, since an exported definition needs an
 * annotation under `isolatedDeclarations` and the point is what
 * `defineResource` infers.
 */
import type {
  AnyResource,
  Links,
  Meta,
  Relationships,
} from '@nizam-os/jsonapi-core';

import type { AnyRecord, Identifier } from '../document/types';
import type { ListQuery } from '../query/types';
import type { WriteResult } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDefineResource } from '@nizam-os/jsonapi-core';

import { createTransport } from '../transport/transport';
import { createClients } from './create-clients';

const defineResource = createDefineResource({ links: { base: '/api' } });

declare const createArticle: {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'test';
    readonly validate: (value: unknown) => { value: { title: string } };
    readonly types: {
      input: { readonly title: string; readonly body?: string | undefined };
      output: { title: string };
    };
  };
};

const Tags = defineResource({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
  clientIds: true,
});

const People = defineResource({
  type: 'people',
  attributes: ['name'],
  relationships: {
    articles: {
      type: 'articles',
      cardinality: 'many',
      resource: (): AnyResource => Articles,
    },
  },
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
  query: { include: ['articles'] },
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
  }) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body },
  }),
  query: {
    sort: ['title'],
    filter: { title: ['eq', 'like'] },
    include: ['author', 'author.articles', 'tags'],
    page: { default: 10, max: 50 },
  },
  validate: { create: createArticle },
  writable: {
    create: ['title', 'body', 'author', 'tags'],
    update: ['title', 'tags'],
  },
});

const DEFINITIONS = { articles: Articles, people: People, tags: Tags };
const transport = createTransport({ origin: 'https://api.example.test' });
const { articles, tags } = createClients(DEFINITIONS, transport);

/** The members of a union that have `TKey`: a record, never the identifier beside it. */
type WithKey<TUnion, TKey extends PropertyKey> = TUnion extends unknown
  ? TKey extends keyof TUnion
    ? TUnion
    : never
  : never;

interface ArticleRecord {
  readonly type: 'articles';
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly author: Identifier<'people'> | null | undefined;
  readonly tags: ReadonlyArray<Identifier<'tags'>> | undefined;
  readonly $links?: Links;
  readonly $meta?: Meta;
  readonly $relationships?: Relationships;
}

type Data<TResult> =
  Awaited<TResult> extends { readonly data: infer TData } ? TData : never;

describe('the definition (SPEC 15.4)', () => {
  it('is typed as the definition passed', () => {
    expectTypeOf(articles.definition).toEqualTypeOf<typeof Articles>();
    expectTypeOf(tags.definition).toEqualTypeOf<typeof Tags>();
  });
});

describe('reads (SPEC 15.4, 15.6)', () => {
  it('types a list without a query: every field, each relationship its linkage', () => {
    const listed = articles.list();
    type Article = Data<typeof listed>[number];

    expectTypeOf<Article['title']>().toEqualTypeOf<string>();
    expectTypeOf<Article['author']>().toEqualTypeOf<
      Identifier<'people'> | null | undefined
    >();
    expectTypeOf<Article['tags']>().toEqualTypeOf<
      ReadonlyArray<Identifier<'tags'>> | undefined
    >();
  });

  it('reads a literal query as a constant: included records and fieldsets exactly', () => {
    const included = articles.list({
      include: ['author'],
      fields: { articles: ['title', 'author'] },
    });
    type Article = Data<typeof included>[number];

    expectTypeOf<keyof Article>().toEqualTypeOf<
      'type' | 'id' | 'title' | 'author' | '$links' | '$meta' | '$relationships'
    >();
    expectTypeOf<
      NonNullable<Article['author']>['name']
    >().toEqualTypeOf<string>();
  });

  it('types a query held in a variable by what it may hold: records or linkage, fields optional', () => {
    const query: ListQuery<typeof DEFINITIONS, typeof Articles> = {};
    const listed = articles.list(query);
    type Article = Data<typeof listed>[number];

    type Author = NonNullable<Article['author']>;
    type Person = WithKey<Author, 'name'>;

    expectTypeOf<Identifier<'people'>>().toExtend<Author>();
    expectTypeOf<Person['name']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Pick<Article, 'title'>>().toEqualTypeOf<{
      readonly title?: string;
    }>();
  });

  it('refuses what the server would answer with a 400: an undeclared include, sort, or page where there is none', () => {
    // @ts-expect-error -- "editor" is no include path of articles
    void articles.list({ include: ['editor'] });
    // @ts-expect-error -- tags declare no sort
    void tags.list({ sort: ['name'] });
    // @ts-expect-error -- tags do not paginate
    void tags.list({ page: { size: 1 } });
    // @ts-expect-error -- get sends include and fields alone
    void articles.get('a1', { sort: ['title'] });
  });

  it("types related by cardinality, with the related definition's query", () => {
    const author = articles.related('a1', 'author', { include: ['articles'] });
    const tagged = articles.related('a1', 'tags');

    expectTypeOf<NonNullable<Data<typeof author>>['articles']>().toEqualTypeOf<
      ReadonlyArray<ArticleRecord> | undefined
    >();
    expectTypeOf<Data<typeof author>>().toExtend<object | null>();
    expectTypeOf<Data<typeof tagged>[number]['name']>().toEqualTypeOf<string>();
    // @ts-expect-error -- "author" is no include path of tags
    void articles.related('a1', 'tags', { include: ['author'] });
  });

  it('types a related type no definition passed has as AnyRecord', () => {
    const only = createClients({ articles: Articles }, transport);

    expectTypeOf<
      Data<ReturnType<typeof only.articles.related<'author'>>>
    >().toEqualTypeOf<AnyRecord | null>();
  });
});

describe('writes (SPEC 15.4)', () => {
  it("types create's attributes by the create validator's input", () => {
    void articles.create({
      attributes: { title: 'T' },
      relationships: { author: 'p1', tags: ['t1'] },
    });
    // @ts-expect-error -- the validator requires title
    void articles.create({});
    // @ts-expect-error -- title is a string
    void articles.create({ attributes: { title: 1 } });
    void articles.create({
      attributes: { title: 'T' },
      // @ts-expect-error -- a to-many takes a list
      relationships: { tags: 't1' },
    });
  });

  it('takes an id only where the definition accepts client ids', () => {
    void tags.create({ id: 't9', attributes: { name: 'n' } });
    // @ts-expect-error -- articles take no client ids
    void articles.create({ id: 'a9', attributes: { title: 'T' } });
  });

  it('takes the relationships the writable lists name', () => {
    void articles.update('a1', {
      relationships: { tags: [{ type: 'tags', id: 't1' }] },
    });
    // @ts-expect-error -- author is not updatable
    void articles.update('a1', { relationships: { author: 'p1' } });
    // @ts-expect-error -- body is not updatable
    void articles.update('a1', { attributes: { body: 'B' } });
    // @ts-expect-error -- tags have no relationship to write
    void tags.update('t1', { relationships: { owner: 'p1' } });
  });

  it('resolves to the stored record, or no data', () => {
    const created = articles.create({ attributes: { title: 'T' } });

    expectTypeOf<Data<typeof created>>().toEqualTypeOf<
      ArticleRecord | undefined
    >();
    expectTypeOf(articles.remove('a1')).toEqualTypeOf<
      Promise<WriteResult<undefined>>
    >();
  });
});
