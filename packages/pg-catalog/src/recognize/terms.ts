/**
 * The single-term shapes of SPEC 8.3: length bounds, `S <> ''`, range
 * bounds, membership, `IS NOT NULL`, and patterns. Each matches the exact
 * deparsed form, either way round where the operator allows, and gives
 * `null` for anything else.
 * @packageDocumentation
 */
import type {
  EnumRule,
  LengthRule,
  RangeBound,
  RangeRule,
  Rule,
} from '@nizam-os/catalog-core';

import type { BinaryOperator, SqlNode } from '../sql/nodes';
import type { CheckSubject } from './subject';

import { lengthConstant, rangeConstant, stringConstant } from './constants';
import { translatePattern } from './pattern';
import {
  isEnum,
  isSubject,
  isTextual,
  numericFamily,
  subjectType,
} from './subject';

type BinaryNode = Extract<SqlNode, { kind: 'binary' }>;
type AnyNode = Extract<SqlNode, { kind: 'any' }>;

/** A comparison read from the matched side: the other side and the operator as seen from the matched one. */
interface Oriented {
  readonly other: SqlNode;
  readonly operator: BinaryOperator;
}

/** The type a member constant and the subject compare as, and the labels a member may carry. */
interface Membership {
  readonly type: string;
  readonly labels: ReadonlySet<string>;
}

const TEXT = 'text';
const TEXT_LABELS: ReadonlySet<string> = new Set([TEXT, 'character varying']);
const PATTERN_LABELS: ReadonlySet<string> = new Set([TEXT]);
/** The array cast the deparser adds when `varchar` members meet a text subject. */
const TEXT_ARRAY = 'text[]';
const LENGTH_FUNCTIONS: ReadonlySet<string> = new Set([
  'char_length',
  'character_length',
  'length',
]);
const BUILTIN_SCHEMA = 'pg_catalog';
const FLIPPED: Partial<Record<BinaryOperator, BinaryOperator>> = {
  '<': '>',
  '<=': '>=',
  '>': '<',
  '>=': '<=',
};

export function lengthRule(min: number | null, max: number | null): LengthRule {
  return { kind: 'length', min, max };
}

export function rangeRule(
  min: RangeBound | null,
  max: RangeBound | null,
): RangeRule {
  return { kind: 'range', min, max };
}

/** Strict length bounds become inclusive: `> 0` is `min: 1`; a bound below zero gives `null`. */
const LENGTH_BOUNDS: Partial<
  Record<BinaryOperator, (bound: number) => LengthRule | null>
> = {
  '>=': (bound) => lengthRule(bound, null),
  '>': (bound) => lengthRule(bound + 1, null),
  '<=': (bound) => lengthRule(null, bound),
  '<': (bound) => (bound === 0 ? null : lengthRule(null, bound - 1)),
  '=': (bound) => lengthRule(bound, bound),
};

const RANGE_BOUNDS: Partial<
  Record<BinaryOperator, (value: string) => RangeRule>
> = {
  '>=': (value) => rangeRule({ value, inclusive: true }, null),
  '>': (value) => rangeRule({ value, inclusive: false }, null),
  '<=': (value) => rangeRule(null, { value, inclusive: true }),
  '<': (value) => rangeRule(null, { value, inclusive: false }),
};

/** The comparison with the side `matches` accepts first, its operator flipped when that side was on the right. */
function orient(
  node: BinaryNode,
  matches: (side: SqlNode) => boolean,
): Oriented | null {
  if (matches(node.left)) {
    return { other: node.right, operator: node.operator };
  }
  if (matches(node.right)) {
    const operator = FLIPPED[node.operator] ?? node.operator;
    return { other: node.left, operator };
  }
  return null;
}

function isLengthCall(node: SqlNode, subject: CheckSubject): boolean {
  if (
    node.kind !== 'call' ||
    !LENGTH_FUNCTIONS.has(node.name) ||
    (node.schema !== null && node.schema !== BUILTIN_SCHEMA)
  ) {
    return false;
  }
  const [argument, ...rest] = node.args;
  return (
    argument !== undefined &&
    rest.length === 0 &&
    subjectType(argument, subject) === TEXT
  );
}

/** `F(S) op N`, either way round, with `F` one of the character-length functions. */
function lengthTerm(node: BinaryNode, subject: CheckSubject): Rule | null {
  const sides = orient(node, (side) => isLengthCall(side, subject));
  const bound = sides === null ? null : lengthConstant(sides.other);
  if (sides === null || bound === null || !isTextual(subject)) {
    return null;
  }
  return LENGTH_BOUNDS[sides.operator]?.(bound) ?? null;
}

/** `S <> ''`, either way round: at least one character. */
function nonEmptyTerm(node: BinaryNode, subject: CheckSubject): Rule | null {
  if (node.operator !== '<>' || !isTextual(subject)) {
    return null;
  }
  const sides = orient(node, (side) => subjectType(side, subject) === TEXT);
  return sides !== null && stringConstant(sides.other, TEXT_LABELS) === ''
    ? lengthRule(1, null)
    : null;
}

/** `S op L`, either way round, with `L` of the subject's numeric family. */
function rangeTerm(node: BinaryNode, subject: CheckSubject): Rule | null {
  const family = numericFamily(subject);
  const sides = orient(
    node,
    (side) => subjectType(side, subject) === subject.baseSpelling,
  );
  const constant = sides === null ? null : rangeConstant(sides.other);
  if (sides === null || constant === null || constant.family !== family) {
    return null;
  }
  return RANGE_BOUNDS[sides.operator]?.(constant.value) ?? null;
}

function membership(subject: CheckSubject): Membership | null {
  if (isTextual(subject)) {
    return { type: TEXT, labels: TEXT_LABELS };
  }
  return isEnum(subject)
    ? { type: subject.baseSpelling, labels: new Set([subject.baseSpelling]) }
    : null;
}

function enumRule(values: ReadonlyArray<string>): EnumRule {
  return { kind: 'enum', values: [...new Set(values)] };
}

/** `S = c`, either way round: how the deparser prints `IN` with one member. */
function equalityTerm(node: BinaryNode, subject: CheckSubject): Rule | null {
  const context = membership(subject);
  if (node.operator !== '=' || context === null) {
    return null;
  }
  const sides = orient(
    node,
    (side) => subjectType(side, subject) === context.type,
  );
  const value =
    sides === null ? null : stringConstant(sides.other, context.labels);
  return value === null ? null : enumRule([value]);
}

/** `S ~ '<pattern>'::text` with the pattern inside SPEC 8.4. */
function patternTerm(node: BinaryNode, subject: CheckSubject): Rule | null {
  if (
    node.operator !== '~' ||
    !isTextual(subject) ||
    subjectType(node.left, subject) !== TEXT
  ) {
    return null;
  }
  const pattern = stringConstant(node.right, PATTERN_LABELS);
  const source = pattern === null ? null : translatePattern(pattern);
  return source === null ? null : { kind: 'pattern', source, flags: 'su' };
}

function arrayElements(
  node: SqlNode,
  context: Membership,
): ReadonlyArray<SqlNode> | null {
  if (node.kind === 'array') {
    return node.elements;
  }
  const textArray =
    context.type === TEXT &&
    node.kind === 'cast' &&
    node.type === TEXT_ARRAY &&
    node.operand.kind === 'array';
  return textArray ? node.operand.elements : null;
}

/** `S = ANY (ARRAY[c1, ..., cn])`, and its `(...)::text[]` form for `varchar` members. */
function anyTerm(node: AnyNode, subject: CheckSubject): Rule | null {
  const context = membership(subject);
  if (context === null || subjectType(node.left, subject) !== context.type) {
    return null;
  }
  const values = (arrayElements(node.right, context) ?? []).map((element) =>
    stringConstant(element, context.labels),
  );
  return values.length > 0 &&
    values.every((value): value is string => value !== null)
    ? enumRule(values)
    : null;
}

function binaryTerm(node: BinaryNode, subject: CheckSubject): Rule | null {
  return (
    lengthTerm(node, subject) ??
    nonEmptyTerm(node, subject) ??
    rangeTerm(node, subject) ??
    equalityTerm(node, subject) ??
    patternTerm(node, subject)
  );
}

/** The rule of one term, which is not an `AND` or an `OR`. */
export function term(node: SqlNode, subject: CheckSubject): Rule | null {
  if (node.kind === 'nullTest') {
    return node.negated && isSubject(node.operand, subject)
      ? { kind: 'notNull' }
      : null;
  }
  if (node.kind === 'binary') {
    return binaryTerm(node, subject);
  }
  return node.kind === 'any' ? anyTerm(node, subject) : null;
}
