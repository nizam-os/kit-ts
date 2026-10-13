import type { Rule } from '@nizam-os/catalog-core';

import type { CheckSubject } from './subject';

import { describe, expect, it } from 'vitest';

import { incl, length, pattern, range } from '../test-support/rules';
import { INT4, TEXT, column } from '../test-support/subjects';
import { recognizeCheck } from './recognize';

type Case = [string, CheckSubject, string, Rule | null];

// The guard and conjunction rules, over deparsed text of the same form.
describe('recognizeCheck: guards and conjunctions (SPEC 8.3)', () => {
  it.each<Case>([
    [
      'a guard after the term',
      column('tx', TEXT),
      "((tx ~ 'a'::text) OR (tx IS NULL))",
      pattern('a'),
    ],
    [
      'a guard around a conjunction',
      column('i4', INT4),
      '((i4 IS NULL) OR ((i4 >= 1) AND (i4 <= 5)))',
      range(incl('1'), incl('5')),
    ],
    [
      'a guard inside a conjunction',
      column('tx', TEXT),
      '(((tx IS NULL) OR (char_length(tx) >= 1)) AND (char_length(tx) <= 5))',
      length(1, 5),
    ],
    [
      'two guards and nothing else',
      column('tx', TEXT),
      '((tx IS NULL) OR (tx IS NULL))',
      null,
    ],
    [
      'a guard and two terms',
      column('tx', TEXT),
      "((tx IS NULL) OR (tx = 'a'::text) OR (tx = 'b'::text))",
      null,
    ],
    [
      'a guard on another column',
      column('tx', TEXT),
      "((other IS NULL) OR (tx ~ 'a'::text))",
      null,
    ],
    [
      'an OR of terms',
      column('tx', TEXT),
      "((tx = 'a'::text) OR (tx = 'b'::text))",
      null,
    ],
    [
      "<> '' merges with a length",
      column('tx', TEXT),
      "((tx <> ''::text) AND (char_length(tx) <= 10))",
      length(1, 10),
    ],
    [
      'a bound set twice',
      column('tx', TEXT),
      '((char_length(tx) >= 1) AND (char_length(tx) >= 2))',
      null,
    ],
    [
      '= sets both bounds',
      column('tx', TEXT),
      '((char_length(tx) = 3) AND (char_length(tx) <= 5))',
      null,
    ],
    [
      'three range terms with a bound twice',
      column('i4', INT4),
      '((i4 > 0) AND (i4 < 10) AND (i4 <= 5))',
      null,
    ],
    [
      'mixed kinds',
      column('tx', TEXT),
      "((char_length(tx) >= 1) AND (tx ~ 'a'::text))",
      null,
    ],
    [
      'IS NOT NULL in a conjunction',
      column('tx', TEXT),
      '((tx IS NOT NULL) AND (char_length(tx) >= 1))',
      null,
    ],
    [
      'two patterns',
      column('tx', TEXT),
      "((tx ~ 'a'::text) AND (tx ~ 'b'::text))",
      null,
    ],
    [
      'two memberships',
      column('tx', TEXT),
      "((tx = 'a'::text) AND (tx = 'a'::text))",
      null,
    ],
    ['an unparsable expression', column('tx', TEXT), 'garbage(((', null],
  ])('%s', (_title, subject, expression, rule) => {
    expect(recognizeCheck(expression, subject)).toEqual(rule);
  });
});
