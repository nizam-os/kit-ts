/**
 * The planner's choice for a page (SPEC 11.3): the page statement a
 * binding ran, run again under `EXPLAIN (ANALYZE, FORMAT JSON)`, and the
 * scans of the plan's tables with the index entries or rows they read in
 * all, those each returned and those its filter removed. A seek of two
 * or more branches has a scan per branch (ADR 0020).
 * @ref https://www.postgresql.org/docs/current/using-explain.html
 */
import type pg from 'pg';

import type { QueryEvent } from '@nizam-os/kysely-keyset';

/** One node of `EXPLAIN (FORMAT JSON)`. */
export interface PlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly 'Scan Direction'?: string;
  readonly 'Index Name'?: string;
  readonly 'Index Cond'?: string;
  readonly 'Presorted Key'?: ReadonlyArray<string>;
  readonly 'Actual Rows': number;
  readonly 'Rows Removed by Filter'?: number;
  readonly Plans?: ReadonlyArray<PlanNode>;
}

export function nodesOf(node: PlanNode): Array<PlanNode> {
  return [node, ...(node.Plans ?? []).flatMap((child) => nodesOf(child))];
}

/** The scans of a table in `plan`, in plan order, and how many entries they read in all. */
export function scansOf(plan: PlanNode): {
  scans: Array<PlanNode>;
  read: number;
} {
  const scans = nodesOf(plan).filter(
    (node) => node['Relation Name'] !== undefined,
  );
  if (scans.length === 0) {
    throw new Error('the plan scans no table');
  }
  const read = scans.reduce(
    (sum, scan) =>
      sum + scan['Actual Rows'] + (scan['Rows Removed by Filter'] ?? 0),
    0,
  );
  return { scans, read };
}

/** The plan of the page statement among `events`, as `EXPLAIN ANALYZE` runs it on `pool`. */
export async function explainPage(
  pool: pg.Pool,
  events: ReadonlyArray<QueryEvent>,
): Promise<PlanNode> {
  const page = events.find((event) => event.kind === 'page');
  if (page === undefined) {
    throw new Error('no page query ran');
  }
  const { rows } = await pool.query<{ 'QUERY PLAN': unknown }>(
    `explain (analyze, costs off, timing off, summary off, format json) ${page.sql}`,
    [...page.parameters],
  );
  const output = rows[0]?.['QUERY PLAN'];
  const parsed: unknown =
    typeof output === 'string' ? JSON.parse(output) : output;
  if (!isExplained(parsed)) {
    throw new Error('EXPLAIN gave no plan');
  }
  return parsed[0].Plan;
}

/** Whether `output` is the JSON of `EXPLAIN (FORMAT JSON)`: a statement's plan. */
function isExplained(output: unknown): output is readonly [{ Plan: PlanNode }] {
  if (!Array.isArray(output)) {
    return false;
  }
  const statement: unknown = output[0];
  return (
    typeof statement === 'object' && statement !== null && 'Plan' in statement
  );
}
