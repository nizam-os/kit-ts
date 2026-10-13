/**
 * The row security problems of the scoped resources (SPEC 18.3): each
 * table needs row security enabled, and for each command its operations
 * run, the policies that apply must read the scope's session parameter.
 * A policy applies to a command when its command is that one or `all`,
 * and an `all` or `update` policy without `WITH CHECK` checks new rows
 * with its `USING`. The policies pass when at least one permissive policy
 * applies, since without one PostgreSQL denies every row, and either a
 * restrictive policy reads the parameter or every permissive policy does:
 * permissive policies combine with `OR`, restrictive ones with `AND`.
 * Policies count whatever roles they are granted to, since only the
 * server knows which apply to the runtime's role.
 * @ref https://www.postgresql.org/docs/18/sql-createpolicy.html (Policies Applied by Command Type; Application of Multiple Policies)
 * @ref https://www.postgresql.org/docs/18/ddl-rowsecurity.html
 * @packageDocumentation
 */
import type { Policy, PolicyCommand } from '@nizam-os/catalog-core';
import type { Operation } from '@nizam-os/resource-core';
import type { ResourceBehavior } from '@nizam-os/resource-core/server';

import type { BootContext } from './options';

import { ownValue } from '../internal/object';

type Command = Exclude<PolicyCommand, 'all'>;
type Expression = 'using' | 'withCheck';

/** The command and the expression each operation needs, after every resource's SELECT `USING` (its reads and every `returning`). */
const NEEDS: Readonly<
  Record<Operation, ReadonlyArray<readonly [Command, Expression]>>
> = {
  list: [],
  get: [],
  create: [['insert', 'withCheck']],
  // `lock` takes FOR NO KEY UPDATE, which applies the UPDATE policies' USING.
  update: [
    ['update', 'using'],
    ['update', 'withCheck'],
  ],
  // `lock` takes FOR UPDATE, which applies the UPDATE policies' USING.
  remove: [
    ['delete', 'using'],
    ['update', 'using'],
  ],
};

const CLAUSES: Readonly<Record<Expression, string>> = {
  using: 'USING',
  withCheck: 'WITH CHECK',
};

/**
 * The session parameters an expression reads with `current_setting`, as
 * `pg_get_expr` prints the call. A doubled quote stays in the name, so
 * the name ends where the literal does; such a name matches no session,
 * which is identifiers joined by dots.
 */
const CURRENT_SETTING = /current_setting\(\s*'((?:[^']|'')*)'/giu;

/** Whether `expression` calls `current_setting` with `session` as its first argument; names compare without regard to case. */
function readsParameter(expression: string | null, session: string): boolean {
  if (expression === null) {
    return false;
  }
  const wanted = session.toLowerCase();
  return [...expression.matchAll(CURRENT_SETTING)].some(
    ([, name = '']) => name.toLowerCase() === wanted,
  );
}

/** The expression `policy` applies as `expression`. */
function expressionOf(policy: Policy, expression: Expression): string | null {
  if (expression === 'using') {
    return policy.using;
  }
  const fallsBack = policy.command === 'all' || policy.command === 'update';
  return policy.withCheck ?? (fallsBack ? policy.using : null);
}

/** The commands and expressions the resource's operations need, each once. */
function needsOf(
  behavior: ResourceBehavior,
): ReadonlyArray<readonly [Command, Expression]> {
  const needs = new Map<string, readonly [Command, Expression]>([
    ['select using', ['select', 'using']],
  ]);
  for (const operation of behavior.resource.declaration.operations) {
    for (const need of NEEDS[operation]) {
      needs.set(need.join(' '), need);
    }
  }
  return [...needs.values()];
}

/** The problems of one scoped resource's table. */
function tableProblems(
  type: string,
  table: string,
  policies: ReadonlyArray<readonly [string, Policy]>,
  session: string,
  needs: ReadonlyArray<readonly [Command, Expression]>,
): ReadonlyArray<string> {
  const problems = new Set<string>();
  for (const [command, expression] of needs) {
    const applying = policies.filter(
      ([, policy]) => policy.command === command || policy.command === 'all',
    );
    const permissive = applying.filter(([, policy]) => policy.permissive);
    const name = command.toUpperCase();
    if (permissive.length === 0) {
      problems.add(
        `${type}: no permissive policy on ${table} applies to ${name}, so PostgreSQL refuses every row`,
      );
      continue;
    }
    const reads = ([, policy]: readonly [string, Policy]) =>
      readsParameter(expressionOf(policy, expression), session);
    const restricted = applying.some(
      (entry) => !entry[1].permissive && reads(entry),
    );
    const unread = permissive.filter((entry) => !reads(entry));
    if (!restricted && unread.length > 0) {
      problems.add(
        `${type}: the ${name} policies on ${table} do not read ${session} in ${CLAUSES[expression]}: ${unread.map(([policy]) => policy).join(', ')}`,
      );
    }
  }
  return [...problems];
}

/** Every row security problem of the scoped resources, in the order of `resources`. */
export function rowSecurityProblems(boot: BootContext): ReadonlyArray<string> {
  return boot.resources.flatMap(([, behavior]) => {
    const { resource } = behavior;
    const scope = resource.declaration.scope;
    const binding =
      scope === undefined ? undefined : ownValue(boot.scopes, scope);
    const table = ownValue(boot.catalog.tables, resource.table);
    if (binding === undefined || table === undefined) {
      return [];
    }
    const { type } = resource.names;
    if (!table.rowSecurity.enabled) {
      return [`${type}: row security is not enabled on ${resource.table}`];
    }
    return tableProblems(
      type,
      resource.table,
      Object.entries(table.rowSecurity.policies),
      binding.session,
      needsOf(behavior),
    );
  });
}
