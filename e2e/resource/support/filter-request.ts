/**
 * Filter queries for the agreement of a declared resource's two
 * definitions (resource SPEC 11.2): `filter[name][op]` with sample values
 * of the member's keyset type in their text form, a list as a repeated
 * parameter (jsonapi SPEC 6.8), and the condition `parseQuery` reads from
 * it, which `keysetRequest` maps onto the keyset's request.
 */
import type { FilterCondition as ParsedCondition } from '@nizam-os/jsonapi-core';
import type { FieldInit, Operator } from '@nizam-os/keyset-core';

/** Two values of each keyset type in their text form, as a query string carries them. */
const SAMPLES: Readonly<Record<string, readonly [string, string]>> = {
  text: ['a%b_c', 'z'],
  integer: ['-7', '42'],
  bigint: ['9007199254740993', '9007199254740995'],
  decimal: ['12.50', '99.99'],
  float: ['1.5e3', '2.5e3'],
  boolean: ['true', 'false'],
  uuid: [
    '018f3a2b-7c4d-7e8f-9a0b-1c2d3e4f5a6b',
    '018F3A2B-7C4D-7E8F-9A0B-1C2D3E4F5A6C',
  ],
  date: ['2024-02-29', '2024-03-01'],
  time: ['12:30:00', '23:59:59.999999'],
  timestamp: ['2024-02-29 12:30:00.123456', '2024-03-01T00:00:00'],
  timestamptz: ['2024-02-29T12:30:00Z', '2024-03-01 00:00:00+02:00'],
};
const TEXT: readonly [string, string] = ['a%b_c', 'z'];
/** Operators whose keyset value is a list. */
const LISTS: ReadonlySet<string> = new Set(['in', 'nin', 'between']);

function samplesOf(field: FieldInit | undefined): readonly [string, string] {
  if (field === undefined) {
    return TEXT;
  }
  if (field.type === 'enum') {
    const [first = '', second = first] = field.values;
    return [first, second];
  }
  return SAMPLES['of' in field ? field.of : field.type] ?? TEXT;
}

function isList(field: FieldInit | undefined, op: string): boolean {
  return LISTS.has(op) || field?.type === 'array';
}

/** A `filter[name][op]` query string and the condition `parseQuery` reads from it. */
export interface FilterRequest {
  readonly query: string;
  readonly condition: ParsedCondition;
}

/** How `filterRequest` sends a condition. */
export interface FilterForm {
  /** `isNull=false`, and one value where a list takes one (not `between`); else `true` and two. */
  readonly single?: boolean | undefined;
  /** The `filter[or][n]` group to send it in; else a condition of its own. */
  readonly group?: number | undefined;
}

/** `filter[name][op]` with sample values: `true` for `isNull`, two values for a list. */
export function filterRequest(
  name: string,
  field: FieldInit | undefined,
  op: Operator,
  form: FilterForm = {},
): FilterRequest {
  const [low, high] = samplesOf(field);
  const single = form.single === true;
  const list = single && op !== 'between' ? [low] : [low, high];
  const flag = single ? 'false' : 'true';
  const values = op === 'isNull' ? [flag] : isList(field, op) ? list : [low];
  const parameter =
    form.group === undefined
      ? `filter[${name}][${op}]`
      : `filter[or][${String(form.group)}][${name}][${op}]`;
  const params = new URLSearchParams();
  for (const item of values) {
    params.append(parameter, item);
  }
  // One parameter is its value, a repeated one the list (jsonapi SPEC 6.8).
  const [only] = values;
  return {
    query: params.toString(),
    condition: {
      field: name,
      operator: op,
      value: values.length === 1 && only !== undefined ? only : values,
      parameter,
    },
  };
}
