import type { Rule } from '@nizam-os/catalog-core';

import type { CheckSubject } from './subject';

import { describe, expect, it } from 'vitest';

import { excl, incl, range } from '../test-support/rules';
import {
  FLOAT4,
  FLOAT8,
  INT2,
  INT4,
  INT8,
  NUMERIC,
  column,
  value,
  viaDomain,
} from '../test-support/subjects';
import { recognizeCheck } from './recognize';

type Case = [string, CheckSubject, string, Rule | null];

// Every expression is the exact text PostgreSQL 14 and 18 deparse for the
// CHECK in the title (pg_get_expr(conbin, ...)); the two majors agree.
describe('recognizeCheck: range bounds on table columns (SPEC 8.3)', () => {
  it.each<Case>([
    [
      'smallint range',
      column('i2', INT2),
      '((i2 > 0) AND (i2 < 100))',
      range(excl('0'), excl('100')),
    ],
    [
      'integer >= -10',
      column('i4', INT4),
      "(i4 >= '-10'::integer)",
      range(incl('-10'), null),
    ],
    [
      'integer > 3000000000',
      column('i4', INT4),
      "(i4 > '3000000000'::bigint)",
      range(excl('3000000000'), null),
    ],
    [
      'integer >= 1.5 compares as numeric',
      column('i4', INT4),
      '((i4)::numeric >= 1.5)',
      null,
    ],
    [
      'integer > 5::bigint',
      column('i4', INT4),
      '(i4 > (5)::bigint)',
      range(excl('5'), null),
    ],
    ['bigint > 5', column('i8', INT8), '(i8 > 5)', range(excl('5'), null)],
    [
      'bigint < 3000000000',
      column('i8', INT8),
      "(i8 < '3000000000'::bigint)",
      range(null, excl('3000000000')),
    ],
    [
      'bigint > -3000000000',
      column('i8', INT8),
      "(i8 > '-3000000000'::bigint)",
      range(excl('-3000000000'), null),
    ],
    [
      'numeric >= 0',
      column('nm', NUMERIC),
      '(nm >= (0)::numeric)',
      range(incl('0'), null),
    ],
    [
      'numeric > 0.5',
      column('nm', NUMERIC),
      '(nm > 0.5)',
      range(excl('0.5'), null),
    ],
    [
      'numeric < -0.25',
      column('nm', NUMERIC),
      "(nm < '-0.25'::numeric)",
      range(null, excl('-0.25')),
    ],
    [
      'numeric <= 1e20',
      column('nm', NUMERIC),
      "(nm <= '100000000000000000000'::numeric)",
      range(null, incl('100000000000000000000')),
    ],
    [
      'float8 >= 0',
      column('f8', FLOAT8),
      '(f8 >= (0)::double precision)',
      range(incl('0'), null),
    ],
    [
      'float8 > 1.5',
      column('f8', FLOAT8),
      '(f8 > (1.5)::double precision)',
      range(excl('1.5'), null),
    ],
    [
      'float8 < -1.5',
      column('f8', FLOAT8),
      "(f8 < ('-1.5'::numeric)::double precision)",
      range(null, excl('-1.5')),
    ],
    [
      'float8 < 1e10',
      column('f8', FLOAT8),
      "(f8 < ('10000000000'::numeric)::double precision)",
      range(null, excl('10000000000')),
    ],
    [
      'float4 rounds before the CHECK',
      column('f4', FLOAT4),
      '(f4 > (0)::double precision)',
      null,
    ],
    [
      'a numeric domain column',
      column('dn', viaDomain(NUMERIC)),
      '((dn)::numeric <= (50)::numeric)',
      range(null, incl('50')),
    ],
    [
      'an integer domain column',
      column('di', viaDomain(INT4)),
      '((di)::integer > 0)',
      range(excl('0'), null),
    ],
    ['two columns', column('a', INT4), '(a < b)', null],
  ])('%s', (_title, subject, expression, rule) => {
    expect(recognizeCheck(expression, subject)).toEqual(rule);
  });
});

describe('recognizeCheck: range bounds on domains (SPEC 8.3)', () => {
  it.each<Case>([
    [
      'numeric between',
      value(NUMERIC),
      '((VALUE >= (0)::numeric) AND (VALUE <= (100)::numeric))',
      range(incl('0'), incl('100')),
    ],
    [
      'numeric > -1.5',
      value(NUMERIC),
      "(VALUE > '-1.5'::numeric)",
      range(excl('-1.5'), null),
    ],
    [
      'numeric < 1e10',
      value(NUMERIC),
      "(VALUE < '10000000000'::numeric)",
      range(null, excl('10000000000')),
    ],
    [
      'integer between',
      value(INT4),
      "((VALUE >= '-5'::integer) AND (VALUE <= 5))",
      range(incl('-5'), incl('5')),
    ],
    [
      'integer > 3000000000',
      value(INT4),
      "(VALUE > '3000000000'::bigint)",
      range(excl('3000000000'), null),
    ],
    [
      'the smallest bigint',
      value(INT8),
      "(VALUE >= '-9223372036854775808'::bigint)",
      range(incl('-9223372036854775808'), null),
    ],
    [
      'smallint > 5::smallint',
      value(INT2),
      '(VALUE > (5)::smallint)',
      range(excl('5'), null),
    ],
    [
      'smallint < -3',
      value(INT2),
      "(VALUE < '-3'::integer)",
      range(null, excl('-3')),
    ],
    [
      'float8 >= 0',
      value(FLOAT8),
      '(VALUE >= (0)::double precision)',
      range(incl('0'), null),
    ],
    [
      'float8 < 1.5',
      value(FLOAT8),
      '(VALUE < (1.5)::double precision)',
      range(null, excl('1.5')),
    ],
    [
      'float8 > -2.5',
      value(FLOAT8),
      "(VALUE > ('-2.5'::numeric)::double precision)",
      range(excl('-2.5'), null),
    ],
    [
      "float8 <> 'NaN'",
      value(FLOAT8),
      "(VALUE <> 'NaN'::double precision)",
      null,
    ],
    [
      'information_schema.cardinal_number',
      value(INT4),
      '(VALUE >= 0)',
      range(incl('0'), null),
    ],
  ])('%s', (_title, subject, expression, rule) => {
    expect(recognizeCheck(expression, subject)).toEqual(rule);
  });
});
