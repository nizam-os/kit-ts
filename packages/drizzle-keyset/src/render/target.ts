import type { SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Targets (SPEC 14.2) as Drizzle SQL. Every column reference is its own
 * nested `sql` chunk around Drizzle's column object: in a query over one
 * table, Drizzle prints a column directly inside a selected expression
 * without its table and a column nested one level deeper with it, so a
 * correlated aggregate keeps both sides of its join qualified wherever it
 * is selected (ADR 0017). Drizzle's own objects print the names, so the
 * database's `casing` and a `pgSchema` table come out as in the
 * application's queries. Aggregates are correlated scalar subqueries; the
 * search concatenation is `concat_ws(' ', ...)`, which skips nulls.
 * @ref https://orm.drizzle.team/docs/sql (tables and columns print with escaped names)
 * @ref https://github.com/drizzle-team/drizzle-orm/issues/4696 (a correlated subquery losing its tables)
 * @ref https://www.postgresql.org/docs/current/functions-string.html (concat_ws)
 * @ref https://www.postgresql.org/docs/current/functions-subquery.html (scalar subqueries)
 * @packageDocumentation
 */
import type {
  AggregateFunction,
  AggregateTarget,
  ConcatTarget,
  Relation,
  Target,
} from '@nizam-os/keyset-core';

import type { RenderContext } from '../types';

import { sql } from 'drizzle-orm';

import { columnOf, tableOf } from '../schema';

/** The plan's aggregate functions, the only text of theirs that reaches SQL. */
const FUNCTIONS: Readonly<Record<AggregateFunction, SQL>> = {
  count: sql.raw('count'),
  max: sql.raw('max'),
  min: sql.raw('min'),
  sum: sql.raw('sum'),
  avg: sql.raw('avg'),
};

/** The table `key` names; a plan from a definition checked against another schema has none. */
export function table(context: RenderContext, key: string): PgTable {
  const found = tableOf(context.schema, key);
  if (found === undefined) {
    throw new TypeError(`the schema has no table ${key}`);
  }
  return found;
}

/** `"table"."column"`, nested so that Drizzle keeps the table inside a selection. */
export function column(
  context: RenderContext,
  tableKey: string,
  key: string,
): SQL {
  const found = columnOf(table(context, tableKey), key);
  if (found === undefined) {
    throw new TypeError(`the schema table ${tableKey} has no column ${key}`);
  }
  return sql`${found}`;
}

/** `<related> = <main> [and ...]`: a relation's join pairs, correlated with the main table. */
export function correlation(relation: Relation, context: RenderContext): SQL {
  return sql.join(
    relation.on.map(
      ([related, main]) =>
        sql`${column(context, relation.table, related)} = ${column(context, context.table, main)}`,
    ),
    sql` and `,
  );
}

function aggregate(target: AggregateTarget, context: RenderContext): SQL {
  const { relation, fn } = target;
  const value =
    target.column === null
      ? sql`count(*)`
      : sql`${FUNCTIONS[fn]}(${column(context, relation.table, target.column)})`;
  return sql`(select ${value} as "value" from ${table(context, relation.table)} where ${correlation(relation, context)})`;
}

/** `concat_ws(' ', t.a, t.b)`: the columns as one text, nulls skipped. */
export function concat(target: ConcatTarget, context: RenderContext): SQL {
  const columns = target.columns.map((name) =>
    column(context, target.table, name),
  );
  return sql`concat_ws(' ', ${sql.join(columns, sql`, `)})`;
}

export function renderTarget(target: Target, context: RenderContext): SQL {
  if (target.kind === 'column') {
    const reference = column(context, target.table, target.column);
    return target.lower ? sql`lower(${reference})` : reference;
  }
  if (target.kind === 'aggregate') {
    return aggregate(target, context);
  }
  return concat(target, context);
}
