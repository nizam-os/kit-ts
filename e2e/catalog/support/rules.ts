/**
 * How an application enforces the catalog's rules on input before it
 * reaches PostgreSQL (SPEC 2.9): lengths count code points, range bounds
 * compare as exact decimals (or as the nearest double for `float8`), and
 * patterns compile with their flags. Every rule but `notNull` passes on null.
 */
import type { RangeBound, Rule } from '@nizam-os/catalog-core';

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
  if (difference === 0n) {
    return 0;
  }
  return difference > 0n ? 1 : -1;
}

function compare(value: string, bound: string, float: boolean): number {
  return float
    ? Math.sign(Number(value) - Number(bound))
    : compareDecimals(value, bound);
}

function above(order: number, bound: RangeBound): boolean {
  return bound.inclusive ? order >= 0 : order > 0;
}

/** Whether `value`, as text, satisfies `rule`; `float` says the column is `float8`. */
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
