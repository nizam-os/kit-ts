/**
 * Rules as the CHECK recognizer reads them (catalog SPEC 8.1): length,
 * pattern, and membership on `text` and `varchar`, membership on an enum,
 * range on the integer types, `numeric`, and `float8`, and `notNull` on
 * any type, arrays included. Range bounds are decimal literals of the
 * subject's family, integral for the integer types, and some lie at or
 * past a type's limits, so the fold meets both kinds of bound.
 * Not published with the package.
 * @packageDocumentation
 */
import type { RangeBound, Rule } from '@nizam-os/catalog-core';

import type { Random } from './random';

/** What decides the rules a value can carry. */
export interface RuleSubject {
  /** The base type's name, or the enum's. */
  readonly base: string;
  readonly isEnum: boolean;
  /** An enum's labels. */
  readonly labels: ReadonlyArray<string>;
  readonly array: boolean;
}

const NOT_NULL: Rule = { kind: 'notNull' };

const INTEGRAL = [
  '0',
  '1',
  '-1',
  '100',
  '-32768',
  '32767',
  '32768',
  '-2147483648',
  '2147483647',
  '2147483648',
  '-9223372036854775808',
  '9223372036854775807',
] as const;

const FRACTIONAL = ['0.5', '-0.25', '1.005', '12.34', '-99.995', '0.001'];

const PATTERNS = [
  '^[a-z]+$',
  '^[^@]+@[^@]+$',
  '^[A-Z]{2}$',
  'b',
  '^[0-9a-f]+$',
];

const WORDS = ['red', 'green', 'blue', 'cyan'];

const RANGE_BASES = new Set(['int2', 'int4', 'int8', 'numeric', 'float8']);
const TEXT_BASES = new Set(['text', 'varchar']);
const SMALL_RANGE = 1000;
const MAX_MIN_LENGTH = 5;
const MAX_LENGTH = 64;

function boundValue(random: Random, integral: boolean): string {
  if (random.chance(0.3)) {
    return String(random.int(-SMALL_RANGE, SMALL_RANGE));
  }
  return integral || random.chance(0.5)
    ? random.pick(INTEGRAL)
    : random.pick(FRACTIONAL);
}

function bound(random: Random, integral: boolean): RangeBound | null {
  return random.chance(0.3)
    ? null
    : { value: boundValue(random, integral), inclusive: random.chance(0.5) };
}

/** A range with at least one bound, its bounds in order as a CHECK states them. */
function rangeRule(random: Random, integral: boolean): Rule {
  const min = bound(random, integral);
  const max = bound(random, integral);
  if (min === null && max === null) {
    const only = { value: boundValue(random, integral), inclusive: true };
    return { kind: 'range', min: only, max: null };
  }
  if (min !== null && max !== null && Number(min.value) > Number(max.value)) {
    return { kind: 'range', min: max, max: min };
  }
  return { kind: 'range', min, max };
}

function lengthRule(random: Random): Rule {
  const min = random.chance(0.5) ? random.int(0, MAX_MIN_LENGTH) : null;
  const max =
    min === null || random.chance(0.5)
      ? random.int(min ?? 1, MAX_LENGTH)
      : null;
  return { kind: 'length', min, max };
}

function membership(random: Random, pool: ReadonlyArray<string>): Rule {
  const values = random.subset(pool);
  return {
    kind: 'enum',
    values: values.length > 0 ? values : [random.pick(pool)],
  };
}

function textRule(random: Random): Rule {
  const kind = random.pick(['length', 'pattern', 'enum', 'notNull'] as const);
  if (kind === 'length') {
    return lengthRule(random);
  }
  if (kind === 'pattern') {
    return { kind: 'pattern', source: random.pick(PATTERNS), flags: 'su' };
  }
  return kind === 'enum' ? membership(random, WORDS) : NOT_NULL;
}

/** A rule the recognizer could read from a CHECK on a value of `subject`. */
export function ruleFor(random: Random, subject: RuleSubject): Rule {
  if (subject.array || random.chance(0.15)) {
    return NOT_NULL;
  }
  if (subject.isEnum) {
    return subject.labels.length > 0
      ? membership(random, subject.labels)
      : NOT_NULL;
  }
  if (TEXT_BASES.has(subject.base)) {
    return textRule(random);
  }
  if (RANGE_BASES.has(subject.base)) {
    return rangeRule(
      random,
      subject.base !== 'numeric' && subject.base !== 'float8',
    );
  }
  return NOT_NULL;
}
