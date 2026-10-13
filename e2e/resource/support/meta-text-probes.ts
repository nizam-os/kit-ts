/**
 * The probes of a text value from its field metadata alone (resource SPEC
 * 8): strings at each stated length and one code point past it, and a
 * string that misses a stated pattern. A probe repeats one character, the
 * first of `FILLERS` whose repetition the stated patterns accept or, for a
 * probe that must miss one, reject; each pattern is read with the flags
 * `su` (catalog SPEC 8.4). The patterns' probes take the first length the
 * stated lengths allow at which a filler meets them, so `^[0-9]{14}$` is
 * probed at 14 code points.
 */
import type { FieldLimits } from '@nizam-os/resource-core';

import type { MetaProbe } from './meta-probes.ts';

const FILLERS: ReadonlyArray<string> = ['a', 'A', 'x', 'Z', '0', '7', '-', '_'];
/** The length of a probe when no length is stated. */
const PLAIN_LENGTH = 3;
/** Lengths probed whatever the metadata states, admitted when they meet it: a rule it leaves out shows as a value the database refuses. */
const FREE_LENGTHS: ReadonlyArray<number> = [0, 1, 3, 12];
/** The longest length searched for a string the patterns accept. */
const LONGEST_SEARCHED = 64;

function matchesAll(limits: FieldLimits, text: string): boolean {
  return limits.patterns.every((source) => new RegExp(source, 'su').test(text));
}

/** A string of `length` code points that the patterns accept (`fit`) or reject; `undefined` when no filler does. */
function filled(
  limits: FieldLimits,
  length: number,
  fit: boolean,
): string | undefined {
  return FILLERS.map((filler) => filler.repeat(length)).find(
    (text) => matchesAll(limits, text) === fit,
  );
}

/** One probe of `length`, or `undefined` when the patterns rule out every filler. */
function lengthProbe(
  limits: FieldLimits,
  length: number,
  admitted: boolean,
  label: string,
): MetaProbe | undefined {
  const value = filled(limits, length, true);
  return value === undefined ? undefined : { value, admitted, label };
}

/** `preferred`, else the first length the stated lengths allow at which a filler meets the patterns. */
function patternLength(limits: FieldLimits, preferred: number): number {
  const lowest = limits.minLength ?? 0;
  const highest = Math.min(
    limits.maxLength ?? LONGEST_SEARCHED,
    LONGEST_SEARCHED,
  );
  const lengths = Array.from(
    { length: Math.max(0, highest - lowest + 1) },
    (_unused, index) => lowest + index,
  );
  return (
    [preferred, ...lengths].find(
      (length) => filled(limits, length, true) !== undefined,
    ) ?? preferred
  );
}

/** Whether a string meets the stated lengths and patterns. */
function meets(limits: FieldLimits, text: string): boolean {
  const length = Array.from(text).length;
  return (
    (limits.minLength === null || length >= limits.minLength) &&
    (limits.maxLength === null || length <= limits.maxLength) &&
    matchesAll(limits, text)
  );
}

/** Every filler at each free length, admitted when it meets the stated rules. */
function freeProbes(limits: FieldLimits): ReadonlyArray<MetaProbe> {
  return FREE_LENGTHS.flatMap((length) =>
    FILLERS.map((filler) => {
      const value = filler.repeat(length);
      return { value, admitted: meets(limits, value), label: 'a free value' };
    }),
  );
}

/** The probes of every stated length and pattern; a stated fact no filler can probe yields `undefined`. */
export function textProbes(
  limits: FieldLimits,
): ReadonlyArray<MetaProbe | undefined> {
  const { minLength, maxLength } = limits;
  const probes: Array<MetaProbe | undefined> = [];
  if (minLength !== null) {
    probes.push(
      lengthProbe(limits, minLength, true, `minLength ${String(minLength)}`),
    );
    if (minLength > 0) {
      probes.push(
        lengthProbe(
          limits,
          minLength - 1,
          false,
          `minLength ${String(minLength)}, one short`,
        ),
      );
    }
  }
  if (maxLength !== null) {
    probes.push(
      lengthProbe(limits, maxLength, true, `maxLength ${String(maxLength)}`),
      lengthProbe(
        limits,
        maxLength + 1,
        false,
        `maxLength ${String(maxLength)}, one over`,
      ),
    );
  }
  if (limits.patterns.length > 0) {
    const length = patternLength(
      limits,
      Math.max(
        minLength ?? 1,
        Math.min(maxLength ?? PLAIN_LENGTH, PLAIN_LENGTH),
      ),
    );
    const miss = filled(limits, length, false);
    probes.push(
      lengthProbe(limits, length, true, 'every pattern'),
      miss === undefined
        ? undefined
        : { value: miss, admitted: false, label: 'a pattern missed' },
    );
  }
  return [...probes, ...freeProbes(limits)];
}
