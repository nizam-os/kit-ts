/** Expected rules for the recognizer tests, written the way SPEC 2.9 states them. */
import type { RangeBound, Rule } from '@nizam-os/catalog-core';

export function length(min: number | null, max: number | null): Rule {
  return { kind: 'length', min, max };
}

export function range(min: RangeBound | null, max: RangeBound | null): Rule {
  return { kind: 'range', min, max };
}

export function incl(value: string): RangeBound {
  return { value, inclusive: true };
}

export function excl(value: string): RangeBound {
  return { value, inclusive: false };
}

export function members(...values: Array<string>): Rule {
  return { kind: 'enum', values };
}

export function pattern(source: string): Rule {
  return { kind: 'pattern', source, flags: 'su' };
}

export const NOT_NULL: Rule = { kind: 'notNull' };
