/**
 * The blog's routes: resources, relationships, the related links its
 * documents name, and the two routes the error tests need. Everything a
 * handler does with a request or response goes through the package.
 */
import type { Context, Hono } from 'hono';

import type { JsonApiEnv, ParsedQuery } from '@nizam-os/hono-jsonapi';

import type { PersonView } from './resources.ts';
import type {
  ArticleFilter,
  ArticleRow,
  ArticleSort,
  PersonRow,
  Store,
} from './store.ts';

import {
  bodyValidator,
  collectionDocument,
  jsonApiError,
  paginatedDocument,
  queryValidator,
  relationshipValidator,
  resourceDocument,
  respond,
  toManyLinkage,
  toManyRelationshipDocument,
  toOneLinkage,
  toOneRelationshipDocument,
} from '@nizam-os/hono-jsonapi';

import { Articles, BASE_URL, People, Tags } from './resources.ts';
import { cursorOf } from './store.ts';
import { articleOf, defined, includedFor, personView } from './views.ts';

const TIMESTAMP = '2026-02-01T00:00:00Z';

export function registerRoutes(app: Hono<JsonApiEnv>, store: Store): void {
  const view = (row: PersonRow): PersonView => personView(store, row);
  const article = (id: string): ArticleRow => articleOf(store, id);

  /** A page of articles as `GET /articles` answers it; `author` keeps the ones that person wrote. */
  function articlesPage(
    c: Context<JsonApiEnv>,
    query: ParsedQuery<ArticleSort, ArticleFilter>,
    author?: string,
  ): Response {
    if (query.page === undefined) {
      throw new TypeError('articles always paginate');
    }
    const page = store.page({
      sort: query.sort,
      filter: query.filter,
      search: query.search,
      page: query.page,
      author,
    });
    return respond(
      c,
      paginatedDocument(
        Articles,
        { ...page, cursor: cursorOf },
        {
          url: c.req.url,
          query,
          included: includedFor(store, page.rows, query),
        },
      ),
    );
  }

  app.get('/runtime', (c) => c.text(navigator.userAgent));

  app.get('/articles', queryValidator(Articles), (c) =>
    articlesPage(c, c.req.valid('query')),
  );

  app.get('/articles/:id', queryValidator(Articles), (c) => {
    const query = c.req.valid('query');
    const row = article(c.req.param('id'));
    return respond(
      c,
      resourceDocument(Articles, row, {
        query,
        included: includedFor(store, [row], query),
        links: { self: `${BASE_URL}/articles/${row.id}` },
      }),
    );
  });

  app.post(
    '/articles',
    bodyValidator(Articles, { operation: 'create' }),
    (c) => {
      const data = c.req.valid('json');
      const row: ArticleRow = {
        id: store.id(),
        title: data.attributes.title,
        body: data.attributes.body,
        createdAt: TIMESTAMP,
        authorId: toOneLinkage(data.relationships['author'])?.id ?? null,
        tagIds: (toManyLinkage(data.relationships['tags']) ?? []).map(
          (tag) => tag.id,
        ),
      };
      store.articles.set(row.id, row);
      return respond(c, resourceDocument(Articles, row), 201);
    },
  );

  app.patch(
    '/articles/:id',
    bodyValidator(Articles, { operation: 'update' }),
    (c) => {
      const data = c.req.valid('json');
      const current = article(c.req.param('id'));
      const row: ArticleRow = {
        ...current,
        title: data.attributes.title ?? current.title,
        body: data.attributes.body ?? current.body,
      };
      store.articles.set(row.id, row);
      return respond(c, resourceDocument(Articles, row));
    },
  );

  app.delete('/articles/:id', (c) => {
    article(c.req.param('id'));
    store.articles.delete(c.req.param('id'));
    return c.body(null, 204);
  });

  app.get('/articles/:id/relationships/author', (c) => {
    const row = article(c.req.param('id'));
    const author =
      row.authorId === null ? undefined : store.people.get(row.authorId);
    return respond(
      c,
      toOneRelationshipDocument(
        People,
        author === undefined ? null : view(author),
        {
          links: Articles.links.relationship?.(row.id, 'author'),
        },
      ),
    );
  });

  app.patch(
    '/articles/:id/relationships/author',
    relationshipValidator(Articles, 'author', 'one'),
    (c) => {
      const row = article(c.req.param('id'));
      store.articles.set(row.id, {
        ...row,
        authorId: c.req.valid('json')?.id ?? null,
      });
      return c.body(null, 204);
    },
  );

  app.get('/articles/:id/relationships/tags', (c) => {
    const row = article(c.req.param('id'));
    const tags = defined(row.tagIds.map((id) => store.tags.get(id)));
    return respond(c, toManyRelationshipDocument(Tags, tags));
  });

  app.on(
    ['POST', 'PATCH', 'DELETE'],
    '/articles/:id/relationships/tags',
    relationshipValidator(Articles, 'tags', 'many'),
    (c) => {
      const row = article(c.req.param('id'));
      const ids = c.req.valid('json').map((tag) => tag.id);
      const merged: Record<string, ReadonlyArray<string>> = {
        PATCH: ids,
        POST: [...new Set([...row.tagIds, ...ids])],
        DELETE: row.tagIds.filter((id) => !ids.includes(id)),
      };
      store.articles.set(row.id, {
        ...row,
        tagIds: merged[c.req.method] ?? row.tagIds,
      });
      return c.body(null, 204);
    },
  );

  // The related links every document names (SPEC 5.1): the resource or
  // resources a relationship links, read with the target's query.
  app.get('/articles/:id/author', queryValidator(People), (c) => {
    const row = article(c.req.param('id'));
    const author =
      row.authorId === null ? undefined : store.people.get(row.authorId);
    return respond(
      c,
      resourceDocument(People, author === undefined ? null : view(author), {
        query: c.req.valid('query'),
      }),
    );
  });

  app.get('/articles/:id/tags', queryValidator(Tags), (c) => {
    const row = article(c.req.param('id'));
    return respond(
      c,
      collectionDocument(
        Tags,
        defined(row.tagIds.map((id) => store.tags.get(id))),
        { query: c.req.valid('query') },
      ),
    );
  });

  // A person's articles page like the collection does.
  app.get('/people/:id/articles', queryValidator(Articles), (c) => {
    const person = store.people.get(c.req.param('id'));
    if (person === undefined) {
      throw jsonApiError('NOT_FOUND');
    }
    return articlesPage(c, c.req.valid('query'), person.id);
  });

  // Mounted like every relationship's route; the validator refuses the
  // update, since a person's articles are not writable.
  app.patch(
    '/people/:id/relationships/articles',
    relationshipValidator(People, 'articles', 'many'),
    (c) => c.body(null, 204),
  );

  app.get('/people', (c) =>
    respond(
      c,
      collectionDocument(
        People,
        [...store.people.values()].map((row) => view(row)),
      ),
    ),
  );

  app.get('/people/:id', (c) => {
    const row = store.people.get(c.req.param('id'));
    if (row === undefined) {
      throw jsonApiError('NOT_FOUND');
    }
    return respond(c, resourceDocument(People, view(row)));
  });

  app.get('/boom', () => {
    throw new Error('secret connection string');
  });
}
