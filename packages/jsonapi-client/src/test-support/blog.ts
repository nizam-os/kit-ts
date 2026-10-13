/**
 * The blog the client's runtime tests call: articles that paginate, search
 * through `filter[q]`, and take a custom parameter; people that search
 * through a custom base name; tags with neither. Typed wide, as
 * `isolatedDeclarations` asks of an export; the type tests define what
 * they infer from locally. Never published.
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
  readonly createdAt: Date;
  readonly authorId: string | null;
  readonly tagIds: ReadonlyArray<string>;
}

interface PersonRow {
  readonly id: string;
  readonly name: string;
  readonly twitter: string | null;
  readonly articleIds: ReadonlyArray<string>;
}

export const Tags: AnyResource = defineResource({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
  query: { sort: ['name'], filter: { name: ['eq', 'in'] } },
});

export const People: AnyResource = defineResource({
  type: 'people',
  attributes: ['name', 'twitter'],
  relationships: {
    articles: {
      type: 'articles',
      cardinality: 'many',
      resource: (): AnyResource => Articles,
    },
  },
  serialize: (row: PersonRow) => ({
    id: row.id,
    attributes: { name: row.name, twitter: row.twitter },
    relationships: { articles: row.articleIds },
  }),
  query: {
    filter: { name: ['eq', 'like'], twitter: ['isNull'] },
    include: ['articles', 'articles.tags'],
    page: { default: 10, max: 50 },
    search: 'searchTerm',
  },
});

export const Articles: AnyResource = defineResource({
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
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body, createdAt: row.createdAt },
    relationships: { author: row.authorId, tags: row.tagIds },
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
