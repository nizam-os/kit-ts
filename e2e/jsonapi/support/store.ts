/**
 * The in-memory data behind the e2e and smoke apps: a blog with people,
 * tags, and articles, a keyset pagination engine over it, and a snapshot
 * that stands in for a database transaction.
 */
import type {
  FilterCondition,
  PageRequest,
  ParsedFilter,
  SortField,
} from '@nizam-os/jsonapi-core';

import { invalidCursor } from '@nizam-os/jsonapi-core';

export interface PersonRow {
  readonly id: string;
  readonly name: string;
  readonly twitter: string | null;
}

export interface TagRow {
  readonly id: string;
  readonly name: string;
}

export interface ArticleRow {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly authorId: string | null;
  readonly tagIds: ReadonlyArray<string>;
}

export type ArticleSort = 'title' | 'createdAt';
export type ArticleFilter = 'title' | 'author';

export interface ArticleQuery {
  readonly sort: ReadonlyArray<SortField<ArticleSort>>;
  readonly filter: ParsedFilter<ArticleFilter>;
  readonly search: string | undefined;
  readonly page: PageRequest;
  /** A related collection's owner, from its path: only the articles that person wrote. */
  readonly author?: string | undefined;
}

export interface Snapshot {
  readonly people: Map<string, PersonRow>;
  readonly tags: Map<string, TagRow>;
  readonly articles: Map<string, ArticleRow>;
  readonly nextId: number;
}

export interface PageResult {
  readonly rows: ReadonlyArray<ArticleRow>;
  readonly next: string | null;
  readonly prev: string | null;
  readonly total: number;
}

const SEED_PEOPLE: ReadonlyArray<PersonRow> = [
  { id: '1', name: 'Dan Gebhardt', twitter: 'dgeb' },
  { id: '2', name: 'Ada Lovelace', twitter: null },
  { id: '3', name: 'Grace Hopper', twitter: 'grace' },
];
const SEED_TAGS: ReadonlyArray<TagRow> = [
  { id: 't1', name: 'json' },
  { id: 't2', name: 'api' },
  { id: 't3', name: 'hono' },
];
const SEED_ARTICLES: ReadonlyArray<ArticleRow> = [
  {
    id: '1',
    title: 'JSON:API paints my bikeshed!',
    body: 'A',
    createdAt: '2026-01-01T00:00:00Z',
    authorId: '1',
    tagIds: ['t1', 't2'],
  },
  {
    id: '2',
    title: 'Rails is Omakase',
    body: 'B',
    createdAt: '2026-01-02T00:00:00Z',
    authorId: '1',
    tagIds: ['t2'],
  },
  {
    id: '3',
    title: 'Analytical engines',
    body: 'C',
    createdAt: '2026-01-03T00:00:00Z',
    authorId: '2',
    tagIds: [],
  },
  {
    id: '4',
    title: 'Compilers',
    body: 'D',
    createdAt: '2026-01-04T00:00:00Z',
    authorId: '3',
    tagIds: ['t3'],
  },
  {
    id: '5',
    title: 'Nanoseconds',
    body: 'E',
    createdAt: '2026-01-05T00:00:00Z',
    authorId: '3',
    tagIds: ['t1', 't3'],
  },
];
const FIRST_UNUSED_ID = 6;

/** Opaque to clients: a cursor names the row it falls on. */
export function cursorOf(row: ArticleRow): string {
  return btoa(row.id);
}

function decodeCursor(
  cursor: string,
  parameter: 'page[after]' | 'page[before]',
): string {
  try {
    return atob(cursor);
  } catch {
    throw invalidCursor(parameter);
  }
}

function matches(
  row: ArticleRow,
  condition: FilterCondition<ArticleFilter>,
): boolean {
  const value =
    typeof condition.value === 'string'
      ? condition.value
      : (condition.value[0] ?? '');
  if (condition.field === 'author') {
    return row.authorId === value;
  }
  return condition.operator === 'like'
    ? row.title.toLowerCase().includes(value.toLowerCase())
    : row.title === value;
}

function select(
  rows: ReadonlyArray<ArticleRow>,
  query: ArticleQuery,
): Array<ArticleRow> {
  const search = query.search?.toLowerCase();
  return rows.filter(
    (row) =>
      (query.author === undefined || row.authorId === query.author) &&
      (search === undefined ||
        `${row.title} ${row.body}`.toLowerCase().includes(search)) &&
      query.filter.conditions.every((condition) => matches(row, condition)) &&
      query.filter.anyOf.every((group) =>
        group.some((condition) => matches(row, condition)),
      ),
  );
}

function compare(
  a: ArticleRow,
  b: ArticleRow,
  sort: ReadonlyArray<SortField<ArticleSort>>,
): number {
  for (const { field, direction } of sort) {
    const order = a[field].localeCompare(b[field]);
    if (order !== 0) {
      return direction === 'asc' ? order : -order;
    }
  }
  return a.id.localeCompare(b.id);
}

export class Store {
  public people: Map<string, PersonRow> = new Map(
    SEED_PEOPLE.map((row) => [row.id, row]),
  );
  public tags: Map<string, TagRow> = new Map(
    SEED_TAGS.map((row) => [row.id, row]),
  );
  public articles: Map<string, ArticleRow> = new Map(
    SEED_ARTICLES.map((row) => [row.id, row]),
  );
  public nextId: number = FIRST_UNUSED_ID;
  public rollbacks = 0;

  public id(): string {
    const id = String(this.nextId);
    this.nextId += 1;
    return id;
  }

  public snapshot(): Snapshot {
    return {
      people: new Map(this.people),
      tags: new Map(this.tags),
      articles: new Map(this.articles),
      nextId: this.nextId,
    };
  }

  public restore(snapshot: Snapshot): void {
    this.people = new Map(snapshot.people);
    this.tags = new Map(snapshot.tags);
    this.articles = new Map(snapshot.articles);
    this.nextId = snapshot.nextId;
    this.rollbacks += 1;
  }

  public articlesOf(authorId: string): ReadonlyArray<ArticleRow> {
    return [...this.articles.values()].filter(
      (row) => row.authorId === authorId,
    );
  }

  /** Keyset pagination: the cursors are the boundary rows of the page. */
  public page(query: ArticleQuery): PageResult {
    const ordered = select([...this.articles.values()], query).toSorted(
      (a, b) => compare(a, b, query.sort),
    );
    const ids = ordered.map((row) => row.id);
    const { page } = query;
    const start =
      page.after === undefined
        ? 0
        : ids.indexOf(decodeCursor(page.after, 'page[after]')) + 1;
    const beforeIndex =
      page.before === undefined
        ? -1
        : ids.indexOf(decodeCursor(page.before, 'page[before]'));
    const end = beforeIndex === -1 ? ordered.length : beforeIndex;
    const window = ordered.slice(start, end);
    const backwards = page.before !== undefined && page.after === undefined;
    const rows = backwards
      ? window.slice(Math.max(0, window.length - page.size))
      : window.slice(0, page.size);
    const first = rows[0];
    const last = rows.at(-1);
    return {
      rows,
      next:
        last !== undefined && ids.indexOf(last.id) < ordered.length - 1
          ? cursorOf(last)
          : null,
      prev:
        first !== undefined && ids.indexOf(first.id) > 0
          ? cursorOf(first)
          : null,
      total: ordered.length,
    };
  }
}
