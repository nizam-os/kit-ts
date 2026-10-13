import type { Rule } from '@nizam-os/catalog-core';

import type { CheckSubject } from './subject';

import { describe, expect, it } from 'vitest';

import { NOT_NULL, length, members, pattern } from '../test-support/rules';
import {
  LEVEL,
  MOOD,
  TEXT,
  TEXT_ARRAY,
  VARCHAR,
  WEIRD_MOOD,
  column,
  viaDomain,
} from '../test-support/subjects';
import { recognizeCheck } from './recognize';

type Case = [string, CheckSubject, string, Rule | null];

// Every expression is the exact text PostgreSQL 14 and 18 deparse for the
// CHECK in the title (pg_get_expr(conbin, ...)); the two majors agree.
describe('recognizeCheck: text, enum, and null CHECKs on table columns (SPEC 8.3)', () => {
  it.each<Case>([
    [
      'char_length between',
      column('tx', TEXT),
      '((char_length(tx) >= 1) AND (char_length(tx) <= 200))',
      length(1, 200),
    ],
    ["<> ''", column('tx2', TEXT), "(tx2 <> ''::text)", length(1, null)],
    [
      'IN on text',
      column('tx3', TEXT),
      "(tx3 = ANY (ARRAY['active'::text, 'archived'::text]))",
      members('active', 'archived'),
    ],
    [
      'IN with one member',
      column('tx4', TEXT),
      "(tx4 = 'only'::text)",
      members('only'),
    ],
    [
      'a guarded pattern',
      column('tx5', TEXT),
      "((tx5 IS NULL) OR (tx5 ~ '^https://'::text))",
      pattern('^https://'),
    ],
    ['length > 0', column('tx6', TEXT), '(length(tx6) > 0)', length(1, null)],
    [
      'character_length < 5',
      column('tx6', TEXT),
      '(character_length(tx6) < 5)',
      length(null, 4),
    ],
    [
      'varchar length',
      column('vc', VARCHAR),
      '(char_length((vc)::text) >= 1)',
      length(1, null),
    ],
    [
      'IN on varchar',
      column('vc2', VARCHAR),
      "((vc2)::text = ANY ((ARRAY['ab'::character varying, 'cd'::character varying])::text[]))",
      members('ab', 'cd'),
    ],
    [
      '= on varchar',
      column('vc3', VARCHAR),
      "((vc3)::text = 'ab'::text)",
      members('ab'),
    ],
    [
      'varchar pattern',
      column('vc4', VARCHAR),
      "((vc4)::text ~ '^\\+?[0-9 ]+$'::text)",
      pattern('^\\+?[0-9 ]+$'),
    ],
    [
      "varchar <> ''",
      column('vc5', VARCHAR),
      "((vc5)::text <> ''::text)",
      length(1, null),
    ],
    [
      'IN on an enum',
      column('mo', MOOD),
      "(mo = ANY (ARRAY['happy'::mood, 'it''s'::mood]))",
      members('happy', "it's"),
    ],
    ['= on an enum', column('mo', MOOD), "(mo = 'sad'::mood)", members('sad')],
    [
      'an enum compared as text',
      column('mo', MOOD),
      "((mo)::text = 'happy'::text)",
      null,
    ],
    [
      'a quoted enum type',
      column('wm', WEIRD_MOOD),
      '(wm = ANY (ARRAY[\'a\'::"Weird Mood", \'b\'::"Weird Mood"]))',
      members('a', 'b'),
    ],
    [
      'an enum outside the search path',
      column('lv', LEVEL),
      "(lv = 'low'::other.level)",
      members('low'),
    ],
    [
      'a domain column IN',
      column('dt', viaDomain(TEXT)),
      "((dt)::text = 'ab'::text)",
      members('ab'),
    ],
    [
      'a domain column length',
      column('dt', viaDomain(TEXT)),
      '(char_length((dt)::text) < 4)',
      length(null, 3),
    ],
    [
      'a domain column pattern',
      column('dt', viaDomain(TEXT)),
      "((dt)::text ~ 'a'::text)",
      pattern('a'),
    ],
    [
      'a quoted column',
      column('Position', TEXT),
      '("Position" = \'x\'::text)',
      members('x'),
    ],
    [
      'a keyword column',
      column('position', TEXT),
      '("position" ~ \'y\'::text)',
      pattern('y'),
    ],
    [
      'a column named value',
      column('value', TEXT),
      "(value ~ 'z'::text)",
      pattern('z'),
    ],
    ['IS NOT NULL', column('nn', TEXT), '(nn IS NOT NULL)', NOT_NULL],
    [
      'IS NULL OR IS NOT NULL holds for every value',
      column('nn', TEXT),
      '((nn IS NULL) OR (nn IS NOT NULL))',
      null,
    ],
    ['NOT', column('nn', TEXT), '(NOT (nn IS NULL))', null],
    [
      'NOT IN',
      column('nin', TEXT),
      "(nin <> ALL (ARRAY['a'::text, 'b'::text]))",
      null,
    ],
    [
      'COLLATE',
      column('col', TEXT),
      '(col ~ (\'^a\'::text COLLATE "C"))',
      null,
    ],
    [
      'array_length',
      column('ar', TEXT_ARRAY),
      '(array_length(ar, 1) < 5)',
      null,
    ],
  ])('%s', (_title, subject, expression, rule) => {
    expect(recognizeCheck(expression, subject)).toEqual(rule);
  });
});
