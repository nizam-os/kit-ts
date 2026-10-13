/**
 * Request text no error detail may quote (ADR 0016), and the checks each
 * parser's sweep makes with it. Every case also runs with a plain token
 * that reaches the same refusal, whose detail quotes it, so a sweep proves
 * it reached the detail that quotes rather than an earlier refusal. Not
 * published.
 */
import type { ErrorObject } from '../document/types';

import { expect } from 'vitest';

import { isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';

/** A plain token: a detail that quotes request text quotes this. */
export const TOKEN = 'nope';

/** Hostile text that is not a member name, for the parsers that take any text. */
export const HOSTILE_TEXT: ReadonlyArray<readonly [string, string]> = [
  ['quotes', '"quoted" text'],
  ['markup', '<img src=x onerror=alert(1)>'],
  ['CRLF', 'line\r\nInjected: yes'],
  ['C0 controls', '\u0000\u001B[2J'],
  ['URL', 'https://evil.example/support'],
  ['10 kB of text', 'a!'.repeat(5120)],
];

/**
 * Hostile text that is still a member name, which allows a space inside
 * and every code point from U+0080 up, so it passes the grammar and reaches
 * the parsers that look a name up.
 * @ref https://jsonapi.org/format/1.1/#document-member-names-allowed-characters
 */
export const HOSTILE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['bidi override', 'evil\u202Etxt.exe'],
  ['line separator', 'line\u2028INFO login ok'],
  ['C1 control', 'next\u0085line'],
  ['inner space', 'two words'],
  ['10 kB name', 'n'.repeat(10_240)],
];

export const HOSTILE: ReadonlyArray<readonly [string, string]> = [
  ...HOSTILE_TEXT,
  ...HOSTILE_NAMES,
];

/**
 * Short printable ASCII without angle brackets: no control, line break, or
 * bidi character, no markup, and no flood.
 */
const SHORT_PRINTABLE = /^[\u0020-\u003B\u003D\u003F-\u007E]{1,200}$/u;

/** The error objects `run` fails with; a run that succeeds fails the test. */
export async function errorsOf(
  run: () => unknown,
): Promise<ReadonlyArray<ErrorObject>> {
  try {
    await run();
  } catch (error) {
    if (isBanError(error)) {
      return errorObjects(error);
    }
    throw error;
  }
  throw new Error('expected a BanError');
}

/**
 * The one error object of a request carrying the plain token `token`;
 * with `quoted`, its detail quotes the token, alone or in a parameter name.
 */
export function expectControl(
  objects: ReadonlyArray<ErrorObject>,
  token: string,
  quoted: boolean,
): ErrorObject {
  expect(objects).toHaveLength(1);
  const [object = {}] = objects;
  if (quoted) {
    expect(object.detail).toMatch(new RegExp(`"[^"]*${token}[^"]*"`, 'u'));
  }
  return object;
}

/**
 * The same problem as `control`, the request carrying `value` instead, in
 * a detail that is short printable ASCII without markup and quotes none of
 * `value`.
 */
export function expectWithheld(
  objects: ReadonlyArray<ErrorObject>,
  control: ErrorObject,
  value: string,
): void {
  expect(objects.map(({ status, code }) => ({ status, code }))).toEqual([
    { status: control.status, code: control.code },
  ]);
  for (const { detail } of objects) {
    expect(detail).toMatch(SHORT_PRINTABLE);
    expect(detail).not.toContain(value);
  }
}
