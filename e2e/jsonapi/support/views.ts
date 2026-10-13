/**
 * What the blog's routes read from the store: a person with the ids of
 * their articles, an article or the 404 for a missing one, and the
 * included resources a query asks for.
 */
import type { Included, ParsedQuery } from '@nizam-os/hono-jsonapi';

import type { PersonView } from './resources.ts';
import type { ArticleRow, PersonRow, Store } from './store.ts';

import { include, jsonApiError } from '@nizam-os/hono-jsonapi';

import { Articles, People, Tags } from './resources.ts';

export function defined<T>(rows: ReadonlyArray<T | undefined>): Array<T> {
  return rows.filter((row): row is T => row !== undefined);
}

export function personView(store: Store, row: PersonRow): PersonView {
  return {
    ...row,
    articleIds: store.articlesOf(row.id).map((item) => item.id),
  };
}

export function articleOf(store: Store, id: string): ArticleRow {
  const row = store.articles.get(id);
  if (row === undefined) {
    throw jsonApiError('NOT_FOUND', {
      detail: `Article ${id} does not exist`,
    });
  }
  return row;
}

/** Only what the client asked for: full linkage rejects anything else. */
export function includedFor(
  store: Store,
  rows: ReadonlyArray<ArticleRow>,
  query: ParsedQuery,
): Array<Included> {
  const paths = new Set((query.include ?? []).map((path) => path.join('.')));
  const out: Array<Included> = [];
  const authors = defined(
    [...new Set(rows.map((row) => row.authorId))].map((id) =>
      id === null ? undefined : store.people.get(id),
    ),
  );
  if (paths.has('author') || paths.has('author.articles')) {
    out.push(
      include(
        People,
        authors.map((row) => personView(store, row)),
      ),
    );
  }
  if (paths.has('author.articles')) {
    out.push(
      include(
        Articles,
        authors.flatMap((author) => store.articlesOf(author.id)),
      ),
    );
  }
  if (paths.has('tags')) {
    const tags = defined(
      [...new Set(rows.flatMap((row) => row.tagIds))].map((id) =>
        store.tags.get(id),
      ),
    );
    out.push(include(Tags, tags));
  }
  return out;
}
