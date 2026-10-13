/**
 * The fold of a scalar level's type bounds and rules (SPEC 5.1, 6.1, 8):
 * the larger minimum length and the smaller maximum, the tightest bound on
 * each side, `numeric(p, s)`'s step, and every pattern once. An array level
 * has no limits of its own; its element has.
 * Not published with the package.
 * @packageDocumentation
 */
import type { Rule } from '@nizam-os/catalog-core';

import type { ModelBound } from './decimal';
import type { LevelBase, ValueLevel } from './value-levels';

import { powerOfTen, tightest } from './decimal';
import { domainRules } from './value-levels';

/** A level's folded limits; `patterns` sorted, since the SPEC gives them no order. */
export interface ModelLimits {
  readonly minLength: number | null;
  readonly maxLength: number | null;
  readonly lower: ModelBound | null;
  readonly upper: ModelBound | null;
  readonly multipleOf: string | null;
  readonly patterns: ReadonlyArray<string>;
}

/** No limits: an array level, and every type without bounds or rules. */
const NO_MODEL_LIMITS: ModelLimits = {
  minLength: null,
  maxLength: null,
  lower: null,
  upper: null,
  multipleOf: null,
  patterns: [],
};

const INTEGER_RANGES: Readonly<Record<string, readonly [string, string]>> = {
  int2: ['-32768', '32767'],
  int4: ['-2147483648', '2147483647'],
  int8: ['-9223372036854775808', '9223372036854775807'],
};

/** The type's own bounds as range ends: an integer type's range, `numeric(p, s)`'s magnitude. */
function typeBounds(
  base: LevelBase,
): readonly [Array<ModelBound>, Array<ModelBound>] {
  const range = base.isEnum ? undefined : INTEGER_RANGES[base.type];
  if (range !== undefined) {
    return [
      [{ value: range[0], inclusive: true }],
      [{ value: range[1], inclusive: true }],
    ];
  }
  if (base.type === 'numeric' && base.precision !== null) {
    const magnitude = powerOfTen(base.precision - (base.scale ?? 0));
    return [
      [{ value: `-${magnitude}`, inclusive: false }],
      [{ value: magnitude, inclusive: false }],
    ];
  }
  return [[], []];
}

function typeMaxLength(base: LevelBase): number | null {
  return base.type === 'varchar' || base.type === 'bpchar'
    ? base.maxLength
    : null;
}

function smallest(values: ReadonlyArray<number | null>): number | null {
  const present = values.filter((value) => value !== null);
  return present.length === 0 ? null : Math.min(...present);
}

function largest(values: ReadonlyArray<number | null>): number | null {
  const present = values.filter((value) => value !== null);
  return present.length === 0 ? null : Math.max(...present);
}

/**
 * The limits of a scalar level under its domains' rules and `extra`, the
 * column's own rules at the top level; the empty fold for an array.
 */
export function levelLimits(
  level: ValueLevel,
  extra: ReadonlyArray<Rule>,
): ModelLimits {
  const { base } = level;
  if (base === null) {
    return NO_MODEL_LIMITS;
  }
  const rules = [...domainRules(level), ...extra];
  const lengths = rules.flatMap((rule) =>
    rule.kind === 'length' ? [rule] : [],
  );
  const ranges = rules.flatMap((rule) => (rule.kind === 'range' ? [rule] : []));
  const patterns = rules.flatMap((rule) =>
    rule.kind === 'pattern' ? [rule.source] : [],
  );
  const [lowers, uppers] = typeBounds(base);
  return {
    minLength: largest(lengths.map(({ min }) => min)),
    maxLength: smallest([
      typeMaxLength(base),
      ...lengths.map(({ max }) => max),
    ]),
    lower: tightest(
      [...lowers, ...ranges.flatMap(({ min }) => (min === null ? [] : [min]))],
      'lower',
    ),
    upper: tightest(
      [...uppers, ...ranges.flatMap(({ max }) => (max === null ? [] : [max]))],
      'upper',
    ),
    multipleOf:
      base.type === 'numeric' && !base.isEnum && base.precision !== null
        ? powerOfTen(-(base.scale ?? 0))
        : null,
    patterns: [...new Set(patterns)].toSorted(),
  };
}
