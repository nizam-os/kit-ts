import type { Rule } from '@nizam-os/catalog-core';

import type { CheckSubject } from './subject';

import { describe, expect, it } from 'vitest';

import { NOT_NULL, length, members, pattern } from '../test-support/rules';
import {
  BPCHAR,
  CITEXT,
  FLOAT8,
  INT4,
  INT8,
  MOOD,
  NUMERIC,
  TEXT,
  TEXT_ARRAY,
  VARCHAR,
  column,
  nondeterministic,
  value,
  viaDomain,
} from '../test-support/subjects';
import { recognizeCheck } from './recognize';

type Case = [string, CheckSubject, string, Rule | null];

const tx = column('tx', TEXT);

describe('recognizeCheck: subjects that get no rule (SPEC 8.1)', () => {
  it.each<Case>([
    [
      'IN under a nondeterministic collation',
      column('tx', nondeterministic(TEXT)),
      "(tx = ANY (ARRAY['a'::text]))",
      null,
    ],
    [
      'a pattern under a nondeterministic collation',
      column('tx', nondeterministic(TEXT)),
      "(tx ~ 'a'::text)",
      null,
    ],
    [
      'a length under a nondeterministic collation',
      column('tx', nondeterministic(TEXT)),
      '(char_length(tx) < 5)',
      null,
    ],
    [
      'IS NOT NULL under any collation',
      column('tx', nondeterministic(TEXT)),
      '(tx IS NOT NULL)',
      NOT_NULL,
    ],
    [
      'a citext pattern, which ignores case',
      column('em', CITEXT),
      "(em ~ '^x'::text)",
      null,
    ],
    [
      'a bpchar member, which ignores trailing spaces',
      column('bp', BPCHAR),
      "(bp = 'ab'::bpchar)",
      null,
    ],
    ['a bpchar length', column('bp', BPCHAR), '(char_length(bp) > 1)', null],
    [
      'an array IS NOT NULL',
      column('ar', TEXT_ARRAY),
      '(ar IS NOT NULL)',
      NOT_NULL,
    ],
    [
      'an uncast varchar, which only an operator on varchar takes',
      column('vc', VARCHAR),
      "(vc ~ 'x'::text)",
      null,
    ],
    [
      'an uncast text domain',
      column('dt', viaDomain(TEXT)),
      "(dt ~ 'a'::text)",
      null,
    ],
    [
      'an uncast numeric domain',
      column('dn', viaDomain(NUMERIC)),
      '(dn <= (50)::numeric)',
      null,
    ],
    [
      'an integer against a numeric constant',
      column('i4', INT4),
      '(i4 > 1.5)',
      null,
    ],
    [
      'a numeric against an integer constant',
      column('nm', NUMERIC),
      '(nm > 5)',
      null,
    ],
    [
      'a float8 against a numeric constant',
      column('f8', FLOAT8),
      '(f8 > 1.5)',
      null,
    ],
    [
      'a bigint against a constant beyond int8',
      column('i8', INT8),
      '(i8 > 10000000000000000000)',
      null,
    ],
    [
      'a bigint against a constant beyond int4',
      column('i8', INT8),
      '(i8 > 3000000000)',
      {
        kind: 'range',
        min: { value: '3000000000', inclusive: false },
        max: null,
      },
    ],
  ])('%s', (_title, subject, expression, rule) => {
    expect(recognizeCheck(expression, subject)).toEqual(rule);
  });
});

describe('recognizeCheck: the edges of each shape (SPEC 8.3)', () => {
  it.each<Case>([
    ['a length below zero', tx, '(char_length(tx) < 0)', null],
    ['a length of exactly zero', tx, '(char_length(tx) = 0)', length(0, 0)],
    [
      'a negative length constant',
      tx,
      "(char_length(tx) <= '-1'::integer)",
      null,
    ],
    ['the constant first', tx, '(5 >= char_length(tx))', length(null, 5)],
    ['a length that is not', tx, '(char_length(tx) <> 3)', null],
    ['octet_length', tx, '(octet_length(tx) < 5)', null],
    [
      'a qualified built-in',
      tx,
      '(pg_catalog.char_length(tx) < 5)',
      length(null, 4),
    ],
    ['a function of another schema', tx, '(public.char_length(tx) < 5)', null],
    ['the length of another column', tx, '(char_length(other) < 5)', null],
    ['a second argument', tx, '(char_length(tx, 1) < 5)', null],
    [
      'a repeated member',
      tx,
      "(tx = ANY (ARRAY['a'::text, 'b'::text, 'a'::text]))",
      members('a', 'b'),
    ],
    [
      'a member with a modifier',
      tx,
      "(tx = ANY (ARRAY['a'::character varying(1)]))",
      null,
    ],
    ['an empty array', tx, '(tx = ANY (ARRAY[]::text[]))', null],
    ['the member first', tx, "('a'::text = tx)", members('a')],
    [
      'an enum member of another type',
      column('mo', MOOD),
      "(mo = 'sad'::other.level)",
      null,
    ],
    ['a text member of an enum type', tx, "(tx = 'a'::mood)", null],
    ["<> '' with the constant first", tx, "(''::text <> tx)", length(1, null)],
    ["<> 'a'", tx, "(tx <> 'a'::text)", null],
    ['a pattern from a column', tx, '(tx ~ other)', null],
    ['a varchar pattern constant', tx, "(tx ~ 'a'::character varying)", null],
    ['a pattern outside the subset', tx, "(tx ~ '^\\d+$'::text)", null],
    ['the subject as the pattern', tx, "('a'::text ~ tx)", null],
    ['a quoted subject', tx, '("tx" ~ \'a\'::text)', pattern('a')],
    [
      'a bare name the deparser would quote',
      column('Tx', TEXT),
      '(Tx IS NOT NULL)',
      null,
    ],
    [
      'value in lower case for a domain',
      value(TEXT),
      '(value IS NOT NULL)',
      null,
    ],
  ])('%s', (_title, subject, expression, rule) => {
    expect(recognizeCheck(expression, subject)).toEqual(rule);
  });
});
