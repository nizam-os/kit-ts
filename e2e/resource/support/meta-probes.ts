/**
 * Values a client that follows a member's field metadata would send, each
 * with whether the metadata admits it (resource SPEC 8): the members of
 * its options and a value outside them, each stated bound and the value
 * one step past it, the fraction digits a date-time keeps and one more, a
 * value in a `date` or `uuid` format or of the `boolean` wire type and one
 * just outside it, `null` by nullability, and an array's elements one at
 * a time. Only the public metadata is read, so the probes test what the
 * metadata states. A stated fact that no probe can test is reported as
 * `skipped`.
 */
import type { FieldLimits, FieldMeta } from '@nizam-os/resource-core';

import type { NumberKind } from './meta-number-probes.ts';

import { numberProbes } from './meta-number-probes.ts';
import { textProbes } from './meta-text-probes.ts';

/** A value and whether the metadata admits it. */
export interface MetaProbe {
  readonly value: unknown;
  readonly admitted: boolean;
  /** What the probe tests, such as `maxLength 3, one over`. */
  readonly label: string;
}

/** The probes of a member, and how many stated facts no probe could test. */
export interface MemberProbes {
  readonly probes: ReadonlyArray<MetaProbe>;
  readonly skipped: number;
}

/** What the probes of a value read: a field's members, or an array's `items`. */
type ValueFacts = Pick<
  FieldMeta,
  'wire' | 'format' | 'fractionDigits' | 'limits' | 'options'
>;

const NUMBER_KINDS: Readonly<Record<string, NumberKind>> = {
  'integer:int16': { family: 'integer', text: false },
  'integer:int32': { family: 'integer', text: false },
  'number:float': { family: 'float', text: false },
  'number:double': { family: 'float', text: false },
  'string:int16': { family: 'integer', text: true },
  'string:int32': { family: 'integer', text: true },
  'string:int64': { family: 'integer', text: true },
  'string:decimal': { family: 'decimal', text: true },
  'string:float': { family: 'float', text: true },
  'string:double': { family: 'float', text: true },
};

const DATE_TIME = '2024-02-29T12:34:56';
const DIGITS = '1234567';

/** Probes of a format or wire type that states nothing else, keyed by format, else by wire type. */
const FORM_PROBES: Readonly<Record<string, ReadonlyArray<MetaProbe>>> = {
  date: [
    { value: '2024-02-29', admitted: true, label: 'format date' },
    { value: '2023-02-29', admitted: false, label: 'format date, no such day' },
  ],
  uuid: [
    {
      value: '0f8fad5b-d9cb-469f-a165-70867728950e',
      admitted: true,
      label: 'format uuid',
    },
    {
      value: '0f8fad5b-d9cb-469f-a165-70867728950',
      admitted: false,
      label: 'format uuid, a digit short',
    },
  ],
  boolean: [
    { value: true, admitted: true, label: 'wire boolean' },
    { value: false, admitted: true, label: 'wire boolean' },
    { value: 'true', admitted: false, label: 'wire boolean, a string' },
  ],
};

function optionProbes(
  options: ReadonlyArray<string>,
): ReadonlyArray<MetaProbe> {
  const outside = `~${options.join('')}`;
  return [
    ...options.map((option) => ({
      value: option,
      admitted: true,
      label: `option ${option}`,
    })),
    { value: outside, admitted: false, label: 'outside the options' },
  ];
}

/** A date-time with `digits` fraction digits, in the form `format` names. */
function dateTime(format: string, digits: number): string {
  const fraction = digits === 0 ? '' : `.${DIGITS.slice(0, digits)}`;
  return `${DATE_TIME}${fraction}${format === 'date-time' ? 'Z' : ''}`;
}

function fractionProbes(
  format: string,
  digits: number,
): ReadonlyArray<MetaProbe> {
  return [
    {
      value: dateTime(format, digits),
      admitted: true,
      label: `${String(digits)} fraction digits`,
    },
    {
      value: dateTime(format, digits + 1),
      admitted: false,
      label: `${String(digits + 1)} fraction digits`,
    },
  ];
}

function hasBounds(limits: FieldLimits): boolean {
  return Object.values(limits).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== null,
  );
}

/** The probes of a value's stated facts, and how many it could not probe. */
function valueProbes(facts: ValueFacts): MemberProbes {
  if (facts.options !== null) {
    return { probes: optionProbes(facts.options), skipped: 0 };
  }
  const kind = NUMBER_KINDS[`${facts.wire}:${facts.format ?? ''}`];
  if (kind !== undefined) {
    return { probes: numberProbes(facts.limits, kind), skipped: 0 };
  }
  if (facts.fractionDigits !== null && facts.format !== null) {
    return {
      probes: fractionProbes(facts.format, facts.fractionDigits),
      skipped: 0,
    };
  }
  if (facts.wire === 'string' && facts.format === null) {
    const probes = textProbes(facts.limits);
    return {
      probes: probes.filter((probe) => probe !== undefined),
      skipped: probes.filter((probe) => probe === undefined).length,
    };
  }
  return {
    probes: FORM_PROBES[facts.format ?? facts.wire] ?? [],
    skipped: hasBounds(facts.limits) ? 1 : 0,
  };
}

/** The probes of a field: its value's, an array's elements one at a time, and `null`. */
export function fieldProbes(meta: FieldMeta): MemberProbes {
  const nullProbe = { value: null, admitted: meta.nullable, label: 'null' };
  if (meta.items === null) {
    const { probes, skipped } = valueProbes(meta);
    return { probes: [...probes, nullProbe], skipped };
  }
  const elements = valueProbes(meta.items);
  return {
    probes: [
      { value: [], admitted: true, label: 'no elements' },
      ...elements.probes.map(({ value, admitted, label }) => ({
        value: [value],
        admitted,
        label: `an element: ${label}`,
      })),
      nullProbe,
    ],
    skipped: elements.skipped,
  };
}

/** The probes of a relationship's id, which names a value of its key (resource SPEC 3.4). */
export function idProbes(meta: FieldMeta): MemberProbes {
  return valueProbes(meta);
}
