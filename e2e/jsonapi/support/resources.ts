/**
 * The resource definitions of the blog, shared by the routes and the atomic
 * handlers. Module-level so `typeof Articles` types the validators and
 * handlers everywhere.
 */
import type { AnyResource } from '@nizam-os/jsonapi-core';

import type { ArticleRow, PersonRow, TagRow } from './store.ts';

import { z } from 'zod';

import { createDefineResource } from '@nizam-os/jsonapi-core';

export const BASE_URL = 'https://blog.example';

/** Every definition derives its links from the blog's origin (SPEC 5.1). */
const defineResource = createDefineResource({ links: { base: BASE_URL } });

/** A person with the ids of their articles, resolved by the caller. */
export interface PersonView extends PersonRow {
  readonly articleIds: ReadonlyArray<string>;
}

const CreateArticle = z.object({
  title: z.string().min(1),
  body: z.string().default(''),
});
/** Not `CreateArticle.partial()`: a default would overwrite the stored body. */
const UpdateArticle = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
});

export const People = defineResource({
  type: 'people',
  attributes: ['name', 'twitter'],
  relationships: {
    articles: {
      type: 'articles',
      cardinality: 'many',
      resource: (): AnyResource => Articles,
    },
  },
  serialize: (row: PersonView) => ({
    id: row.id,
    attributes: { name: row.name, twitter: row.twitter },
    relationships: { articles: row.articleIds },
  }),
  validate: {
    create: z.object({
      name: z.string().min(1),
      twitter: z.string().nullable().default(null),
    }),
  },
  // A person's articles are the articles that name them as author.
  writable: { create: ['name', 'twitter'], update: ['name', 'twitter'] },
});

export const Tags = defineResource({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: TagRow) => ({ id: row.id, attributes: { name: row.name } }),
});

export const Articles = defineResource({
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
    sort: ['title', 'createdAt'],
    filter: { title: ['eq', 'like'], author: ['eq'] },
    include: ['author', 'author.articles', 'tags'],
    page: { default: 2, max: 4 },
    search: 'filter[q]',
  },
  validate: { create: CreateArticle, update: UpdateArticle },
  // The server stamps `createdAt`.
  writable: {
    create: ['title', 'body', 'author', 'tags'],
    update: ['title', 'body', 'author', 'tags'],
  },
});
