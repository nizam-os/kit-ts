import type { SelectQueryBuilder } from 'kysely';

/**
 * `paginate` (SPEC 10): the plan rendered onto the caller's select query.
 * The filter goes into `where`; the total (when asked for) counts that
 * much; the page statement (`page-query.ts`) adds the seek, the text-cast
 * key selections, the `order by` with its null placement, and
 * `limit size + 1`. The key selections come back under private aliases
 * and are stripped before the rows reach the caller.
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

import type {
  AnyQuery,
  PaginateOptions,
  QueryEvent,
  RenderContext,
} from './types';

import { pageQuery } from './page-query';
import { renderPredicate } from './render/predicate';

type Reporter = (event: QueryEvent) => void;

async function run<TRow>(
  query: AnyQuery<TRow>,
  kind: QueryEvent['kind'],
  report: Reporter | undefined,
): Promise<Array<TRow>> {
  if (report === undefined) {
    return query.execute();
  }
  const compiled = query.compile();
  const started = performance.now();
  const rows = await query.execute();
  report({
    kind,
    sql: compiled.sql,
    parameters: compiled.parameters,
    durationMs: performance.now() - started,
    rowCount: rows.length,
  });
  return rows;
}

async function countTotal<TRow>(
  filtered: AnyQuery<TRow>,
  report: Reporter | undefined,
): Promise<number> {
  const query = filtered
    .clearSelect()
    .clearOrderBy()
    .clearLimit()
    .clearOffset()
    .select((eb) => eb.fn.countAll<string | number | bigint>().as('total'));
  const [row] = await run(query, 'total', report);
  return row === undefined ? 0 : Number(row.total);
}

function isRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads the key values of a fetched row and returns the row without the private aliases. */
function splitRow<TRow>(
  fetched: TRow,
  plan: QueryPlan,
): { readonly row: TRow; readonly values: ReadonlyArray<CursorValue> } {
  if (!isRow(fetched)) {
    throw new TypeError('paginate expects object rows');
  }
  const aliases = new Set(
    plan.keys.flatMap((key) => [key.alias, key.valueAlias]),
  );
  const values = plan.keys.map((key) => {
    const value = fetched[key.alias];
    return typeof value === 'string' ? value : null;
  });
  const cleaned = Object.fromEntries(
    Object.entries(fetched).filter(([name]) => !aliases.has(name)),
  );
  // The fetched row is the caller's row type plus the alias columns the
  // query added, values included in a union of the seek's branches;
  // removing exactly those gives the caller's row back.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the plan's aliases are the only columns paginate added to the caller's selection
  return { row: cleaned as TRow, values };
}

/**
 * Plans `request` with `keyset`, renders the plan onto `query`, runs it,
 * and assembles the page. `query` must be a plain selection of the
 * definition's table (no `distinct`, `group by`, or set operations): its
 * `order by`, `limit`, and `offset` are replaced, and the key columns are
 * added to its selection under aliases that are stripped again.
 */
export async function paginate<
  TFields extends FieldsInit,
  TRelations extends RelationsInit,
  TDatabase,
  TTable extends keyof TDatabase,
  TRow,
>(
  keyset: Keyset<TFields, TRelations>,
  query: SelectQueryBuilder<TDatabase, TTable, TRow>,
  request: KeysetRequestOf<TFields, TRelations>,
  options: PaginateOptions = {},
): Promise<Page<TRow>> {
  const plan = await keyset.plan(request, { context: options.context });
  const context: RenderContext = { table: plan.table };
  // The caller's DB and table types do not matter to rendering: every
  // name the plan carries is a validated identifier of the definition.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: rendering happens against validated identifiers from the definition, not the caller's DB type
  const base = query as unknown as AnyQuery<TRow>;
  const { filter } = plan;
  const filtered =
    filter === null
      ? base
      : base.where((eb) => renderPredicate(eb, filter, context));
  const total =
    options.total === true
      ? await countTotal(filtered, options.onQuery)
      : undefined;
  const fetched = await run(
    pageQuery(filtered, plan, context),
    'page',
    options.onQuery,
  );
  const split = fetched.map((item) => splitRow(item, plan));
  const valuesByRow = new Map(split.map(({ row, values }) => [row, values]));
  return keyset.page(
    plan,
    split.map(({ row }) => row),
    (row) => valuesByRow.get(row) ?? [],
    { total },
  );
}
