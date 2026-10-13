/**
 * How a client enforcing the catalog decides a value against a rule (SPEC
 * 2.9), written independently of the recognizer so tests can hold its
 * rules against the database's verdicts.
 */
import type { RangeBound, Rule } from '@nizam-os/catalog-core';

/** Exact comparison of decimal strings: both scaled to the same number of fraction digits. */
function compareDecimals(left: string, right: string): number {
  const [leftWhole = '', leftFraction = ''] = left.split('.');
  const [rightWhole = '', rightFraction = ''] = right.split('.');
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const scaled = (whole: string, fraction: string): bigint => {
    const digits = BigInt(
      `${whole.replace('-', '')}${fraction.padEnd(scale, '0')}`,
    );
    return whole.startsWith('-') ? -digits : digits;
  };
  const difference =
    scaled(leftWhole, leftFraction) - scaled(rightWhole, rightFraction);
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

/** `float8` bounds compare as the nearest double, which is what `Number` parses. */
function compare(value: string, bound: string, float: boolean): number {
  if (!float) {
    return compareDecimals(value, bound);
  }
  return Math.sign(Number(value) - Number(bound));
}

function above(order: number, bound: RangeBound): boolean {
  return bound.inclusive ? order >= 0 : order > 0;
}

/**
 * Whether `value` (text as sent to PostgreSQL, or `null`) satisfies `rule`.
 * `float` says the column is `float8`. Like a CHECK, every rule but
 * `notNull` passes on null.
 */
export function ruleAccepts(
  rule: Rule,
  value: string | null,
  float = false,
): boolean {
  if (value === null) {
    return rule.kind !== 'notNull';
  }
  switch (rule.kind) {
    case 'notNull': {
      return true;
    }
    case 'length': {
      // PostgreSQL's char_length counts code points, which Array.from yields.
      const length = Array.from(value).length;
      return (
        (rule.min === null || length >= rule.min) &&
        (rule.max === null || length <= rule.max)
      );
    }
    case 'range': {
      const { min, max } = rule;
      return (
        (min === null || above(compare(value, min.value, float), min)) &&
        (max === null || above(compare(max.value, value, float), max))
      );
    }
    case 'enum': {
      return rule.values.includes(value);
    }
    case 'pattern': {
      return new RegExp(rule.source, rule.flags).test(value);
    }
    default: {
      return rule satisfies never;
    }
  }
}
