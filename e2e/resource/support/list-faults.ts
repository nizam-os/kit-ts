/**
 * Defects of `list` the storage contract must catch (resource SPEC 12.8,
 * obligation 5), for `contract-faults.ts`: paging by counting rows, as
 * `offset` does, which walks the same pages as the keyset until a row of
 * an earlier page goes away; filters and sorts named by column, which
 * the declared keyset definition, keyed by public name, refuses wherever
 * the two differ; the order of PostgreSQL's default null placement, which
 * puts nulls first when descending; and sort keys selected as a driver
 * reads them by default, a `timestamptz` at millisecond precision and an
 * `int8` through a double, whose cursors land beside their rows.
 * @ref https://www.postgresql.org/docs/18/queries-order.html (NULLS FIRST is the default for DESC order)
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/ ("with offset–limit pagination, if an item from a prior page is deleted while the client is paginating, all subsequent results will be shifted forward by one")
 */
import type { PageInput } from '@nizam-os/keyset-core';
import type { DeclaredResource } from '@nizam-os/resource-core';
import type {
  PublicRow,
  StorageListRequest,
  StoragePage,
} from '@nizam-os/resource-core/server';

import type { Fault } from './contract-faults.ts';
import type { Adapter } from './faulty-adapters.ts';
import type { ReferenceTransaction } from './reference-sql.ts';

import {
  DEFAULT_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  PageSizeExceededError,
} from '@nizam-os/keyset-core';

import { rewriting, wrapping } from './faulty-adapters.ts';

const OFFSET = 'offset:';
const NULL_PLACEMENT = / nulls (?:first|last)/gu;
const STARTS_AT_KEY = /cast\(("tasks"\."starts_at") as text\)/gu;
const LOG_KEY = 'cast("logs"."id" as text)';

const O5_SORTS =
  'obligation 5: sorts by each sortable field in both directions, nulls last, ties broken by the key';

/** Every row `request` lists, read one page of one row at a time. */
async function everyRow(
  adapter: Adapter,
  tx: ReferenceTransaction,
  resource: DeclaredResource,
  request: StorageListRequest,
): Promise<ReadonlyArray<PublicRow>> {
  const rows: Array<PublicRow> = [];
  let after: string | null = null;
  do {
    const page: StoragePage = await adapter.list(tx, resource, {
      ...request,
      page: after === null ? { size: 1 } : { size: 1, after },
    });
    rows.push(...page.rows);
    after = page.next;
  } while (after !== null);
  return rows;
}

/** The position of the row a cursor of `offsetPaging` names. */
function position(cursor: string): number {
  return Number(cursor.slice(OFFSET.length));
}

/** The positions a page spans among every row: after a cursor's row, or up to it before. */
function span(page: PageInput, size: number): readonly [number, number] {
  if (page.after !== undefined) {
    const start = position(page.after) + 1;
    return [start, start + size];
  }
  if (page.before !== undefined) {
    const end = position(page.before);
    return [Math.max(0, end - size), end];
  }
  return [0, size];
}

/**
 * `list` paged by counting rows, with cursors that name a row by its
 * position, and the declared page bounds kept, so only paging differs.
 */
function offsetPaging(adapter: Adapter): Adapter {
  return {
    ...adapter,
    list: async (tx, resource, request) => {
      const { page } = resource.keyset;
      const size = request.page?.size ?? page?.default ?? DEFAULT_PAGE_SIZE;
      const max = page?.max ?? DEFAULT_MAX_PAGE_SIZE;
      if (size > max) {
        throw new PageSizeExceededError(size, max);
      }
      const all = await everyRow(adapter, tx, resource, request);
      const [start, end] = span(request.page ?? {}, size);
      const rows = all.slice(start, end);
      const cursors = rows.map(
        (_row, index) => `${OFFSET}${String(start + index)}`,
      );
      const hasNext = start + rows.length < all.length;
      const hasPrev = start > 0;
      return {
        rows,
        cursors,
        next: hasNext ? (cursors.at(-1) ?? null) : null,
        prev: hasPrev ? (cursors[0] ?? null) : null,
        hasNext,
        hasPrev,
        size,
        cursor: (row) => cursors[rows.indexOf(row)] ?? '',
      };
    },
  };
}

/** `request` with its filter's and sorts' members named by column; the cases filter by one condition at a time. */
function byColumn(
  resource: DeclaredResource,
  request: StorageListRequest,
): StorageListRequest {
  const column = (name: string): string =>
    resource.fields[name]?.column ?? name;
  const { filter, sort } = request;
  return {
    ...request,
    ...(filter !== undefined && 'field' in filter
      ? { filter: { ...filter, field: column(filter.field) } }
      : {}),
    ...(sort === undefined
      ? {}
      : {
          sort: sort.map((entry) => {
            if (typeof entry !== 'string') {
              return { field: column(entry.field), direction: entry.direction };
            }
            return entry.startsWith('-')
              ? `-${column(entry.slice(1))}`
              : column(entry);
          }),
        }),
  };
}

/** The defects of `list`, each with the cases that must fail. */
export const LIST_FAULTS: ReadonlyArray<Fault> = [
  {
    name: 'pages by counting rows instead of seeking past the cursor',
    fails: [
      'obligation 5: a cursor resumes after its row, though the row was removed since',
    ],
    adapter: wrapping(offsetPaging),
  },
  {
    name: 'names filters and sorts by column instead of public name',
    fails: [
      O5_SORTS,
      'obligation 5: filters with each declared operator on its keyset type',
      'obligation 5: filters a relationship by its foreign key column',
    ],
    adapter: wrapping((adapter) => ({
      ...adapter,
      list: async (tx, resource, request) =>
        adapter.list(tx, resource, byColumn(resource, request)),
    })),
  },
  {
    name: "orders with PostgreSQL's default null placement",
    fails: [O5_SORTS],
    adapter: rewriting((sql) => sql.replaceAll(NULL_PLACEMENT, '')),
  },
  {
    name: 'selects a timestamptz sort key at millisecond precision',
    fails: [O5_SORTS],
    adapter: rewriting((sql) =>
      sql.replaceAll(
        STARTS_AT_KEY,
        "cast(date_trunc('milliseconds', $1) as text)",
      ),
    ),
  },
  {
    name: 'selects an int8 sort key through a double',
    fails: [
      'obligation 5: orders by the key alone, an int8 past 2^53 across partitions',
    ],
    adapter: rewriting((sql) =>
      sql.replaceAll(LOG_KEY, 'cast("logs"."id"::float8::int8 as text)'),
    ),
  },
];
