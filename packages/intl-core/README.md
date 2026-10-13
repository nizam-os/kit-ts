# @nizam-os/intl-core

Hydration-safe formatting for any JavaScript runtime, built for server-rendered applications that
localize with [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) and usable
without it. Every rule is a cited clause of Unicode, ECMA-402, or an RFC; where a choice is the
library's, it is written down in
[`docs/intl/SPEC.md`](https://github.com/nizam-os/kit-ts/blob/main/docs/intl/SPEC.md), and the
decisions, with their measurements, in
[`docs/intl/adr`](https://github.com/nizam-os/kit-ts/tree/main/docs/intl/adr).

Compiling Paraglide messages?
[`@nizam-os/paraglide-intl`](https://www.npmjs.com/package/@nizam-os/paraglide-intl) wraps every
interpolated value of every message in the isolates below when it compiles them, and re-exports all
of this package.

## Install

```bash
pnpm add @nizam-os/intl-core
```

No dependencies. Node 22.12+, Bun, Deno, Cloudflare Workers, and browsers are supported; the package
uses web standards only and never reads the environment.

## Format dates, numbers, and the rest

```ts
// src/lib/intl.ts: created once, at module scope, shared by the server and the browser
import { createIntl, createTimeZone } from '@nizam-os/intl-core';

import { getLocale } from './paraglide/runtime.js';

export const timeZone = createTimeZone({ cookieName: 'TIME_ZONE' }); // below
export const intl = createIntl({
  locale: getLocale,
  timeZone: timeZone.get,
  formattingLocales: { ar: 'ar-SA-u-ca-gregory-nu-latn', en: 'en-US' },
});
```

```ts
intl.date(order.placedAt, { dateStyle: 'medium', timeStyle: 'short' }); // in the reader's zone
intl.dateRange(trip.start, trip.end, { dateStyle: 'medium' });
intl.number(order.total, { style: 'currency', currency: 'SAR' });
intl.number(row.amount); // a PostgreSQL numeric read as text keeps every digit
intl.relativeTime(-1, 'day', { numeric: 'auto' }); // "yesterday"
intl.list(names, { type: 'conjunction' });
intl.displayName('SA', { type: 'region' });
intl.plural(count); // 'one', 'few', 'many', ...
rows.toSorted((a, b) => intl.compare(a.name, b.name));
```

Each formatter reads `locale()` on every call, and a date formatter reads `timeZone()` too unless
its options name a zone, so one set of formatters serves every request on a server and the whole
document in a browser. A formatter that read the locale once would keep whichever request loaded it
first. Each call takes its `Intl` object from a cache of the 256 most recently used ones
(`cacheSize`), keyed by the constructor, the formatting tag, and the options: building an
`Intl.DateTimeFormat` costs about 44 µs, reusing one about 1 µs. `Intl`'s own errors propagate
unchanged.

### Formatting tags

An application's locales are short codes, and engines disagree on what a code formats with: `ar-SA`
formats with the Gregorian calendar on Node 24 and with the Islamic calendar on Bun 1.4, Deno 2.1,
and Node 18, and `Intl.NumberFormat('ar')` writes Arabic-Indic digits on Node 18 only. A server and
a browser on different engines then render one date two ways, and hydration replaces the server's
text with the browser's. `formattingLocales` maps each locale to the BCP 47 tag it formats with, and
the Unicode extension keys `ca` (calendar) and `nu` (numbering system) pin both
([UTS #35](https://www.unicode.org/reports/tr35/#Key_Type_Definitions)). Each tag is canonicalized
when `createIntl()` runs, and a malformed one throws there. A locale the map omits formats as
itself.

### Best practices

- **Create the formatters once, at module scope**, and import them where you render. They keep no
  locale and no zone, only the cache.
- **Name the calendar and the digits** in every formatting tag whose defaults differ between
  engines: `ar-SA-u-ca-gregory-nu-latn`, not `ar-SA`. Other CLDR data can still differ between
  engine versions (Bun 1.4 writes a comma between an Arabic month and year, Node 24 does not), so
  text that must match byte for byte is formatted on the server and sent as a string.
- **Call the formatters where they render**, never at module scope: a value formatted at import
  keeps the first request's locale.
- **Pass a `Date` or a time value**, never a string: parse the string where you know its format.
- **Pass PostgreSQL `numeric` and `int8` text as it is**: `intl.number(row.amount)` keeps every
  digit, where `Number(row.amount)` can lose digits beyond 15 significant ones. A string that is not
  numeric formats as NaN, as `Intl` does.
- **Name a zone only for a place**, such as a store's opening hours in the store's zone
  (`{ timeZone: store.timeZone }`); everything about the reader uses the reader's zone.
- **Keep option values plain**: strings, numbers, and booleans. An options object that holds
  anything else builds a new `Intl` object on every call.
- **Wrap a formatter you pass to `map`**: `values.map(intl.number)` would hand each index over as
  the options; TypeScript refuses it, so write `values.map((value) => intl.number(value))`.

## The reader's time zone

During SSR the server sees the request, not the device, so the reader's zone comes from a cookie
that both sides read before they render
([ADR 0005](https://github.com/nizam-os/kit-ts/blob/main/docs/intl/adr/0005-the-readers-time-zone-comes-from-a-cookie.md)).

```ts
// the server entry: each request formats in the zone of its cookie
import { AsyncLocalStorage } from 'node:async_hooks';

import { timeZone } from './lib/intl';

timeZone.useScope(new AsyncLocalStorage());
export default {
  fetch: (request: Request) => timeZone.run(request, () => handler.fetch(request)),
};
```

```ts
// the browser, after hydration: store the device's zone for the requests that follow
import { detectTimeZone, timeZoneCookie, timeZoneFromCookie } from '@nizam-os/intl-core';

if (timeZoneFromCookie(document.cookie, 'TIME_ZONE') === undefined) {
  document.cookie = timeZoneCookie(detectTimeZone() ?? 'UTC', { name: 'TIME_ZONE' });
}
```

On a server, `timeZone.run(request, callback)` makes the zone in the request's cookie the active one
for everything `callback` runs and awaits, and `timeZone.get()` returns it.
`timeZone.fromRequest(request)` returns it without a scope. In a browser, `timeZone.get()` returns
the zone the document's cookie held when `createTimeZone()` ran and keeps it for the document's
life, so a later write never changes text that is already rendered. Without the cookie, or with a
value that is not a time zone, both sides use the fallback: `UTC`, unless `fallback` names another.
A new reader's first document renders in the fallback, and every document loaded after the cookie is
written in their zone.

`timeZoneCookie(zone, { name })` returns the cookie as `document.cookie` and `Set-Cookie` take it:
`TIME_ZONE=Asia/Riyadh; Path=/; Max-Age=34560000` by default, the attributes of Paraglide's locale
cookie, so both cookies live and expire together. `path`, `maxAge`, `domain`, `sameSite`, and
`secure` add to it, and a cookie that user agents would drop throws instead
([RFC 6265bis-22, 5.7](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.7)):
`sameSite: 'None'` or a `__Secure-` or `__Host-` name without `secure`, or a `__Host-` name with a
`domain` or another path. `toTimeZone(value)` returns the trimmed value when the runtime knows it as
an IANA time zone, and `undefined` for anything else, offsets such as `+03:00` included: an offset
ignores daylight saving time, and engines disagree on the ones they accept. `detectTimeZone()`
returns the device's zone, or `undefined` when the engine reports an offset instead.

### Best practices

- **Write the cookie after hydration**, never from a script that runs before the module that calls
  `createTimeZone()`: that document would render in the new zone, the server's HTML in the fallback,
  and hydration would replace the server's text.
- **Set the cookie from the profile on sign-in** for readers who choose their zone: append
  `timeZoneCookie(user.timeZone, { name: 'TIME_ZONE' })` as a `Set-Cookie` header of the response.
- **Reload after the reader changes their zone**, as Paraglide's `setLocale` reloads after a
  language change: the open document keeps the zone it was created with.
- **Format where the text renders.** A server function that a client navigation calls reads the
  cookie as it is now, which can differ from the zone the open document keeps.
- **Pass `secure: true` on an HTTPS origin**, and keep the cookie readable by scripts: the browser
  reads it through `document.cookie`, so it is never `HttpOnly`. It holds a zone name, nothing
  secret.
- **Check a zone you accept** with `toTimeZone` before you store it.
- **Enable `nodejs_als` on Cloudflare Workers** (or `nodejs_compat`) for `node:async_hooks`;
  compatibility dates from 2026-08-04 enable Node.js compatibility by default
  ([Workers docs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/)).
  Bun and Deno provide `node:async_hooks` as they are.

## Isolate an interpolated value

```ts
import { isolate } from '@nizam-os/intl-core';

const title = `Shared by ${isolate(owner.name)} (${isolate(String(count))})`;
```

A value inserted into a sentence takes part in the sentence's bidirectional layout. In
`Shared by محمد (2)`, the `(2)` displays before the Arabic name, because the digits take their
direction from the strong character before them
([UAX #9, W2 and W7](https://www.unicode.org/reports/tr9/#W2)). `isolate(value)` returns the value
between U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE: outside, the value counts as
one neutral character; inside, it takes the direction of its own first strong character
([UAX #9, 2.4](https://www.unicode.org/reports/tr9/#Explicit_Directional_Isolates)). The name then
displays in place in both directions, the way a `<bdi>` element displays it in markup.

Every string is wrapped, the empty string and an already isolated one included, in every locale: a
value's direction is the data's, not the locale's. The constants `FIRST_STRONG_ISOLATE` and
`POP_DIRECTIONAL_ISOLATE` are the two characters.

### Best practices

- **Isolate every value whose direction you do not control** in text that is not markup: a `title`
  or `aria-label` attribute, `document.title`, a notification, an email subject, an `<option>`. In
  markup, `<bdi>` does the same
  ([W3C, How to use Unicode controls for bidi text](https://www.w3.org/International/questions/qa-bidi-unicode-controls)).
- **Isolate numbers next to names too**: inside an isolate, digits resolve on their own.
- **Remove bidi controls from names and other text you accept from users**, where you accept it:
  `value.replace(/\p{Bidi_Control}/gu, '')`. `isolate` never rewrites a value, and a value that
  carries its own unmatched U+2069 closes the isolate early, after which an override reverses the
  rest of the sentence ([UAX #9, BD9](https://www.unicode.org/reports/tr9/#BD9); measured in ADR
  0006).
- **Never isolate a value that is not displayed as text**: a URL, an `href`, an identifier, a key.
  The isolates are characters and travel with the string.
- **Expect the isolates in tests** that compare a sentence with a value: `isolate(name)`, or
  `'\u2068'` and `'\u2069'` around it. Text copied from the page carries them too, so strip U+2066
  to U+2069 from text a user pastes into a search field.

## License

MIT
