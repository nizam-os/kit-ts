/**
 * `list` of the reference storage adapter (resource SPEC 12.8, obligation
 * 5): the request planned by `@nizam-os/keyset-core` with the declared
 * resource's keyset definition, and the plan rendered as plain SQL (keyset
 * SPEC 6). Column targets name the table by its bare name, which
 * PostgreSQL resolves against the schema-qualified table the statement
 * selects from (resource SPEC 11.2). Every value is a parameter cast from
 * text to its column's type, a cursor's values included, since they are
 * the text each key was selected as; the scope's predicate joins the
 * filter and the seek, whose branches join with `or` in this one
 * statement, an independent reading of what kysely-resource runs as a
 * union (keyset ADR 0020); each sort key is selected as text under its alias
 * and ordered with its direction and null placement; the limit is the
 * plan's, one row past the page. A declared resource's definition has no
 * relations and searches a `tsvector` column (resource SPEC 11.2), so the
 * plan holds no `exists`, aggregate, or concatenation. The cursors are
 * bound to the transaction's scope values, each scope's name mapped to its
 * value (obligation 12), so a cursor of one scope is refused in another.
 * @ref https://github.com/nizam-os/kit/blob/main/docs/keyset/SPEC.md (section 6, the query plan)
 * @ref https://www.postgresql.org/docs/18/queries-order.html (NULLS FIRST / LAST)
 * @ref https://www.postgresql.org/docs/18/functions-matching.html#FUNCTIONS-LIKE
 * @ref https://www.postgresql.org/docs/18/functions-array.html (`@>`, `<@`, `&&`)
 * @ref https://www.postgresql.org/docs/18/textsearch-controls.html#TEXTSEARCH-PARSING-QUERIES
 */
import type {
  ArrayOperator,
  ColumnTarget,
  CursorValue,
  Keyset,
  Predicate,
  ScalarValue,
  Target,
  TextSearchMode,
} from '@nizam-os/keyset-core';
import type { DeclaredResource } from '@nizam-os/resource-core';
import type {
  PublicRow,
  StorageListRequest,
  StoragePage,
} from '@nizam-os/resource-core/server';

import type { ReferenceTransaction, SqlContext } from './reference-sql.ts';

import { columnType } from './column-type.ts';
import { parameterText } from './pg-text.ts';
import { columnOf, quoted, readRow, selectList } from './reference-sql.ts';
import { Statement } from './reference-statement.ts';

const ARRAY_OPERATORS: Readonly<Record<ArrayOperator, string>> = {
  contains: '@>',
  containedBy: '<@',
  overlaps: '&&',
};

/** The `tsquery` parser of each mode. */
const QUERY_FUNCTIONS: Readonly<Record<TextSearchMode, string>> = {
  websearch: 'websearch_to_tsquery',
  plain: 'plainto_tsquery',
  phrase: 'phraseto_tsquery',
};

/** What no declared resource's plan holds (resource SPEC 11.2). */
function undeclared(kind: string): never {
  throw new TypeError(
    `list: a declared resource's keyset definition plans no ${kind}`,
  );
}

/** The column `target` reads; a relation's aggregate or a concatenation is never one of a declared resource. */
function columnTarget(target: Target): ColumnTarget {
  return target.kind === 'column'
    ? target
    : undeclared(`${target.kind} target`);
}

/** The SQL of one plan, its parameters in `statement`. */
class PlanSql {
  private readonly context: SqlContext;
  private readonly statement: Statement;

  public constructor(context: SqlContext, statement: Statement) {
    this.context = context;
    this.statement = statement;
  }

  /** `"table"."column"`, through `lower()` for an insensitive collation. */
  public target(target: Target): string {
    const column = columnTarget(target);
    const reference = `${quoted(column.table)}.${quoted(column.column)}`;
    return column.lower ? `lower(${reference})` : reference;
  }

  public predicate(node: Predicate): string {
    switch (node.kind) {
      case 'and':
        return this.joined(node.items, 'and', 'true');
      case 'or':
        return this.joined(node.items, 'or', 'false');
      case 'not':
        return `not (${this.predicate(node.item)})`;
      case 'literal':
        return String(node.value);
      case 'compare':
        return `${this.target(node.target)} ${node.operator} ${this.value(node.target, node.value)}`;
      case 'null':
        return `${this.target(node.target)} is ${node.negate ? 'not null' : 'null'}`;
      case 'in':
        return `${this.target(node.target)} ${node.negate ? 'not in' : 'in'} (${node.values.map((value) => this.value(node.target, value)).join(', ')})`;
      case 'between':
        return `${this.target(node.target)} between ${this.value(node.target, node.low)} and ${this.value(node.target, node.high)}`;
      case 'like':
        return `${this.target(node.target)} ${node.caseInsensitive ? 'ilike' : 'like'} ${this.statement.parameters.text(node.pattern)}`;
      case 'array':
        return `${this.target(node.target)} ${ARRAY_OPERATORS[node.operator]} ${this.array(node.target, node.values)}`;
      case 'textSearch':
        return this.textSearch(node);
      case 'exists':
        return undeclared('relation');
      default:
        return node satisfies never;
    }
  }

  private joined(
    items: ReadonlyArray<Predicate>,
    operator: 'and' | 'or',
    empty: string,
  ): string {
    return items.length === 0
      ? empty
      : items.map((item) => `(${this.predicate(item)})`).join(` ${operator} `);
  }

  /** A value compared with `target`: cast to the column's type, or text under `lower()`. */
  private value(target: Target, value: ScalarValue): string {
    const column = columnTarget(target);
    const { parameters, table } = this.statement;
    return column.lower
      ? parameters.text(String(value))
      : parameters.add(String(value), columnOf(table, column.column));
  }

  /** An array literal of `values`, cast to the array column's type. */
  private array(
    target: ColumnTarget,
    values: ReadonlyArray<ScalarValue>,
  ): string {
    const { parameters, table } = this.statement;
    const column = columnOf(table, target.column);
    const text = parameterText(
      values,
      columnType(this.context.catalog, column),
    );
    return parameters.add(text, column);
  }

  private textSearch(node: Extract<Predicate, { kind: 'textSearch' }>): string {
    if (!('vector' in node.source)) {
      return undeclared('search over columns');
    }
    const { parameters } = this.statement;
    const vector = `${quoted(node.table)}.${quoted(node.source.vector)}`;
    const config = `${parameters.text(node.config)}::regconfig`;
    return `${vector} @@ ${QUERY_FUNCTIONS[node.mode]}(${config}, ${parameters.text(node.term)})`;
  }
}

/** A sort key's value as selected: its text, or `null`. */
function cursorValue(value: unknown): CursorValue {
  if (value !== null && typeof value !== 'string') {
    throw new TypeError(
      'list: the driver returned a sort key that is not text',
    );
  }
  return value;
}

/** A page of `request`, planned by `keyset` and read in the transaction's scope. */
export async function keysetPage(
  context: SqlContext,
  keyset: Keyset,
  tx: ReferenceTransaction,
  resource: DeclaredResource,
  request: StorageListRequest,
): Promise<StoragePage> {
  const plan = await keyset.plan(request, {
    context: Object.fromEntries(
      tx.scopes.map(({ scope, value }) => [scope, value]),
    ),
  });
  const statement = new Statement(context, resource, tx);
  const render = new PlanSql(context, statement);
  const seek: Predicate | null =
    plan.seek.length === 0 ? null : { kind: 'or', items: plan.seek };
  const where = [
    statement.scoped(),
    ...[plan.filter, seek].flatMap((node) =>
      node === null ? [] : [`(${render.predicate(node)})`],
    ),
  ].join(' and ');
  const keys = plan.keys.map(
    (key) =>
      `cast(${render.target(key.target)} as text) as ${quoted(key.alias)}`,
  );
  const order = plan.keys.map(
    (key) =>
      `${render.target(key.target)} ${key.direction}${key.nulls === null ? '' : ` nulls ${key.nulls}`}`,
  );
  const sql = `select ${[selectList(context, resource), ...keys].join(', ')} from ${statement.name} where ${where} order by ${order.join(', ')} limit ${String(plan.limit)}`;
  const rows = await tx.client.query(sql, statement.parameters.values);
  const values = new Map<PublicRow, ReadonlyArray<CursorValue>>();
  const read = rows.map((row) => {
    const publicRow = readRow(context, resource, row);
    values.set(
      publicRow,
      plan.keys.map((key) => cursorValue(row[key.alias])),
    );
    return publicRow;
  });
  return keyset.page(plan, read, (row) => values.get(row) ?? []);
}
