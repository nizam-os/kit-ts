/**
 * The atomic operations endpoint of the blog: typed handlers per resource
 * and a snapshot transaction that rolls the store back on failure. Under
 * `@nizam-os/hono-jsonapi` the handler context is the Hono `Context`.
 */
import type { Context } from 'hono';

import type { JsonApiEnv } from '@nizam-os/hono-jsonapi';
import type {
  AtomicOptions,
  ResourceHandlers,
} from '@nizam-os/hono-jsonapi/atomic';

import type { ArticleRow, PersonRow, Store } from './store.ts';

import {
  jsonApiError,
  toManyLinkage,
  toOneLinkage,
} from '@nizam-os/hono-jsonapi';

import { Articles, People } from './resources.ts';

const TIMESTAMP = '2026-02-01T00:00:00Z';

function article(tx: Store, id: string): ArticleRow {
  const row = tx.articles.get(id);
  if (row === undefined) {
    throw jsonApiError('NOT_FOUND', {
      detail: `Article ${id} does not exist`,
    });
  }
  return row;
}

const articles: ResourceHandlers<
  typeof Articles,
  Store,
  Context<JsonApiEnv>
> = {
  resource: Articles,
  create: ({ data }, { tx }) => {
    const row: ArticleRow = {
      id: tx.id(),
      title: data.attributes.title,
      body: data.attributes.body,
      createdAt: TIMESTAMP,
      authorId: toOneLinkage(data.relationships['author'])?.id ?? null,
      tagIds: (toManyLinkage(data.relationships['tags']) ?? []).map(
        (tag) => tag.id,
      ),
    };
    tx.articles.set(row.id, row);
    return row;
  },
  update: ({ id, data }, { tx }) => {
    const current = article(tx, id);
    const row = { ...current, title: data.attributes.title ?? current.title };
    tx.articles.set(id, row);
    return row;
  },
  remove: ({ id }, { tx }) => {
    article(tx, id);
    tx.articles.delete(id);
  },
  relationships: {
    author: {
      update: ({ id, data }, { tx }) => {
        tx.articles.set(id, {
          ...article(tx, id),
          authorId: toOneLinkage(data)?.id ?? null,
        });
      },
    },
    tags: {
      add: ({ id, data }, { tx }) => {
        const row = article(tx, id);
        tx.articles.set(id, {
          ...row,
          tagIds: [...new Set([...row.tagIds, ...data.map((tag) => tag.id)])],
        });
      },
    },
  },
};

const people: ResourceHandlers<typeof People, Store, Context<JsonApiEnv>> = {
  resource: People,
  create: ({ data }, { tx }) => {
    const row: PersonRow = {
      id: tx.id(),
      name: data.attributes.name,
      twitter: data.attributes.twitter,
    };
    tx.people.set(row.id, row);
    return { ...row, articleIds: [] };
  },
};

export function atomicOptions(
  store: Store,
): AtomicOptions<Store, Context<JsonApiEnv>> {
  return {
    resources: [articles, people],
    transaction: async (_ctx, run) => {
      const snapshot = store.snapshot();
      try {
        return await run(store);
      } catch (error) {
        store.restore(snapshot);
        throw error;
      }
    },
  };
}
