# intl: design

What the family is for, the problems it solves, and the shape of the solution. The contract is in
[`SPEC.md`](SPEC.md); each decision is an ADR in [`adr/`](adr).

## The problem

A server-rendered application that speaks Arabic and English formats numbers and dates, and builds
sentences around values its users typed. Each of these breaks without anyone writing a bug:

- **The same tag formats differently by engine.** `ar-SA` dates use the Gregorian calendar on Node
  24 and the Islamic one on Bun, Deno, and Node 18; `ar` numbers use Latin digits on Node 24 and
  Arabic-Indic digits on Node 18 (ADR 0004 has the table). A server and a browser on different
  engines render one value two ways, and hydration replaces the server's text with the browser's.
- **The zone differs between the render and the hydration.** Without a `timeZone`, a date is read in
  the runtime's zone: the server's during SSR, the device's afterwards. An instant near midnight is
  two different days (ADR 0005).
- **A locale read once is the wrong locale.** On a server the locale is per request; a formatter
  that captured it at import serves the first request's locale to everyone (ADR 0003).
- **Building `Intl` objects is slow.** About 44 µs to build an `Intl.DateTimeFormat`, 1 µs to reuse
  one: a table of a few hundred dates pays the difference hundreds of times (ADR 0003).
- **Inserted values reorder sentences.** An Arabic name in an English sentence pulls the number
  after it to its left; a Latin name in an Arabic sentence glues the number after it into its own
  run. The Unicode Bidirectional Algorithm's remedy is to isolate the value; Paraglide does not (ADR
  0006).
- **Messages format with the engine's defaults.** `{amount: number}` in an Arabic message prints
  Latin digits on Node 24 and Arabic-Indic digits on Node 18, and `{when: datetime}` reads the
  runtime's zone (ADR 0008).

And two failures that are silent in Paraglide but already caught upstream: a missing translation
renders the base locale's text, and a missing plural form renders the message's key. `inlang check`
reports both (ADR 0009), so the family documents it instead of repeating it.

## Goals

- Every formatted value is a function of the locale, the reader's zone, the formatting tag, and the
  options, whatever engine runs the code, on the server and in the browser alike.
- Every value a message interpolates keeps its own direction, in every locale, with no change at the
  call site.
- The application keeps owning its locales, its messages, and its negotiation: the family reads the
  locale through a getter (resource ADR 0009) and stores nothing per request.
- Spec-grounded: each rule cites ECMA-402, UAX #9, UTS #35, or RFC 6265, and each measured claim
  names the runtime and version.

## Non-goals

- Locale negotiation, message storage, and message compilation: Paraglide's.
- Catalog consistency: `inlang check` (ADR 0009).
- A bundler plugin. `compile()` runs from a build script, before the bundler (ADR 0007), and
  `watch()` from a dev server's hook or a script (ADR 0010).
- Parsing dates. A date string's meaning depends on its format; the caller turns it into a `Date`.

## Shape

**`@nizam-os/intl-core`** (web standards only, no dependencies):

- `createIntl({ locale, timeZone, formattingLocales })` returns formatters over ECMA-402's
  constructors. Each call reads the getters, takes an `Intl` object from a bounded cache built for
  the locale's formatting tag, and fills in the reader's zone for dates.
- `createTimeZone({ cookieName })` resolves the reader's zone: inside a request scope, from the
  request's cookie; in a browser, from the document's cookie, read once and pinned; else UTC. With
  `toTimeZone`, `timeZoneFromCookie`, `timeZoneCookie`, and `detectTimeZone`, an application stores
  the zone the way Paraglide stores the locale.
- `isolate(value)` for a string built outside a message.

**`@nizam-os/paraglide-intl`** (build time; re-exports the core):

- `compile(options)` is Paraglide's `compile()` with two steps added between loading the project and
  compiling it: refuse messages that format (ADR 0008), and wrap every interpolated value in FIRST
  STRONG ISOLATE and POP DIRECTIONAL ISOLATE (ADR 0006, ADR 0007).
- `watch(options)` compiles the same way, and again whenever a file that loading the project read
  changes, for development (ADR 0010).

## How an application wires it

```ts
// src/lib/intl.ts, shared by the server and the browser
import { createIntl, createTimeZone } from '@nizam-os/intl-core';

import { getLocale } from './paraglide/runtime.js';

export const timeZone = createTimeZone({ cookieName: 'TIME_ZONE' });
export const intl = createIntl({
  locale: getLocale,
  timeZone: timeZone.get,
  formattingLocales: { ar: 'ar-SA-u-ca-gregory-nu-latn', en: 'en-US' },
});
```

```ts
// the server entry
import { AsyncLocalStorage } from 'node:async_hooks';

import { timeZone } from './lib/intl';
import { paraglideMiddleware } from './lib/paraglide/server.js';

timeZone.useScope(new AsyncLocalStorage());
export default {
  fetch: (request: Request) =>
    paraglideMiddleware(request, ({ request }) =>
      timeZone.run(request, () => handler.fetch(request)),
    ),
};
```

```ts
// scripts/compile-messages.ts, run before the bundler
import { compile } from '@nizam-os/paraglide-intl';

await compile({ project: './project.inlang', outdir: './src/lib/paraglide' });
```

The browser seeds the cookie for the next load with `detectTimeZone()` and `timeZoneCookie()`; the
server sets it from a stored profile. A changed zone takes effect on the next load, as a changed
locale does with Paraglide's cookie strategy.

## Alternatives considered

- **FormatJS (`@formatjs/intl`).** Its `createIntl()` binds one locale and one zone per instance and
  brings ICU messages; an application on Paraglide would build one instance per locale and zone and
  still need the zone resolution and the formatting tags. The cache and the getters here are a
  smaller piece that fits Paraglide's model.
- **Rewriting Paraglide's emitted JavaScript.** Rejected for the pattern rewrite (ADR 0007): it
  couples to generated code.
- **Isolating only right-to-left locales.** Rejected (ADR 0006): a right-to-left value in an English
  sentence reorders it as much as the reverse, measured.
- **The device's zone after hydration.** Rejected (ADR 0005): the server cannot know it, so the
  first render and the hydration disagree.
- **Checking catalogs here.** Rejected (ADR 0009): `inlang check` does it from the SDK's own model.

## Later

- A relative-time ladder (the largest whole unit of an elapsed time, for "3 hours ago"), once two
  applications agree on its thresholds.
- `Temporal` values as inputs, once every supported runtime ships `Temporal`.
- Lint rules for message calls: a message called at module scope freezes the locale, and an aliased
  message namespace defeats tree shaking.
