import { describe, expect, it } from 'vitest';

import {
  formattingFindings,
  MessageFormattingError,
} from './formatting-annotations';
import { bundle, local, text, variable } from './test-support/bundles';

/** The annotations Paraglide formats with (ADR 0008), written out here. */
const FORMATTING = [
  'number',
  'datetime',
  'date',
  'time',
  'relativetime',
  'icu:pound',
];

describe('formattingFindings (SPEC 6.3)', () => {
  it('finds each formatting annotation on an expression and on a local declaration', () => {
    for (const annotation of FORMATTING) {
      const formats = bundle(
        ['en'],
        [text('Total: '), variable('amount', annotation)],
        [local('shown', 'amount', annotation)],
        'total',
      );
      expect(formattingFindings([formats])).toEqual([
        { bundleId: 'total', locale: undefined, variable: 'shown', annotation },
        { bundleId: 'total', locale: 'en', variable: 'amount', annotation },
      ]);
    }
  });

  it('allows plural, other annotations, and plain values', () => {
    const selects = bundle(
      ['en', 'ar'],
      [variable('count'), text(' '), variable('name', 'uppercase')],
      [
        { type: 'input-variable', name: 'count' },
        local('countPlural', 'count', 'plural'),
      ],
    );
    expect(formattingFindings([selects])).toEqual([]);
  });

  it('names no variable for a literal', () => {
    const literal = {
      type: 'expression',
      arg: { type: 'literal', value: '0.5' },
      annotation: { type: 'function-reference', name: 'number', options: [] },
    };
    expect(formattingFindings([bundle(['ar'], [literal], [], 'half')])).toEqual(
      [
        {
          bundleId: 'half',
          locale: 'ar',
          variable: undefined,
          annotation: 'number',
        },
      ],
    );
  });

  it('lists each finding once, by bundle id, locale, variable, and annotation', () => {
    const sent = bundle(
      ['en', 'ar'],
      [
        variable('when', 'datetime'),
        text(' '),
        variable('when', 'time'),
        text(' '),
        variable('when', 'datetime'),
        text(' '),
        variable('at', 'time'),
      ],
      [local('day', 'when', 'date')],
      'sent',
    );
    const price = bundle(['ar'], [variable('amount', 'number')], [], 'price');
    expect(
      formattingFindings([sent, price]).map((finding) => [
        finding.bundleId,
        finding.locale,
        finding.variable,
        finding.annotation,
      ]),
    ).toEqual([
      ['price', 'ar', 'amount', 'number'],
      ['sent', undefined, 'day', 'date'],
      ['sent', 'ar', 'at', 'time'],
      ['sent', 'ar', 'when', 'datetime'],
      ['sent', 'ar', 'when', 'time'],
      ['sent', 'en', 'at', 'time'],
      ['sent', 'en', 'when', 'datetime'],
      ['sent', 'en', 'when', 'time'],
    ]);
  });
});

describe('MessageFormattingError (SPEC 6.3)', () => {
  it('names the count and lists one finding per line', () => {
    const findings = [
      {
        bundleId: 'price',
        locale: 'ar',
        variable: 'amount',
        annotation: 'number',
      },
      {
        bundleId: 'sent',
        locale: undefined,
        variable: 'day',
        annotation: 'date',
      },
      {
        bundleId: 'half',
        locale: 'en',
        variable: undefined,
        annotation: 'number',
      },
    ];
    const error = new MessageFormattingError(findings);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MessageFormattingError');
    expect(error.message).toBe(
      [
        "compile: 3 values are formatted inside messages, with the engine's defaults; format each with @nizam-os/intl-core and interpolate the string, or pass formatters: 'allow'",
        '  price (ar): amount: number',
        '  sent (every locale): day: date',
        '  half (en): a literal: number',
      ].join('\n'),
    );
    expect(error.findings).toEqual(findings);
    expect(error.findings).not.toBe(findings);
    expect(Object.isFrozen(error.findings)).toBe(true);
    expect(new MessageFormattingError(findings.slice(0, 1)).message).toMatch(
      /^compile: 1 value is formatted inside a message,/u,
    );
  });
});
