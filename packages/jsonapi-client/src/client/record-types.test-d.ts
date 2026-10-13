/**
 * `RecordOf` (SPEC 15.6, ADR 0019): the record a response to a query holds,
 * typed as `deserialize` builds it. A literal query says what the response
 * holds; a query typed as a list says what it may hold. The blog is
 * defined here, since an exported definition needs an annotation under
 * `isolatedDeclarations` and the point is what `defineResource` infers.
 */
import type {
  AnyResource,
  Links,
  Meta,
  Relationships,
} from '@nizam-os/jsonapi-core';

import type { AnyRecord, Identifier } from '../document/types';
import type { ListQuery } from '../query/types';
import type { RecordOf } from './record-types';

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
});

const People = defineResource({
  type: 'people',
  attributes: ['name', 'twitter'],
  relationships: {
    articles: {
      type: 'articles',
      cardinality: 'many',
      resource: (): AnyResource => Articles,
    },
  },
  serialize: (row: {
    readonly id: string;
    readonly name: string;
    readonly twitter: string | null;
  }) => ({ id: row.id, attributes: { name: row.name, twitter: row.twitter } }),
  query: { include: ['articles'] },
});

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'createdAt'],
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
    readonly createdAt: Date;
  }) => ({
    id: row.id,
    attributes: { title: row.title, createdAt: row.createdAt },
  }),
  query: { include: ['author', 'author.articles', 'tags'] },
});

const BLOG = { articles: Articles, people: People, tags: Tags };
type Blog = typeof BLOG;

type Kept = '$links' | '$meta' | '$relationships';

interface Person {
  readonly type: 'people';
  readonly id: string;
  readonly name: string;
  readonly twitter: string | null;
  readonly articles: ReadonlyArray<Identifier<'articles'>> | undefined;
  readonly $links?: Links;
  readonly $meta?: Meta;
  readonly $relationships?: Relationships;
}

interface Tag {
  readonly type: 'tags';
  readonly id: string;
  readonly name: string;
  readonly $links?: Links;
  readonly $meta?: Meta;
  readonly $relationships?: Relationships;
}

describe('RecordOf (SPEC 15.6)', () => {
  it('holds every field, each relationship as its linkage, without a query', () => {
    expectTypeOf<RecordOf<Blog, typeof Articles>>().toEqualTypeOf<{
      readonly type: 'articles';
      readonly id: string;
      readonly title: string;
      readonly createdAt: string;
      readonly author: Identifier<'people'> | null | undefined;
      readonly tags: ReadonlyArray<Identifier<'tags'>> | undefined;
      readonly $links?: Links;
      readonly $meta?: Meta;
      readonly $relationships?: Relationships;
    }>();
  });

  it('resolves the relationships a literal include names, linkage below them', () => {
    type Article = RecordOf<
      Blog,
      typeof Articles,
      { readonly include: readonly ['author', 'tags'] }
    >;
    expectTypeOf<Article['author']>().toEqualTypeOf<
      Person | null | undefined
    >();
    expectTypeOf<Article['tags']>().toEqualTypeOf<
      ReadonlyArray<Tag> | undefined
    >();
  });

  it('resolves every segment of a path', () => {
    type Article = RecordOf<
      Blog,
      typeof Articles,
      { readonly include: readonly ['author.articles'] }
    >;
    type Author = NonNullable<Article['author']>;
    type Written = NonNullable<Author['articles']>[number];
    expectTypeOf<Written['title']>().toEqualTypeOf<string>();
    expectTypeOf<Written['author']>().toEqualTypeOf<
      Identifier<'people'> | null | undefined
    >();
    expectTypeOf<Article['tags']>().toEqualTypeOf<
      ReadonlyArray<Identifier<'tags'>> | undefined
    >();
  });

  it('keeps the fields a literal fieldset names', () => {
    type Article = RecordOf<
      Blog,
      typeof Articles,
      {
        readonly include: readonly ['author'];
        readonly fields: {
          readonly articles: readonly ['title', 'author'];
          readonly people: readonly ['name'];
        };
      }
    >;
    expectTypeOf<keyof Article>().toEqualTypeOf<
      'type' | 'id' | 'title' | 'author' | Kept
    >();
    expectTypeOf<keyof NonNullable<Article['author']>>().toEqualTypeOf<
      'type' | 'id' | 'name' | Kept
    >();
  });

  it('types what a query typed as a list may hold: a relationship or its linkage, fields optional', () => {
    type Wide = RecordOf<
      Blog,
      typeof Articles,
      ListQuery<Blog, typeof Articles>
    >;
    expectTypeOf<Wide['title']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Wide>().toHaveProperty('author');
    type Author = Exclude<Wide['author'], null | undefined>;
    expectTypeOf<Extract<Author, Identifier<'people'>>>().not.toBeNever();
    expectTypeOf<Extract<Author, { readonly name?: string }>>().not.toBeNever();
    type Listed = RecordOf<
      Blog,
      typeof Articles,
      { readonly include: ReadonlyArray<'tags'> }
    >;
    expectTypeOf<Listed['tags']>().toEqualTypeOf<
      ReadonlyArray<Tag> | ReadonlyArray<Identifier<'tags'>> | undefined
    >();
  });

  it('is AnyRecord for a type the definitions do not have, and for wide definitions', () => {
    type Article = RecordOf<
      { articles: typeof Articles },
      typeof Articles,
      { readonly include: readonly ['author'] }
    >;
    expectTypeOf<Article['author']>().toEqualTypeOf<
      AnyRecord | null | undefined
    >();
    expectTypeOf<
      RecordOf<Readonly<Record<string, AnyResource>>, AnyResource>
    >().toEqualTypeOf<AnyRecord>();
  });
});
