import type { Rule } from '@nizam-os/catalog-core';

import type { CheckSubject } from './subject';

import { describe, expect, it } from 'vitest';

import { NOT_NULL, length, members, pattern } from '../test-support/rules';
import {
  LEVEL,
  MOOD,
  TEXT,
  VARCHAR,
  WEIRD_MOOD,
  value,
  viaDomain,
} from '../test-support/subjects';
import { recognizeCheck } from './recognize';

type Case = [string, CheckSubject, string, Rule | null];

// Every expression is the exact text PostgreSQL 14 and 18 deparse for the
// CHECK in the title (pg_get_expr(conbin, ...)); the two majors agree.
describe('recognizeCheck: text and enum CHECKs on domains over VALUE (SPEC 8.3)', () => {
  it.each<Case>([
    [
      'text pattern',
      value(TEXT),
      "(VALUE ~ '^[a-z]+$'::text)",
      pattern('^[a-z]+$'),
    ],
    [
      'text length',
      value(TEXT),
      '(char_length(VALUE) <= 10)',
      length(null, 10),
    ],
    [
      'text IN',
      value(TEXT),
      "(VALUE = ANY (ARRAY['ab'::text, 'cd'::text]))",
      members('ab', 'cd'),
    ],
    [
      'varchar length between',
      value(VARCHAR),
      '((char_length((VALUE)::text) >= 2) AND (char_length((VALUE)::text) <= 8))',
      length(2, 8),
    ],
    [
      'varchar IN',
      value(VARCHAR),
      "((VALUE)::text = ANY ((ARRAY['ab'::character varying, 'cd'::character varying])::text[]))",
      members('ab', 'cd'),
    ],
    [
      'varchar pattern',
      value(VARCHAR),
      "((VALUE)::text ~ '^x'::text)",
      pattern('^x'),
    ],
    [
      "varchar <> ''",
      value(VARCHAR),
      "((VALUE)::text <> ''::text)",
      length(1, null),
    ],
    [
      'varchar =',
      value(VARCHAR),
      "((VALUE)::text = 'one'::text)",
      members('one'),
    ],
    [
      'enum IN',
      value(MOOD),
      "(VALUE = ANY (ARRAY['happy'::mood, 'sad'::mood]))",
      members('happy', 'sad'),
    ],
    ['enum =', value(MOOD), "(VALUE = 'happy'::mood)", members('happy')],
    [
      'quoted enum =',
      value(WEIRD_MOOD),
      '(VALUE = \'a\'::"Weird Mood")',
      members('a'),
    ],
    [
      'qualified enum =',
      value(LEVEL),
      "(VALUE = 'low'::other.level)",
      members('low'),
    ],
    [
      'over a text domain, pattern',
      value(viaDomain(TEXT)),
      "((VALUE)::text ~ '^q'::text)",
      pattern('^q'),
    ],
    [
      'over a text domain, length',
      value(viaDomain(TEXT)),
      '(char_length((VALUE)::text) >= 1)',
      length(1, null),
    ],
    ['IS NOT NULL', value(TEXT), '(VALUE IS NOT NULL)', NOT_NULL],
    [
      'information_schema.yes_or_no',
      value(VARCHAR),
      "((VALUE)::text = ANY ((ARRAY['YES'::character varying, 'NO'::character varying])::text[]))",
      members('YES', 'NO'),
    ],
  ])('%s', (_title, subject, expression, rule) => {
    expect(recognizeCheck(expression, subject)).toEqual(rule);
  });
});
