/**
 * `recognizeCheck`: a CHECK expression read as a rule (SPEC 8.3, ADR
 * 0006). A rule must agree with its CHECK on every non-null value, so each
 * shape is matched exactly against the deparsed text, and anything else
 * gives `null`, which tells the API that a validator must cover the
 * constraint. This module combines terms; `terms.ts` reads each one.
 * @packageDocumentation
 */
import type { LengthRule, RangeRule, Rule } from '@nizam-os/catalog-core';

import type { SqlNode } from '../sql/nodes';
import type { CheckSubject } from './subject';

import { parseExpression } from '../sql/parse';
import { isSubject } from './subject';
import { lengthRule, rangeRule, term } from './terms';

/** The one value at most one of `values` sets; `undefined` when two set it. */
function single<TValue>(
  values: ReadonlyArray<TValue | null>,
): TValue | null | undefined {
  const set = values.filter((value): value is TValue => value !== null);
  return set.length > 1 ? undefined : (set[0] ?? null);
}

function isLength(rule: Rule | null): rule is LengthRule {
  return rule?.kind === 'length';
}

function isRange(rule: Rule | null): rule is RangeRule {
  return rule?.kind === 'range';
}

/** An `AND` of length terms, or of range terms, merges when no bound is set twice. */
function conjunction(
  terms: ReadonlyArray<SqlNode>,
  subject: CheckSubject,
): Rule | null {
  const rules = terms.map((each) => recognize(each, subject));
  if (rules.every((rule): rule is LengthRule => isLength(rule))) {
    const min = single(rules.map((rule) => rule.min));
    const max = single(rules.map((rule) => rule.max));
    return min === undefined || max === undefined ? null : lengthRule(min, max);
  }
  if (rules.every((rule): rule is RangeRule => isRange(rule))) {
    const min = single(rules.map((rule) => rule.min));
    const max = single(rules.map((rule) => rule.max));
    return min === undefined || max === undefined ? null : rangeRule(min, max);
  }
  return null;
}

/**
 * `S IS NULL OR X` is X, since a CHECK passes on null anyway, except when
 * X is `S IS NOT NULL`: the guard makes that one true for every value.
 */
function guarded(
  terms: ReadonlyArray<SqlNode>,
  subject: CheckSubject,
): Rule | null {
  const rest = terms.filter(
    (each) =>
      !(
        each.kind === 'nullTest' &&
        !each.negated &&
        isSubject(each.operand, subject)
      ),
  );
  const [only] = rest;
  const rule =
    rest.length === 1 && only !== undefined ? recognize(only, subject) : null;
  return rule?.kind === 'notNull' ? null : rule;
}

function recognize(node: SqlNode, subject: CheckSubject): Rule | null {
  if (node.kind === 'or') {
    return guarded(node.terms, subject);
  }
  return node.kind === 'and'
    ? conjunction(node.terms, subject)
    : term(node, subject);
}

/**
 * The rule a CHECK expression states about `subject`, or `null` when the
 * expression is not one of the shapes of SPEC 8.3. Never throws.
 */
export function recognizeCheck(
  expression: string,
  subject: CheckSubject,
): Rule | null {
  const tree = parseExpression(expression);
  return tree === null ? null : recognize(tree, subject);
}
