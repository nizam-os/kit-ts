/**
 * Hydration (SPEC 7.2, ADR 0003, ADR 0005): a page renders compiled messages,
 * a number, and a date on the server inside a request scope, then again in a
 * jsdom document. Both sides read the locale and the time zone from the same
 * cookies, so the browser replaces the server's text with the same text. Each
 * side loads its own copy of the compiled output, as its bundle would:
 * Paraglide's runtime decides when it loads whether it runs on a server.
 * @ref https://github.com/jsdom/jsdom#readme
 */
import type { IntlFormatters } from '@nizam-os/intl-core';

import type { Messages } from './support/project';

import { AsyncLocalStorage } from 'node:async_hooks';
import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { JSDOM } from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createIntl,
  createTimeZone,
  isolate,
  timeZoneCookie,
} from '@nizam-os/intl-core';
import { compile } from '@nizam-os/paraglide-intl';

import { CATALOGS } from './support/catalogs';
import { importMessages, message, writeProject } from './support/project';

const PAGE = 'https://app.example/orders';
const TIME_ZONE = 'TIME_ZONE';
const AR_TAG = 'ar-SA-u-ca-gregory-nu-latn';
/** 2026-10-12 21:30 UTC: already 13 October in Riyadh. */
const INSTANT = Date.UTC(2026, 9, 12, 21, 30);

interface Runtime {
  readonly getLocale: () => string;
}

interface Server {
  readonly paraglideMiddleware: (
    request: Request,
    resolve: () => Promise<Response>,
  ) => Promise<Response>;
}

type Page = (request: Request) => Promise<ReadonlyArray<string>>;

let outdir = '';
let copies = 0;

async function load<TModule>(dir: string, file: string): Promise<TModule> {
  return (await import(pathToFileURL(join(dir, file)).href)) as TModule;
}

/** What the application's components render, on either side. */
function render(m: Messages, intl: IntlFormatters): ReadonlyArray<string> {
  return [
    message(m, 'shared_by')({ name: 'محمد', count: intl.number(2) }),
    message(m, 'due')({ date: intl.date(INSTANT, { dateStyle: 'long' }) }),
    message(m, 'items')({ count: 11, countText: intl.number(11) }),
  ];
}

function formatters(runtime: Runtime, timeZone: () => string): IntlFormatters {
  return createIntl({
    locale: () => runtime.getLocale(),
    timeZone,
    formattingLocales: { ar: AR_TAG },
  });
}

/** The server entry: Paraglide's middleware, then the reader's zone, per request. */
async function serverPage(dir: string): Promise<Page> {
  const runtime = await load<Runtime>(dir, 'runtime.js');
  const { paraglideMiddleware } = await load<Server>(dir, 'server.js');
  const m = await importMessages(dir);
  const timeZone = createTimeZone({ cookieName: TIME_ZONE });
  timeZone.useScope(new AsyncLocalStorage<string>());
  const intl = formatters(runtime, timeZone.get);
  return async (request) => {
    const response = await paraglideMiddleware(request, async () =>
      timeZone.run(request, async () => {
        // A render awaits its data; both request scopes carry across.
        await Promise.resolve();
        return Response.json(render(m, intl));
      }),
    );
    return (await response.json()) as ReadonlyArray<string>;
  };
}

/** The browser bundle, loaded into the jsdom document as globals. */
async function browserPage(dom: JSDOM): Promise<ReadonlyArray<string>> {
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  copies += 1;
  const copy = `${outdir}-browser-${copies}`;
  await cp(outdir, copy, { recursive: true });
  const runtime = await load<Runtime>(copy, 'runtime.js');
  const m = await importMessages(copy);
  const timeZone = createTimeZone({ cookieName: TIME_ZONE });
  return render(m, formatters(runtime, timeZone.get));
}

/** A document of the page with `cookies` set, as earlier visits left them. */
function documentWith(cookies: ReadonlyArray<string>): JSDOM {
  const dom = new JSDOM('<!doctype html>', { url: PAGE });
  for (const cookie of cookies) {
    dom.window.document.cookie = cookie;
  }
  return dom;
}

beforeAll(async () => {
  const project = await writeProject(CATALOGS);
  outdir = project.outdir;
  await compile({
    project: project.project,
    outdir,
    strategy: ['cookie', 'baseLocale'],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a page rendered on the server and hydrated in the browser', () => {
  it('reads the same text on both sides from the same cookies', async () => {
    const dom = documentWith([
      'PARAGLIDE_LOCALE=ar; Path=/',
      timeZoneCookie('Asia/Riyadh', { name: TIME_ZONE }),
    ]);
    const cookie = dom.window.document.cookie;
    const server = await serverPage(outdir);
    const onServer = await server(new Request(PAGE, { headers: { cookie } }));
    expect(await browserPage(dom)).toEqual(onServer);
    const date = new Intl.DateTimeFormat(AR_TAG, {
      dateStyle: 'long',
      timeZone: 'Asia/Riyadh',
    }).format(INSTANT);
    expect(onServer).toEqual([
      `شاركه ${isolate('محمد')} (${isolate('2')})`,
      `الاستحقاق ${isolate(date)}`,
      `${isolate('11')} عنصرًا`,
    ]);
  });

  it('falls back to the base locale and UTC on both sides without them', async () => {
    const server = await serverPage(outdir);
    const onServer = await server(new Request(PAGE));
    expect(await browserPage(documentWith([]))).toEqual(onServer);
    expect(onServer).toEqual([
      `Shared by ${isolate('محمد')} (${isolate('2')})`,
      `Due ${isolate('October 12, 2026')}`,
      `${isolate('11')} items`,
    ]);
  });
});
