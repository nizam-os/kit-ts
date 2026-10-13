/**
 * `rules` against the table's constraints (SPEC 3.5): keys are constraint
 * names or NOT NULL keys, a validator covers exactly an enforced CHECK
 * without a rule, and every such CHECK over a written column has one. A
 * NOT ENFORCED CHECK takes none: the database stores what it forbids, so a
 * validator would refuse values the table holds (catalog ADR 0010).
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type { DefinerContext } from './check-config';
import type { Declaration } from './types';

import { notNullKey } from '../catalog/columns';
import { ownValue } from '../internal/object';
import { writtenColumns } from './members';

function ruleKeys(tableDef: PublicTable): ReadonlySet<string> {
  const keys = new Set(Object.keys(tableDef.constraints));
  for (const [column, columnDef] of Object.entries(tableDef.columns)) {
    if (!columnDef.nullable) {
      keys.add(notNullKey(tableDef, column));
    }
  }
  return keys;
}

function checkValidator(
  context: DefinerContext,
  tableDef: PublicTable,
  path: string,
  [key, validator]: readonly [string, string],
): void {
  if (ownValue(context.validators, validator) === undefined) {
    throw new TypeError(
      `${path}.validator: "${validator}" is not a validator of createDeclareResource`,
    );
  }
  const constraint = ownValue(tableDef.constraints, key);
  if (constraint?.kind !== 'check') {
    throw new TypeError(
      `${path}.validator: a validator covers only a CHECK without a rule`,
    );
  }
  if (!constraint.enforced) {
    throw new TypeError(
      `${path}.validator: PostgreSQL does not enforce this CHECK (NOT ENFORCED), so no validator covers it`,
    );
  }
  if (constraint.rule !== null) {
    throw new TypeError(
      `${path}.validator: the CHECK has a rule, which enforces it already`,
    );
  }
}

/** Checks `rules` and the validators every written, enforced CHECK without a rule needs. */
export function checkRules(
  context: DefinerContext,
  table: string,
  tableDef: PublicTable,
  declaration: Declaration,
): void {
  const keys = ruleKeys(tableDef);
  const rules = declaration.rules ?? {};
  for (const [key, rule] of Object.entries(rules)) {
    const path = `${table}.rules.${key}`;
    if (!keys.has(key)) {
      throw new TypeError(
        `${path}: "${key}" is not a constraint or NOT NULL key of ${table}`,
      );
    }
    if (rule.validator !== undefined) {
      checkValidator(context, tableDef, path, [key, rule.validator]);
    }
  }
  const written = writtenColumns(declaration);
  for (const [name, constraint] of Object.entries(tableDef.constraints)) {
    const needsValidator =
      constraint.kind === 'check' &&
      constraint.enforced &&
      constraint.rule === null &&
      constraint.columns.some((column) => written.has(column));
    if (needsValidator && ownValue(rules, name)?.validator === undefined) {
      throw new TypeError(
        `${table}.rules.${name}: a CHECK without a rule needs a validator`,
      );
    }
  }
}
