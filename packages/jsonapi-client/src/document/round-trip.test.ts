/**
 * The round trip (SPEC 15.6): compound documents that `@nizam-os/jsonapi-core`
 * builds from the blog's rows, for each query, sent as JSON text and
 * deserialized with the query's include paths, are the records the rows
 * describe: the fields the fieldsets keep, each relationship on a path
 * resolved and every other one linkage, in linkage order.
 */
import type { Included } from '@nizam-os/jsonapi-core';

import { describe, expect, it } from 'vitest';

import { collectionDocument, include, parseQuery } from '@nizam-os/jsonapi-core';

import { Articles, People, Tags } from '../test-support/blog';
import { deserialize } from './deserialize';

interface Row {
  readonly id: string;
}
interface ArticleRow extends Row {
  readonly title: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly authorId: string | null;
  readonly tagIds: ReadonlyArray<string>;
}
interface PersonRow extends Row {
  readonly name: string;
  readonly twitter: string | null;
  readonly articleIds: ReadonlyArray<string>;
}
interface TagRow extends Row {
  readonly name: string;
}

const PEOPLE: ReadonlyArray<PersonRow> = [
  { id: 'p1', name: 'Ada', twitter: '@ada', articleIds: ['a1', 'a2', 'a5'] },
  { id: 'p2', name: 'Grace', twitter: null, articleIds: ['a3'] },
];
const TAGS: ReadonlyArray<TagRow> = [
  { id: 't1', name: 'json' },
  { id: 't2', name: 'api' },
];
const day = (n: number): Date => new Date(Date.UTC(2026, 0, n));
const ARTICLES: ReadonlyArray<ArticleRow> = [
  {
    id: 'a1',
    title: 'One',
    body: 'b1',
    createdAt: day(1),
    authorId: 'p1',
    tagIds: ['t2', 't1'],
  },
  {
    id: 'a2',
    title: 'Two',
    body: 'b2',
    createdAt: day(2),
    authorId: 'p1',
    tagIds: [],
  },
  {
    id: 'a3',
    title: 'Three',
    body: 'b3',
    createdAt: day(3),
    authorId: 'p2',
    tagIds: ['t2'],
  },
  {
    id: 'a4',
    title: 'Four',
    body: 'b4',
    createdAt: day(4),
    authorId: null,
    tagIds: ['t1'],
  },
];
/** Written by Ada, outside the primary data: reached only through `author.articles`. */
const OUTSIDE: ArticleRow = {
  id: 'a5',
  title: 'Five',
  body: 'b5',
  createdAt: day(5),
  authorId: 'p1',
  tagIds: [],
};

const byId = <TRow extends Row>(rows: ReadonlyArray<TRow>) =>
  new Map(rows.map((row) => [row.id, row]));
const PEOPLE_BY_ID = byId(PEOPLE);
const TAGS_BY_ID = byId(TAGS);
const ARTICLES_BY_ID = byId([...ARTICLES, OUTSIDE]);

type Fieldsets = Readonly<Record<string, ReadonlyArray<string>>>;
type Tree = ReadonlyMap<string, Tree>;

function treeOf(paths: ReadonlyArray<string>): Tree {
  const root = new Map<string, Map<string, unknown>>();
  for (const path of paths) {
    let level: Map<string, unknown> = root;
    for (const name of path.split('.')) {
      const next =
        (level.get(name) as Map<string, unknown> | undefined) ?? new Map();
      level.set(name, next);
      level = next;
    }
  }
  return root as Tree;
}

/** Keeps the members a fieldset names; every member without one. */
function kept(
  type: string,
  fields: Fieldsets,
  members: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const names = fields[type];
  return Object.fromEntries(
    Object.entries(members).filter(
      ([name]) => names === undefined || names.includes(name),
    ),
  );
}

function one<TRow>(
  type: string,
  id: string | null,
  rows: ReadonlyMap<string, TRow>,
  tree: Tree | undefined,
  record: (row: TRow, tree: Tree) => unknown,
): unknown {
  if (id === null) {
    return null;
  }
  const row = rows.get(id);
  return tree === undefined || row === undefined
    ? { type, id }
    : record(row, tree);
}

function many<TRow>(
  type: string,
  ids: ReadonlyArray<string>,
  rows: ReadonlyMap<string, TRow>,
  tree: Tree | undefined,
  record: (row: TRow, tree: Tree) => unknown,
): ReadonlyArray<unknown> {
  return ids.map((id) => one(type, id, rows, tree, record));
}

/** The record a row is, from the rows alone: the oracle the deserialized records meet. */
function expectedArticle(
  row: ArticleRow,
  tree: Tree,
  fields: Fieldsets,
): unknown {
  return {
    type: 'articles',
    id: row.id,
    ...kept('articles', fields, {
      title: row.title,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      author: one(
        'people',
        row.authorId,
        PEOPLE_BY_ID,
        tree.get('author'),
        (person, below) => expectedPerson(person, below, fields),
      ),
      tags: many('tags', row.tagIds, TAGS_BY_ID, tree.get('tags'), (tag) =>
        expectedTag(tag, fields),
      ),
    }),
  };
}

function expectedPerson(
  row: PersonRow,
  tree: Tree,
  fields: Fieldsets,
): unknown {
  return {
    type: 'people',
    id: row.id,
    ...kept('people', fields, {
      name: row.name,
      twitter: row.twitter,
      articles: many(
        'articles',
        row.articleIds,
        ARTICLES_BY_ID,
        tree.get('articles'),
        (article, below) => expectedArticle(article, below, fields),
      ),
    }),
  };
}

function expectedTag(row: TagRow, fields: Fieldsets): unknown {
  return {
    type: 'tags',
    id: row.id,
    ...kept('tags', fields, { name: row.name }),
  };
}

function rowsOf<TRow>(
  rows: ReadonlyMap<string, TRow>,
  ids: ReadonlyArray<string>,
): ReadonlyArray<TRow> {
  return ids.flatMap((id) => {
    const row = rows.get(id);
    return row === undefined ? [] : [row];
  });
}

/** The rows a compound document includes for `paths`: what each segment reaches. */
function includedRows(paths: ReadonlyArray<string>): ReadonlyArray<Included> {
  const reaches = (name: string): boolean =>
    paths.some((path) => path === name || path.startsWith(`${name}.`));
  const authors = reaches('author')
    ? rowsOf(
        PEOPLE_BY_ID,
        ARTICLES.flatMap((article) =>
          article.authorId === null ? [] : [article.authorId],
        ),
      )
    : [];
  const written = paths.includes('author.articles')
    ? rowsOf(
        ARTICLES_BY_ID,
        authors.flatMap((author) => author.articleIds),
      )
    : [];
  const tags = reaches('tags')
    ? rowsOf(
        TAGS_BY_ID,
        ARTICLES.flatMap((article) => article.tagIds),
      )
    : [];
  return [
    include(People, [...new Set(authors)]),
    include(Tags, [...new Set(tags)]),
    include(Articles, [...new Set(written)]),
  ];
}

/** Without the members a record keeps of its resource object, which the rows do not describe. */
function fieldsOnly(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => fieldsOnly(item));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([name]) => !name.startsWith('$'))
      .map(([name, member]) => [name, fieldsOnly(member)]),
  );
}

const QUERIES = [
  '',
  'include=author',
  'include=author,tags',
  'include=author.articles',
  'include=author.articles,tags&fields[articles]=title,author,tags&fields[people]=name,articles',
  'include=tags&fields[tags]=&fields[articles]=tags',
  'fields[articles]=title',
];

describe('documents jsonapi-core builds, deserialized (SPEC 15.6)', () => {
  it.each(QUERIES)('are the records the rows describe: ?%s', (queryString) => {
    const query = parseQuery(Articles, queryString);
    const paths = (query.include ?? []).map((path) => path.join('.'));
    const document = collectionDocument(Articles, ARTICLES, {
      query,
      included: includedRows(paths),
    });
    const sent: unknown = JSON.parse(JSON.stringify(document));
    const { data, included } = deserialize(sent, { include: paths });
    const { fields } = query;
    const tree = treeOf(paths);
    expect(fieldsOnly(data)).toEqual(
      ARTICLES.map((row) => expectedArticle(row, tree, fields)),
    );
    expect(included).toHaveLength(
      (sent as { included?: ReadonlyArray<unknown> }).included?.length ?? 0,
    );
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
