/**
 * The page statement (SPEC 10.3, ADR 0020): the filtered query with every
 * sort key selected as text under its alias, ordered by the keys with
 * their null placements, and limited to one row past the page. A seek of
 * one branch is added with `where`. A seek of two or more branches runs
 * as one select per branch, each ordered, limited, and in parentheses,
 * joined with `union all`; the union is ordered by the keys' values,
 * which every select also holds under their value aliases, and limited
 * again, since a union keeps no order of its own. Kysely compiles the
 * query a set operation starts from without parentheses, so an `order by`
 * and `limit` there would be the union's: the union starts with the
 * caller's query where `false` holds, which names the columns and holds
 * no row, and PostgreSQL leaves it out of the plan.
 * @ref https://www.postgresql.org/docs/current/queries-union.html (no order; LIMIT on an operand needs parentheses)
 * @ref https://kysely-org.github.io/kysely-apidoc/classes/SelectQueryBuilder.html#unionAll (eb.parens wraps an operand)
 * @ref https://www.postgresql.org/docs/current/queries-order.html (NULLS FIRST / LAST)
 * @packageDocumentation
 */
import type { PlanKey, Predicate, QueryPlan } from '@nizam-os/keyset-core';

import type { AnyQuery, RenderContext } from './types';

import { sql } from 'kysely';

import { renderPredicate } from './render/predicate';
import { renderTarget } from './render/target';

/** What an `order by` item's modifiers offer; Kysely's `OrderByItemBuilder`. */
interface OrderItem<TItem> {
  asc(): TItem;
  desc(): TItem;
  nullsFirst(): TItem;
  nullsLast(): TItem;
}

/** `item` in the key's direction, with its null placement when it has one. */
function direct<TItem extends OrderItem<TItem>>(
  item: TItem,
  key: PlanKey,
): TItem {
  const directed = key.direction === 'asc' ? item.asc() : item.desc();
  if (key.nulls === null) {
    return directed;
  }
  return key.nulls === 'first' ? directed.nullsFirst() : directed.nullsLast();
}

/** The keys selected as text under their aliases, and as values under their value aliases for a union. */
function selectKeys<TRow>(
  query: AnyQuery<TRow>,
  plan: QueryPlan,
  context: RenderContext,
  values: boolean,
): AnyQuery<TRow> {
  return plan.keys.reduce((selecting, key) => {
    const text = selecting.select((eb) =>
      eb
        .cast<string | null>(renderTarget(eb, key.target, context), 'text')
        .as(key.alias),
    );
    return values
      ? text.select((eb) =>
          renderTarget(eb, key.target, context).as(key.valueAlias),
        )
      : text;
  }, query);
}

/** `filtered` where `branch` holds, its keys selected and ordered, limited to one row past the page. */
function branchQuery<TRow>(
  filtered: AnyQuery<TRow>,
  plan: QueryPlan,
  context: RenderContext,
  branch: Predicate | undefined,
  values: boolean,
): AnyQuery<TRow> {
  const sought =
    branch === undefined
      ? filtered
      : filtered.where((eb) => renderPredicate(eb, branch, context));
  return plan.keys
    .reduce(
      (ordering, key) =>
        ordering.orderBy(
          (eb) => renderTarget(eb, key.target, context),
          (item) => direct(item, key),
        ),
      selectKeys(sought.clearOrderBy().clearOffset(), plan, context, values),
    )
    .limit(plan.limit);
}

/** The page statement over `filtered`, the caller's query where the filter holds. */
export function pageQuery<TRow>(
  filtered: AnyQuery<TRow>,
  plan: QueryPlan,
  context: RenderContext,
): AnyQuery<TRow> {
  const [only, ...more] = plan.seek;
  if (more.length === 0) {
    return branchQuery(filtered, plan, context, only, false);
  }
  const lead = selectKeys(
    filtered.where(sql.lit(false)).clearOrderBy().clearOffset(),
    plan,
    context,
    true,
  );
  const union = plan.seek.reduce(
    (joined, branch) =>
      joined.unionAll((eb) =>
        eb.parens(branchQuery(filtered, plan, context, branch, true)),
      ),
    lead,
  );
  return plan.keys
    .reduce(
      (ordering, key) =>
        ordering.orderBy(sql.ref(key.valueAlias), (item) => direct(item, key)),
      union,
    )
    .limit(plan.limit);
}
