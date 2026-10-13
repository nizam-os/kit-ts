import type { SQL } from 'drizzle-orm';
import type { PgTable, SelectedFields } from 'drizzle-orm/pg-core';
import type { SelectResultFields } from 'drizzle-orm/query-builders/select.types';

/**
 * `keyset.paginate` (SPEC 14.3, ADR 0017): the plan rendered as Drizzle
 * `sql` into the page select `page-query.ts` builds over the definition's
 * table, where the caller's `where`, the filter, and the seek hold; the
 * total (when asked for) counts the first two. The caller's selection
 * gets the keys under private aliases, which are stripped before the rows
 * reach the caller.
 * @ref https://orm.drizzle.team/docs/select#aggregations-helpers (count)
 * @ref https://www.postgresql.org/docs/current/sql-expressions.html#SQL-SYNTAX-TYPE-CASTS
 * @packageDocumentation
 */
import type {
  CursorValue,
  FieldsInit,
  Keyset,
  KeysetRequestOf,
  Page,
  QueryPlan,
  RelationsInit,
} from '@nizam-os/keyset-core';

import type { Statement } from './page-query';
import type {
  KeysetDatabase,
  KeysetSchema,
  PaginateOptions,
  QueryEvent,
  RenderContext,
} from './types';

import { count, getTableColumns } from 'drizzle-orm';

import { conjunction, pageQuery } from './page-query';
import { renderPredicate } from './render/predicate';
import { table } from './render/target';

/** The names the plan gives the sort keys and their values: reserved in a caller's selection. */
const KEY_ALIAS = /^keyset\d+v?$/u;

type Reporter = (event: QueryEvent) => void;

async function run<TRow>(
  query: Statement<TRow>,
  kind: QueryEvent['kind'],
  report: Reporter | undefined,
): Promise<Array<TRow>> {
  if (report === undefined) {
    return query.execute();
  }
  const compiled = query.toSQL();
  const started = performance.now();
  const rows = await query.execute();
  report({
    kind,
    sql: compiled.sql,
    parameters: compiled.params,
    durationMs: performance.now() - started,
    rowCount: rows.length,
  });
  return rows;
}

function checkSelection(selection: SelectedFields | undefined): void {
  for (const name of Object.keys(selection ?? {})) {
    if (KEY_ALIAS.test(name)) {
      throw new TypeError(
        `select has a member named ${name}: paginate reserves the names keyset0, keyset0v, keyset1, keyset1v, ... for the sort keys`,
      );
    }
  }
}

async function countTotal(
  db: KeysetDatabase,
  from: PgTable,
  where: SQL | undefined,
  report: Reporter | undefined,
): Promise<number> {
  const query = db.select({ total: count() }).from(from).where(where);
  const [row] = await run(query, 'total', report);
  return row === undefined ? 0 : row.total;
}

/** Reads the key values of a fetched row and returns the row without the private aliases. */
function splitRow(
  fetched: Record<string, unknown>,
  plan: QueryPlan,
): {
  readonly row: Record<string, unknown>;
  readonly values: ReadonlyArray<CursorValue>;
} {
  const aliases = new Set(
    plan.keys.flatMap((key) => [key.alias, key.valueAlias]),
  );
  const values = plan.keys.map((key) => {
    const value = fetched[key.alias];
    return typeof value === 'string' ? value : null;
  });
  const row = Object.fromEntries(
    Object.entries(fetched).filter(([name]) => !aliases.has(name)),
  );
  return { row, values };
}

/**
 * Plans `request` with `keyset`, builds and runs the page select over the
 * plan's table of `schema` on `db`, and assembles the page (SPEC 14.3).
 */
export async function paginate<
  TFields extends FieldsInit,
  TRelations extends RelationsInit,
  TSelection extends SelectedFields,
>(
  keyset: Keyset<TFields, TRelations>,
  schema: KeysetSchema,
  db: KeysetDatabase,
  request: KeysetRequestOf<TFields, TRelations>,
  options: PaginateOptions<TSelection> = {},
): Promise<Page<SelectResultFields<TSelection>>> {
  checkSelection(options.select);
  const plan = await keyset.plan(request, { context: options.context });
  const context: RenderContext = { schema, table: plan.table };
  const from = table(context, plan.table);
  const filter =
    plan.filter === null ? undefined : renderPredicate(plan.filter, context);
  const parts = [options.where, filter];
  const total =
    options.total === true
      ? await countTotal(db, from, conjunction(parts), options.onQuery)
      : undefined;
  const fetched = await run(
    pageQuery(
      db,
      from,
      options.select ?? getTableColumns(from),
      parts,
      plan,
      context,
    ),
    'page',
    options.onQuery,
  );
  const split = fetched.map((item) => splitRow(item, plan));
  const valuesByRow = new Map(split.map(({ row, values }) => [row, values]));
  // Without the aliases, a row is what Drizzle selected for the caller's
  // selection, or for the table's columns when there is none, which is
  // the type `TSelection` defaults to.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the plan's aliases are the only members paginate added to the selection the rows are typed by
  const rows = split.map(({ row }) => row) as Array<
    SelectResultFields<TSelection>
  >;
  return keyset.page(plan, rows, (row) => valuesByRow.get(row) ?? [], {
    total,
  });
}
