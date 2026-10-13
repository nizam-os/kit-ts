/**
 * Time zone checks (SPEC 4) on the runtime's own `Intl`, `Request`, and
 * `AsyncLocalStorage`: the names the runtime accepts, a server entry that
 * resolves each request's zone in a request scope across an await, and
 * the `Set-Cookie` value the browser stores. Workers provide
 * `AsyncLocalStorage` with the `nodejs_als` compatibility flag
 * (`workerd.ts` sets it).
 * @ref https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/
 */
import type { Check } from './assert.ts';

import { AsyncLocalStorage } from 'node:async_hooks';

import {
  createIntl,
  createTimeZone,
  timeZoneCookie,
  toTimeZone,
} from '@nizam-os/intl-core';

import { equal } from './assert.ts';

const COOKIE = 'TIME_ZONE';
/** 2026-10-12 21:30 UTC: already 13 October in Riyadh, still 12 October in Los Angeles. */
const INSTANT = Date.UTC(2026, 9, 12, 21, 30);
const MINUS_SIGN = String.fromCodePoint(0x22_12);

const timeZone = createTimeZone({ cookieName: COOKIE });
timeZone.useScope(new AsyncLocalStorage<string>());
const intl = createIntl({ locale: () => 'en', timeZone: timeZone.get });

/** A request that formats the day after its handler has yielded to the others. */
async function render(cookie: string): Promise<string> {
  const request = new Request('https://app.example/', { headers: { cookie } });
  return timeZone.run(request, async () => {
    await Promise.resolve();
    return intl.date(INSTANT, { day: 'numeric' });
  });
}

export const TIME_ZONE_CHECKS: Readonly<Record<string, Check>> = {
  'accepts IANA names and refuses offsets': () => {
    equal(toTimeZone('Asia/Riyadh'), 'Asia/Riyadh', 'an IANA name');
    equal(toTimeZone(' UTC '), 'UTC', 'a padded name');
    equal(toTimeZone('+03:00'), undefined, 'an offset');
    equal(toTimeZone(`${MINUS_SIGN}03:00`), undefined, 'an offset with U+2212');
    equal(toTimeZone('Mars/Olympus_Mons'), undefined, 'an unknown name');
  },
  'resolves each request zone from its cookie across an await': async () => {
    const days = await Promise.all(
      [
        'TIME_ZONE=Asia/Riyadh',
        'session=1; TIME_ZONE=America%2FLos_Angeles',
        'TIME_ZONE=%2B03%3A00',
      ].map(async (cookie) => render(cookie)),
    );
    equal(days.join(), '13,12,12', 'the day in each request zone');
    equal(timeZone.get(), 'UTC', 'the zone outside a request');
  },
  'writes the zone as a cookie a user agent keeps': () => {
    equal(
      timeZoneCookie('Asia/Riyadh', { name: COOKIE }),
      'TIME_ZONE=Asia/Riyadh; Path=/; Max-Age=34560000',
      'Set-Cookie value',
    );
  },
};
