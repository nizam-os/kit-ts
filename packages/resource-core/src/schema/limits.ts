/**
 * The fold of a value's type bounds and rules into the tightest value per
 * JSON Schema keyword (SPEC 6.1, 8): one lower and one upper bound, one
 * length range, one step, and every pattern. A violated bound raises one
 * issue whatever the number of constraints behind it, and the same fold
 * becomes the field's `limits` and the keywords of its OpenAPI schema.
 * @packageDocumentation
 */
import type { LengthRule, RangeBound, RangeRule } from '@nizam-os/catalog-core';

import { compareDecimals } from '../wire/decimal';

/** One end of a numeric range: a decimal literal and whether it is included. */
export type Bound = RangeBound;

/** The folded limits of a value. */
export interface Limits {
  readonly minLength: number | null;
  readonly maxLength: number | null;
  readonly lower: Bound | null;
  readonly upper: Bound | null;
  /** `10^-s` for `numeric(p, s)`, as a decimal literal. */
  readonly multipleOf: string | null;
  /** Pattern sources, each read with the flags `su` (catalog SPEC 8.4). */
  readonly patterns: ReadonlyArray<string>;
}

/** No limits at all. */
export const NO_LIMITS: Limits = Object.freeze({
  minLength: null,
  maxLength: null,
  lower: null,
  upper: null,
  multipleOf: null,
  patterns: Object.freeze([]),
});

function larger(a: number | null, b: number | null): number | null {
  if (a === null || b === null) {
    return a ?? b;
  }
  return Math.max(a, b);
}

function smaller(a: number | null, b: number | null): number | null {
  if (a === null || b === null) {
    return a ?? b;
  }
  return Math.min(a, b);
}

/** The tighter of two bounds on one side: `1` keeps the larger value (a lower bound). */
function tighter(
  a: Bound | null,
  b: Bound | null,
  direction: 1 | -1,
): Bound | null {
  if (a === null || b === null) {
    return a ?? b;
  }
  const order = compareDecimals(a.value, b.value) * direction;
  if (order !== 0) {
    return order > 0 ? a : b;
  }
  return a.inclusive ? b : a;
}

/** Adds a length rule: the larger minimum, the smaller maximum. */
export function withLength(
  limits: Limits,
  rule: Pick<LengthRule, 'min' | 'max'>,
): Limits {
  return {
    ...limits,
    minLength: larger(limits.minLength, rule.min),
    maxLength: smaller(limits.maxLength, rule.max),
  };
}

/** Adds a range rule or a type's bounds: the tighter bound on each side. */
export function withRange(
  limits: Limits,
  rule: Pick<RangeRule, 'min' | 'max'>,
): Limits {
  return {
    ...limits,
    lower: tighter(limits.lower, rule.min, 1),
    upper: tighter(limits.upper, rule.max, -1),
  };
}

/** Adds a pattern, once per source. */
export function withPattern(limits: Limits, source: string): Limits {
  return limits.patterns.includes(source)
    ? limits
    : { ...limits, patterns: [...limits.patterns, source] };
}

/** Sets the step of `numeric(p, s)`. */
export function withMultipleOf(limits: Limits, step: string): Limits {
  return { ...limits, multipleOf: step };
}
