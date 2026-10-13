import type { SQL } from 'drizzle-orm';

/**
 * Predicates (SPEC 14.2) as Drizzle SQL. Every value is `sql.param`, one
 * bound parameter: a JavaScript array interpolated into `sql` would print as
 * a parameter list. `sql.raw` adds its text without escaping, so it takes
 * only the constant fragments of the tables below and the text search
 * configuration, which `isSearchConfig` checks again first (ADR 0017).
 * `and` and `or` are parenthesized, and every other kind is one expression
 * that binds tighter than `and`, so a node joins any other safely.
 * @ref https://orm.drizzle.team/docs/sql (sql.raw: no processing or escaping)
 * @ref https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-PRECEDENCE
 * @ref https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE
 * @ref https://www.postgresql.org/docs/current/functions-array.html (`@>`, `<@`, `&&`)
 * @ref https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-PARSING-QUERIES
 * @packageDocumentation
 */
import type {
  ArrayOperator,
  ComparisonOperator,
  Predicate,
  Relation,
  TextSearchMode,
} from '@nizam-os/keyset-core';

import type { RenderContext } from '../types';

import { sql } from 'drizzle-orm';

import { isSearchConfig } from '@nizam-os/keyset-core';

import { column, concat, correlation, renderTarget, table } from './target';

const COMPARISONS: Readonly<Record<ComparisonOperator, SQL>> = {
  '=': sql.raw('='),
  '!=': sql.raw('!='),
  '>': sql.raw('>'),
  '>=': sql.raw('>='),
  '<': sql.raw('<'),
  '<=': sql.raw('<='),
};

const ARRAY_OPERATORS: Readonly<Record<ArrayOperator, SQL>> = {
  contains: sql.raw('@>'),
  containedBy: sql.raw('<@'),
  overlaps: sql.raw('&&'),
};

/** The `tsquery` parser per mode; `websearch_to_tsquery` never raises on user input. */
const QUERY_FUNCTIONS: Readonly<Record<TextSearchMode, SQL>> = {
  websearch: sql.raw('websearch_to_tsquery'),
  plain: sql.raw('plainto_tsquery'),
  phrase: sql.raw('phraseto_tsquery'),
};

type TextSearch = Extract<Predicate, { kind: 'textSearch' }>;

/** The plan's predicate kinds are closed; another one is a bug in the caller, not a runtime path. */
function unreachable(_node: never): never {
  throw new TypeError('unknown predicate kind');
}

function junction(
  items: ReadonlyArray<Predicate>,
  separator: SQL,
  empty: SQL,
  context: RenderContext,
): SQL {
  if (items.length === 0) {
    return empty;
  }
  const rendered = items.map((item) => renderPredicate(item, context));
  return sql`(${sql.join(rendered, separator)})`;
}

function exists(
  relation: Relation,
  predicate: Predicate | null,
  context: RenderContext,
): SQL {
  const conditions = [correlation(relation, context)];
  if (predicate !== null) {
    conditions.push(
      renderPredicate(predicate, {
        schema: context.schema,
        table: relation.table,
      }),
    );
  }
  return sql`exists (select 1 as "one" from ${table(context, relation.table)} where ${sql.join(conditions, sql` and `)})`;
}

function textSearch(node: TextSearch, context: RenderContext): SQL {
  if (!isSearchConfig(node.config)) {
    throw new TypeError(
      'the text search configuration is not a configuration name',
    );
  }
  // Safe to print as a literal: the name grammar has no quote (SPEC 3.4).
  const config = sql.raw(`'${node.config}'`);
  const vector =
    'vector' in node.source
      ? column(context, node.table, node.source.vector)
      : sql`to_tsvector(${config}, ${concat({ kind: 'concat', table: node.table, columns: node.source.columns }, context)})`;
  return sql`${vector} @@ ${QUERY_FUNCTIONS[node.mode]}(${config}, ${sql.param(node.term)})`;
}

export function renderPredicate(node: Predicate, context: RenderContext): SQL {
  switch (node.kind) {
    case 'and':
      return junction(node.items, sql` and `, sql`true`, context);
    case 'or':
      return junction(node.items, sql` or `, sql`false`, context);
    case 'not':
      return sql`not (${renderPredicate(node.item, context)})`;
    case 'literal':
      return node.value ? sql`true` : sql`false`;
    case 'compare':
      return sql`${renderTarget(node.target, context)} ${COMPARISONS[node.operator]} ${sql.param(node.value)}`;
    case 'null':
      return sql`${renderTarget(node.target, context)} ${node.negate ? sql`is not null` : sql`is null`}`;
    case 'in': {
      const values = node.values.map((value) => sql.param(value));
      return sql`${renderTarget(node.target, context)} ${node.negate ? sql`not in` : sql`in`} (${sql.join(values, sql`, `)})`;
    }
    case 'between':
      return sql`${renderTarget(node.target, context)} between ${sql.param(node.low)} and ${sql.param(node.high)}`;
    case 'like':
      return sql`${renderTarget(node.target, context)} ${node.caseInsensitive ? sql`ilike` : sql`like`} ${sql.param(node.pattern)}`;
    case 'array':
      return sql`${renderTarget(node.target, context)} ${ARRAY_OPERATORS[node.operator]} ${sql.param(node.values)}`;
    case 'exists':
      return exists(node.relation, node.predicate, context);
    case 'textSearch':
      return textSearch(node, context);
    default:
      return unreachable(node);
  }
}
