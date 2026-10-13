/**
 * Formatters (SPEC 3, ADR 0003, ADR 0004) through the built package: a
 * formatting tag that names its calendar and digits, numeric text kept
 * digit for digit, and one set of formatters serving concurrent requests,
 * each in its own locale and zone, the way a server shares them.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { createIntl } from '@nizam-os/intl-core';

const AR_TAG = 'ar-SA-u-ca-gregory-nu-latn';
/** 2026-10-12 21:30 UTC: already 13 October in Riyadh (UTC+3). */
const INSTANT = Date.UTC(2026, 9, 12, 21, 30);

interface Reader {
  readonly locale: string;
  readonly zone: string;
}

const request = new AsyncLocalStorage<Reader>();
const intl = createIntl({
  locale: () => request.getStore()?.locale ?? 'en',
  timeZone: () => request.getStore()?.zone ?? 'UTC',
  formattingLocales: { ar: AR_TAG },
});

/** A request that formats, waits `delayMs` while another request runs, and formats again. */
async function render(reader: Reader, delayMs: number): Promise<Array<string>> {
  return request.run(reader, async () => {
    const before = intl.date(INSTANT, { day: 'numeric' });
    await sleep(delayMs);
    return [before, intl.date(INSTANT, { day: 'numeric' }), intl.plural(3)];
  });
}

/** Every decimal digit in `text`, by its Unicode category. */
function digits(text: string): Array<string> {
  return text.match(/\p{Nd}/gu) ?? [];
}

describe('formatters from the built package', () => {
  it('format Arabic with the Gregorian calendar and Latin digits the tag names', () => {
    const text = request.run({ locale: 'ar', zone: 'Asia/Riyadh' }, () =>
      intl.date(INSTANT, { dateStyle: 'long' }),
    );
    expect(text).toBe(
      new Intl.DateTimeFormat(AR_TAG, {
        dateStyle: 'long',
        timeZone: 'Asia/Riyadh',
      }).format(INSTANT),
    );
    expect(text).toContain('2026');
    expect(text).toContain('13');
    expect(digits(text).every((digit) => digit >= '0' && digit <= '9')).toBe(
      true,
    );
  });

  it('keep every digit of a PostgreSQL numeric read as text', () => {
    expect(
      intl.number('12345678901234567890.123456789', {
        maximumFractionDigits: 9,
      }),
    ).toBe('12,345,678,901,234,567,890.123456789');
  });

  it('serve concurrent requests, each in its own locale and zone', async () => {
    const [arabic, english] = await Promise.all([
      render({ locale: 'ar', zone: 'Asia/Riyadh' }, 20),
      render({ locale: 'en', zone: 'America/Los_Angeles' }, 5),
    ]);
    expect(arabic).toEqual(['13', '13', 'few']);
    expect(english).toEqual(['12', '12', 'other']);
  });
});
