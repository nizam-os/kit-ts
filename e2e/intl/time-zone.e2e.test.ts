/**
 * The reader's time zone (SPEC 4, ADR 0005) through the built package: a
 * server entry that resolves each request's zone from its cookie inside a
 * request scope, the cookie the browser seeds, and the pin a browser
 * resolver keeps.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createIntl,
  createTimeZone,
  detectTimeZone,
  timeZoneCookie,
  timeZoneFromCookie,
} from '@nizam-os/intl-core';

const COOKIE = 'TIME_ZONE';
/** 2026-10-12 21:30 UTC: already 13 October in Riyadh, still 12 October in Los Angeles. */
const INSTANT = Date.UTC(2026, 9, 12, 21, 30);

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The server: one resolver and one set of formatters for every request. */
function server() {
  const timeZone = createTimeZone({ cookieName: COOKIE });
  timeZone.useScope(new AsyncLocalStorage<string>());
  const intl = createIntl({ locale: () => 'en', timeZone: timeZone.get });
  return async (request: Request): Promise<Response> =>
    timeZone.run(request, async () => {
      await Promise.resolve();
      return new Response(intl.date(INSTANT, { dateStyle: 'long' }));
    });
}

function requestWith(cookie?: string): Request {
  return new Request('https://app.example/orders', {
    headers: cookie === undefined ? {} : { cookie },
  });
}

describe('the reader time zone through the built package', () => {
  it('renders each request in the zone of its cookie, and UTC without one', async () => {
    const handle = server();
    const texts = await Promise.all(
      [
        requestWith('session=abc; TIME_ZONE=Asia/Riyadh'),
        requestWith('TIME_ZONE=America/Los_Angeles'),
        requestWith('TIME_ZONE=%2B03%3A00'),
        requestWith(),
      ].map(async (each) => (await handle(each)).text()),
    );
    expect(texts).toEqual([
      'October 13, 2026',
      'October 12, 2026',
      'October 12, 2026',
      'October 12, 2026',
    ]);
  });

  it('seeds a cookie that the next request carries back', async () => {
    const zone = detectTimeZone() ?? 'UTC';
    const setCookie = timeZoneCookie(zone, { name: COOKIE });
    const [pair = ''] = setCookie.split(';');
    expect(timeZoneFromCookie(pair, COOKIE)).toBe(zone);
    const response = await server()(requestWith(pair));
    expect(await response.text()).toBe(
      new Intl.DateTimeFormat('en', {
        dateStyle: 'long',
        timeZone: zone,
      }).format(INSTANT),
    );
  });

  it('pins the zone a browser document had when the resolver was created', () => {
    const document = { cookie: 'TIME_ZONE=Asia/Riyadh' };
    vi.stubGlobal('document', document);
    const timeZone = createTimeZone({ cookieName: COOKIE });
    const intl = createIntl({ locale: () => 'en', timeZone: timeZone.get });
    document.cookie = timeZoneCookie('America/Los_Angeles', { name: COOKIE });
    expect(intl.date(INSTANT, { dateStyle: 'long' })).toBe('October 13, 2026');
  });
});
