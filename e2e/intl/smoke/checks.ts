/**
 * Runtime-neutral checks (SPEC 7.3) over the built core: the isolates, the
 * formatters on the runtime's own `Intl`, with the calendar and digits a
 * formatting tag names, the time zone checks of `time-zone-checks.ts`, and
 * the compiled messages of `message-checks.ts`.
 * No file system and no environment: the same module runs on Bun, Deno,
 * and workerd.
 */
import type { Check } from './assert.ts';

import {
  createIntl,
  FIRST_STRONG_ISOLATE,
  isolate,
  POP_DIRECTIONAL_ISOLATE,
} from '@nizam-os/intl-core';

import { check, equal } from './assert.ts';
import { MESSAGE_CHECKS } from './message-checks.ts';
import { TIME_ZONE_CHECKS } from './time-zone-checks.ts';

export interface SmokeResult {
  readonly runtime: string;
  readonly passed: number;
  readonly failures: ReadonlyArray<string>;
}

const AR_TAG = 'ar-SA-u-ca-gregory-nu-latn';
/** 2026-10-12 21:30 UTC: already 13 October in Riyadh (UTC+3). */
const INSTANT = Date.UTC(2026, 9, 12, 21, 30);

let locale = 'ar';
const intl = createIntl({
  locale: () => locale,
  timeZone: () => 'Asia/Riyadh',
  formattingLocales: { ar: AR_TAG },
});

/** Every decimal digit in `text` is an ASCII digit. */
function latinDigits(text: string): boolean {
  return (text.match(/\p{Nd}/gu) ?? []).every(
    (digit) => digit >= '0' && digit <= '9',
  );
}

const CHECKS: Readonly<Record<string, Check>> = {
  'isolates a value between U+2068 and U+2069': () => {
    equal(FIRST_STRONG_ISOLATE.codePointAt(0), 0x20_68, 'first strong isolate');
    equal(
      POP_DIRECTIONAL_ISOLATE.codePointAt(0),
      0x20_69,
      'pop directional isolate',
    );
    equal(isolate('محمد'), '\u2068محمد\u2069', 'isolated value');
  },
  'formats a date with the calendar, digits, and zone the reader has': () => {
    locale = 'ar';
    const text = intl.date(INSTANT, { dateStyle: 'long' });
    check(text.includes('2026'), `Gregorian year: ${text}`);
    check(text.includes('13'), `the day in Riyadh: ${text}`);
    check(latinDigits(text), `Latin digits: ${text}`);
  },
  'keeps every digit of numeric text': () => {
    locale = 'en';
    equal(
      intl.number('12345678901234567890.5', {
        maximumFractionDigits: 1,
        useGrouping: false,
      }),
      '12345678901234567890.5',
      'numeric text',
    );
  },
  'selects the plural categories of the formatting tag': () => {
    locale = 'ar';
    equal(
      [3, 11, 100].map((count) => intl.plural(count)).join(),
      'few,many,other',
      'Arabic plural categories',
    );
  },
  ...TIME_ZONE_CHECKS,
  ...MESSAGE_CHECKS,
};

export async function runChecks(runtime: string): Promise<SmokeResult> {
  const failures: Array<string> = [];
  let passed = 0;
  for (const [name, run] of Object.entries(CHECKS)) {
    try {
      await run();
      passed += 1;
    } catch (error) {
      failures.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { runtime, passed, failures };
}

/** Prints the outcome; throws on failure so the process exits non-zero everywhere. */
export function report(result: SmokeResult): void {
  const total = result.passed + result.failures.length;
  if (result.failures.length === 0) {
    console.log(
      `@nizam-os/intl smoke: ${total} checks passed on ${result.runtime}`,
    );
    return;
  }
  for (const failure of result.failures) {
    console.error(`FAIL ${failure}`);
  }
  throw new Error(
    `@nizam-os/intl smoke: ${result.failures.length} of ${total} checks failed on ${result.runtime}`,
  );
}
