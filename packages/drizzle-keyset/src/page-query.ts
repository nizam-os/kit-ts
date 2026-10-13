/**
 * The page select (SPEC 14.3, ADR 0020): a select of the caller's
 * selection with every sort key cast to text under its alias, from the
 * definition's table, where the caller's `where`, the filter, and the
 * seek hold, ordered by the keys with their null placements, and limited
 * to one row past the page. A seek of one branch is one select. A seek
 * of two or more branches is one select per branch, each also holding the
 * keys' values under their value aliases, joined with `union all`, which
 * Drizzle writes with every operand in parentheses; the union is ordered
 * by the value aliases and limited again, since a union keeps no order of
 * its own. Each select's `where` parts are parenthesized and joined with
 * `and`, since Drizzle's `and()` does not parenthesize its operands.
 * @ref https://orm.drizzle.team/docs/set-operations (union all)
 * @ref https://www.postgresql.org/docs/current/queries-union.html (no order; LIMIT on an operand needs parentheses)
 * @ref https://www.postgresql.org/docs/current/queries-order.html (NULLS FIRST / LAST)
 * @packageDocumentation
 */
import type { SQL } from 'drizzle-orm';
import type { PgTable, SelectedFields } from 'drizzle-orm/pg-core';

import type { PlanKey, QueryPlan } from '@nizam-os/keyset-core';

import type { KeysetDatabase, RenderContext } from './types';

import { sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';

import { renderPredicate } from './render/predicate';
import { renderTarget } from './render/target';

const DIRECTIONS: Readonly<Record<PlanKey['direction'], SQL>> = {
  asc: sql.raw('asc'),
  desc: sql.raw('desc'),
};

const NULLS: Readonly<Record<'first' | 'last', SQL>> = {
  first: sql.raw('nulls first'),
  last: sql.raw('nulls last'),
};

/** What running a page needs of a Drizzle select: its statement, and its rows. */
export interface Statement<TRow> {
  toSQL(): { readonly sql: string; readonly params: ReadonlyArray<unknown> };
  execute(): Promise<Array<TRow>>;
}

/** The present parts, each in parentheses, joined with `and`. */
export function conjunction(
  parts: ReadonlyArray<SQL | undefined>,
): SQL | undefined {
  const present = parts.filter((part) => part !== undefined);
  if (present.length === 0) {
    return undefined;
  }
  return sql.join(
    present.map((part) => sql`(${part})`),
    sql` and `,
  );
}

/** Each key as text under its alias and, for a union, as its value under its value alias. */
function keySelection(
  plan: QueryPlan,
  context: RenderContext,
  values: boolean,
): Record<string, SQL.Aliased> {
  return Object.fromEntries(
    plan.keys.flatMap((key) => {
      const text = sql<
        string | null
      >`cast(${renderTarget(key.target, context)} as text)`.as(key.alias);
      return values
        ? [
            [key.alias, text],
            [
              key.valueAlias,
              sql`${renderTarget(key.target, context)}`.as(key.valueAlias),
            ],
          ]
        : [[key.alias, text]];
    }),
  );
}

/** `ordered` in the key's direction, with its null placement when it has one. */
function directed(ordered: SQL, key: PlanKey): SQL {
  const placed = sql`${ordered} ${DIRECTIONS[key.direction]}`;
  return key.nulls === null ? placed : sql`${placed} ${NULLS[key.nulls]}`;
}

/** The page select over `from` for `selection`, where `parts` hold: the caller's `where` and the filter. */
export function pageQuery(
  db: KeysetDatabase,
  from: PgTable,
  selection: SelectedFields,
  parts: ReadonlyArray<SQL | undefined>,
  plan: QueryPlan,
  context: RenderContext,
): Statement<Record<string, unknown>> {
  const select = (branch: SQL | undefined, values: boolean) =>
    db
      .select({ ...selection, ...keySelection(plan, context, values) })
      .from(from)
      .where(conjunction([...parts, branch]))
      .orderBy(
        ...plan.keys.map((key) =>
          directed(renderTarget(key.target, context), key),
        ),
      )
      .limit(plan.limit);
  const [first, second, ...rest] = plan.seek.map((branch) =>
    renderPredicate(branch, context),
  );
  if (second === undefined) {
    return select(first, false);
  }
  return unionAll(
    select(first, true),
    select(second, true),
    ...rest.map((branch) => select(branch, true)),
  )
    .orderBy(
      ...plan.keys.map((key) =>
        directed(sql`${sql.identifier(key.valueAlias)}`, key),
      ),
    )
    .limit(plan.limit);
}
