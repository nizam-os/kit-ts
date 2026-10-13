/**
 * The driver oracle for the Kysely type tables (SPEC 9.2): values of every
 * alternative of an insert type, built from the type's text, and a check
 * that a value a driver returned has a select type. Sending the values
 * through the driver holds its table against the driver itself, and a
 * change to the table changes what is sent.
 */
import type { CatalogColumn } from '@nizam-os/catalog-core';

/** One value of each column type of `typesMigrations`, as PostgreSQL text, by the column's `type`. */
const TEXT: ReadonlyMap<string, string> = new Map([
  ['int2', '7'],
  ['int4', '7'],
  // Within ±(2^53 - 1), where PGlite returns a number; `tally` holds one beyond, a bigint.
  ['int8', '7'],
  ['float4', '1.5'],
  ['float8', '1.5'],
  ['numeric', '12.34'],
  ['oid', '7'],
  ['bool', 't'],
  ['date', '2026-01-02'],
  ['timestamp', '2026-01-02 03:04:05'],
  ['timestamptz', '2026-01-02 03:04:05+00'],
  ['interval', '1 day 02:00:00'],
  ['bytea', '\\x0102'],
  ['json', '{"a":[1,2]}'],
  ['jsonb', '{"a":[1,2]}'],
  ['point', '(1,2)'],
  ['circle', '<(1,2),3>'],
  ['text', 'hello'],
  ['varchar', 'code'],
  ['bpchar', 'x'],
  ['uuid', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
  ['inet', '10.0.0.1'],
  ['cidr', '10.0.0.0/8'],
  ['macaddr', '08:00:2b:01:02:03'],
  ['money', '12.50'],
  ['time', '10:00:00'],
  ['timetz', '10:00:00+02'],
  ['tsvector', 'a b'],
  ['regproc', 'now'],
  ['pair', '(1,x)'],
  ['int4range', '[1,3)'],
  ['int4multirange', '{[1,3)}'],
  ['numrange', '[1.5,2.5)'],
  ['mood', 'happy'],
  ['other.level', 'low'],
  ['other.score', '7'],
  ['positive_int', '7'],
  ['small_positive', '7'],
  ['int_list', '{7}'],
  ['required_text', 'r'],
  ['defaulted_text', 'd'],
  ['moment', '2026-01-02 03:04:05+00'],
  ['blob', '\\x0102'],
  ['document', '{"a":[1,2]}'],
  ['tally', '9007199254740993'],
  ['toggle', 't'],
]);
/** One element of each array domain, as PostgreSQL text. */
const ELEMENT_TEXT: ReadonlyMap<string, string> = new Map([['int_list', '7']]);
const ARRAY = /^Array<(.+)>$/u;
const SEPARATOR = ' | ';
const INTERVAL_METHODS = ['toPostgres', 'toISO', 'toISOString'];

/** What the oracle reads besides a type's text. */
export interface OracleContext {
  /** Each enum's labels, by its TypeScript name. */
  readonly labels: ReadonlyMap<string, ReadonlyArray<string>>;
  /** An interval node-postgres parsed, which it can send back; PGlite returns text. */
  readonly interval: unknown;
}

/** The members of a union type, splitting only outside `<...>`. */
function alternatives(type: string): ReadonlyArray<string> {
  const parts: Array<string> = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < type.length; index += 1) {
    const character = type.charAt(index);
    if (character === '<') {
      depth += 1;
    } else if (character === '>') {
      depth -= 1;
    } else if (depth === 0 && type.startsWith(SEPARATOR, index)) {
      parts.push(type.slice(start, index));
      start = index + SEPARATOR.length;
    }
  }
  return [...parts, type.slice(start)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJson(value: unknown): boolean {
  if (
    value === null ||
    ['string', 'number', 'boolean'].includes(typeof value)
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((element) => isJson(element));
  }
  return (
    isRecord(value) && Object.values(value).every((element) => isJson(element))
  );
}

function numbersAt(value: unknown, keys: ReadonlyArray<string>): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => typeof value[key] === 'number')
  );
}

/** postgres-interval's object: the fields present, all numbers, and its methods. */
function isInterval(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.values(value).every((field) => typeof field === 'number') &&
    INTERVAL_METHODS.every((method) => typeof value[method] === 'function')
  );
}

const CHECKS: ReadonlyMap<string, (value: unknown) => boolean> = new Map([
  ['number', (value: unknown) => typeof value === 'number'],
  ['string', (value: unknown) => typeof value === 'string'],
  ['boolean', (value: unknown) => typeof value === 'boolean'],
  [
    'Date',
    (value: unknown) => value instanceof Date && !Number.isNaN(value.getTime()),
  ],
  ['bigint', (value: unknown) => typeof value === 'bigint'],
  ['Buffer', (value: unknown) => Buffer.isBuffer(value)],
  ['Uint8Array', (value: unknown) => value instanceof Uint8Array],
  ['JsonValue', isJson],
  ['PostgresInterval', isInterval],
  ['Point', (value: unknown) => numbersAt(value, ['x', 'y'])],
  ['Circle', (value: unknown) => numbersAt(value, ['x', 'y', 'radius'])],
  ['unknown', () => true],
]);

/** Whether a value a driver returned has the TypeScript type `type`. */
export function satisfies(
  value: unknown,
  type: string,
  context: OracleContext,
): boolean {
  const options = alternatives(type);
  if (options.length > 1) {
    return options.some((option) => satisfies(value, option, context));
  }
  const element = ARRAY.exec(type)?.[1];
  if (element !== undefined) {
    return (
      Array.isArray(value) &&
      value.every((item) => satisfies(item, element, context))
    );
  }
  const labels = context.labels.get(type);
  if (labels !== undefined) {
    return typeof value === 'string' && labels.includes(value);
  }
  const check = CHECKS.get(type);
  if (check === undefined) {
    throw new Error(`the oracle cannot check the type ${type}`);
  }
  return check(value);
}

function textOf(type: string, texts: ReadonlyMap<string, string>): string {
  const text = texts.get(type);
  if (text === undefined) {
    throw new Error(`the oracle has no text of the type ${type}`);
  }
  return text;
}

/** PostgreSQL's array text holding one element. */
function arrayText(element: string): string {
  return `{"${element.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"}`;
}

/** Values of one alternative; `text` gives the PostgreSQL text of a value when the alternative needs it. */
function valuesOf(
  type: string,
  text: () => string,
  context: OracleContext,
): ReadonlyArray<unknown> {
  const labels = context.labels.get(type);
  if (labels !== undefined) {
    return labels.slice(0, 1);
  }
  const values: Readonly<Record<string, () => ReadonlyArray<unknown>>> = {
    number: () => [Number(text())],
    bigint: () => [BigInt(text())],
    string: () => [text()],
    boolean: () => [true],
    Date: () => [new Date('2026-01-02T03:04:05Z')],
    Buffer: () => [Buffer.from([1, 2])],
    Uint8Array: () => [Uint8Array.from([1, 2])],
    PostgresInterval: () => [context.interval],
    // The members node-postgres cannot send as what they are.
    JsonValue: () => [{ a: [1, 2] }, [1, 2], 'plain'],
    // A member of each kind PGlite sends with JSON.stringify, and JSON text.
    JsonParameter: () => [{ a: [1, 2] }, [1, 2], 1.5, true, text()],
    Point: () => [{ x: 1, y: 2 }],
    Circle: () => [{ x: 1, y: 2, radius: 3 }],
    unknown: () => [],
  };
  const make = values[type];
  if (make === undefined) {
    throw new Error(`the oracle has no value of the type ${type}`);
  }
  return make();
}

/**
 * One value of each alternative of `type` (and of each element alternative
 * of an `Array<...>`) for the column `column` of `typesMigrations`.
 */
export function samples(
  type: string,
  column: Pick<CatalogColumn, 'type' | 'array'>,
  context: OracleContext,
): ReadonlyArray<unknown> {
  const element = (): string =>
    textOf(column.type, column.array ? TEXT : ELEMENT_TEXT);
  const text = (): string =>
    column.array ? arrayText(element()) : textOf(column.type, TEXT);
  return alternatives(type).flatMap((option) => {
    const inner = ARRAY.exec(option)?.[1];
    if (inner === undefined) {
      return valuesOf(option, text, context);
    }
    return alternatives(inner).flatMap((item) =>
      valuesOf(item, element, context).map((value) => [value]),
    );
  });
}
