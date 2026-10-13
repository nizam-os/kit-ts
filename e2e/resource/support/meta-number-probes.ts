/**
 * The probes of a numeric value from its field metadata alone (resource
 * SPEC 8): each stated bound and the value one step past it, a value off
 * the `multipleOf` grid, and free values admitted when they meet the
 * stated bounds, so a bound the metadata leaves out shows as a value the
 * database refuses. A step is one for an integer, `multipleOf` or a finer
 * unit for a decimal, and the adjacent double for a float, so a probe past
 * a bound lies past it by the least a client can send.
 */
import type { FieldLimits } from '@nizam-os/resource-core';

import type { MetaProbe } from './meta-probes.ts';

import {
  addDecimals,
  compareDecimals,
  finerStep,
  isMultiple,
  negateDecimal,
} from './decimal-text.ts';

/** How a numeric value is spelled: a JSON number, or decimal text (`int8`, `numeric`, and every id). */
export interface NumberKind {
  readonly family: 'integer' | 'decimal' | 'float';
  readonly text: boolean;
}

/** A probe before it is spelled: the value as decimal text. */
interface TextProbe {
  readonly text: string;
  readonly admitted: boolean;
  readonly label: string;
}

const BYTES = 8;
const FREE_INTEGERS: ReadonlyArray<string> = [
  '0',
  '1',
  '-1',
  '7',
  '-7',
  '100',
  '-100',
  '100000',
  '-100000',
];
const FREE_FRACTIONS: ReadonlyArray<string> = [
  '0.5',
  '-0.5',
  '0.25',
  '2.5',
  '-2.5',
  '99.99',
];

/** The double next to `value` toward `direction`. */
function adjacent(value: number, direction: 1 | -1): number {
  if (value === 0) {
    return direction * Number.MIN_VALUE;
  }
  const view = new DataView(new ArrayBuffer(BYTES));
  view.setFloat64(0, value);
  const away = value > 0 ? direction : -direction;
  view.setBigInt64(0, view.getBigInt64(0) + BigInt(away));
  return view.getFloat64(0);
}

function statedBounds(limits: FieldLimits): ReadonlyArray<string> {
  return [
    limits.minimum,
    limits.exclusiveMinimum,
    limits.maximum,
    limits.exclusiveMaximum,
  ].filter((bound) => bound !== null);
}

/** `bound` moved by one step toward `direction`, as decimal text. */
function stepped(
  bound: string,
  direction: 1 | -1,
  kind: NumberKind,
  limits: FieldLimits,
): string {
  if (kind.family === 'float') {
    return String(adjacent(Number(bound), direction));
  }
  const step =
    kind.family === 'integer'
      ? '1'
      : (limits.multipleOf ?? finerStep(statedBounds(limits)));
  return addDecimals(bound, direction === 1 ? step : negateDecimal(step));
}

/** The probes of one bound: at it and one step outside, or for an exclusive one, at it and one step inside. */
function boundProbes(
  name: string,
  bound: string,
  outward: 1 | -1,
  inclusive: boolean,
  context: { readonly kind: NumberKind; readonly limits: FieldLimits },
): ReadonlyArray<TextProbe> {
  const { kind, limits } = context;
  if (inclusive) {
    return [
      { text: bound, admitted: true, label: name },
      {
        text: stepped(bound, outward, kind, limits),
        admitted: false,
        label: `${name}, one step past`,
      },
    ];
  }
  return [
    { text: bound, admitted: false, label: name },
    {
      text: stepped(bound, outward === 1 ? -1 : 1, kind, limits),
      admitted: true,
      label: `${name}, one step inside`,
    },
  ];
}

/** Whether a value meets every stated bound and the `multipleOf` grid. */
function meets(text: string, limits: FieldLimits): boolean {
  const order = (bound: string | null, test: (comparison: number) => boolean) =>
    bound === null || test(compareDecimals(text, bound));
  return (
    order(limits.minimum, (comparison) => comparison >= 0) &&
    order(limits.exclusiveMinimum, (comparison) => comparison > 0) &&
    order(limits.maximum, (comparison) => comparison <= 0) &&
    order(limits.exclusiveMaximum, (comparison) => comparison < 0) &&
    (limits.multipleOf === null || isMultiple(text, limits.multipleOf))
  );
}

/** The free values of a kind, admitted when they meet the stated bounds. */
function freeProbes(
  limits: FieldLimits,
  kind: NumberKind,
): ReadonlyArray<TextProbe> {
  const values =
    kind.family === 'integer'
      ? FREE_INTEGERS
      : [...FREE_INTEGERS, ...FREE_FRACTIONS];
  return values.map((text) => ({
    text,
    admitted: meets(text, limits),
    label: 'a free value',
  }));
}

/** The probes of every stated bound, one off the `multipleOf` grid, and the free values. */
function textProbes(
  limits: FieldLimits,
  kind: NumberKind,
): ReadonlyArray<TextProbe> {
  const context = { kind, limits };
  const bounds: ReadonlyArray<
    readonly [string, string | null, 1 | -1, boolean]
  > = [
    ['minimum', limits.minimum, -1, true],
    ['exclusiveMinimum', limits.exclusiveMinimum, -1, false],
    ['maximum', limits.maximum, 1, true],
    ['exclusiveMaximum', limits.exclusiveMaximum, 1, false],
  ];
  const probes = bounds.flatMap(([name, bound, outward, inclusive]) =>
    bound === null
      ? []
      : boundProbes(`${name} ${bound}`, bound, outward, inclusive, context),
  );
  const free = freeProbes(limits, kind);
  const { multipleOf } = limits;
  if (multipleOf === null) {
    return [...probes, ...free];
  }
  const base = probes.find((probe) => probe.admitted)?.text ?? '0';
  const off = {
    text: addDecimals(base, finerStep([multipleOf])),
    admitted: false,
    label: `off the multipleOf ${multipleOf} grid`,
  };
  return [...probes, ...free, off];
}

/** The probes of a numeric value, spelled as its kind travels. */
export function numberProbes(
  limits: FieldLimits,
  kind: NumberKind,
): ReadonlyArray<MetaProbe> {
  return textProbes(limits, kind).map(({ text, admitted, label }) => ({
    value: kind.text ? text : Number(text),
    admitted,
    label,
  }));
}
