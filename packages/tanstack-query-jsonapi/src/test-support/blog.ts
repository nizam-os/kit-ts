/**
 * The blog the binding's tests read and write: articles that sort, filter,
 * search through `filter[q]`, include their author and tags, and paginate;
 * people, who paginate too; and tags, which do not. Typed wide, as
 * `isolatedDeclarations` asks of an export; the type tests define what
 * they infer from locally. Never published.
 * @packageDocumentation
 */
import type { AnyResource } from '@nizam-os/jsonapi-core';

import { createDefineResource } from '@nizam-os/jsonapi-core';

const defineResource = createDefineResource({
  links: { base: 'https://blog.example/api' },
});

interface ArticleRow {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly views: number;
  readonly authorId: string | null;
  readonly tagIds: ReadonlyArray<string>;
}

interface PersonRow {
  readonly id: string;
  readonly name: string;
  readonly articleIds: ReadonlyArray<string>;
}

export const Tags: AnyResource = defineResource({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
  query: { sort: ['name'] },
});

export const People: AnyResource = defineResource({
  type: 'people',
  attributes: ['name'],
  relationships: {
    articles: {
      type: 'articles',
      cardinality: 'many',
      resource: (): AnyResource => Articles,
    },
  },
  serialize: (row: PersonRow) => ({
    id: row.id,
    attributes: { name: row.name },
    relationships: { articles: row.articleIds },
  }),
  query: { sort: ['name'], page: { default: 10, max: 50 } },
});

export const Articles: AnyResource = defineResource({
  type: 'articles',
  attributes: ['title', 'body', 'views'],
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
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body, views: row.views },
    relationships: { author: row.authorId, tags: row.tagIds },
  }),
  query: {
    sort: ['title', 'views'],
    filter: {
      title: ['eq', 'like'],
      views: ['gte', 'lt'],
      author: ['eq', 'in'],
    },
    include: ['author', 'tags'],
    page: { default: 2, max: 4 },
    search: 'filter[q]',
  },
});
