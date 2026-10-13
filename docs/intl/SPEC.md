# intl: implementation specification

- Status: normative for the 0.x line of `@nizam-os/intl-core` and `@nizam-os/paraglide-intl`;
  `docs/intl/DESIGN.md` explains the why

The key words MUST, MUST NOT, SHOULD, and MAY are used as in RFC 2119. Every section names the
source file that implements it and the decision records behind it. When this document and the code
disagree, fix one of them in the same pull request. "ECMA-402" is the
[ECMAScript Internationalization API](https://tc39.es/ecma402/) draft of 2026-10-12; "UAX #9" is the
[Unicode Bidirectional Algorithm](https://www.unicode.org/reports/tr9/), revision 52 (Unicode 18.0).

Contents

1. Public surface and module map
2. Isolation
3. Formatters
4. Time zones
5. Errors
6. Paraglide binding (`@nizam-os/paraglide-intl`)
7. Test plan
8. Packaging and support
9. Constants

---

## 1. Public surface and module map

Two packages (ADR 0002). `@nizam-os/intl-core` is the core: web standards only, no dependencies,
nothing imported from Paraglide or the inlang SDK. `@nizam-os/paraglide-intl` is the Paraglide
binding: it depends on the core through `workspace:^`, re-exports all of it, and adds `compile()`
and `watch()`. `@inlang/paraglide-js` is its peer dependency, and it loads projects with the inlang
SDK that Paraglide itself depends on (root ADR 0009).

| Package                   | Exports                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nizam-os/intl-core`      | Values: `isolate`, `createIntl`, `toTimeZone`, `detectTimeZone`, `timeZoneFromCookie`, `timeZoneCookie`, `createTimeZone`, and the constants `FIRST_STRONG_ISOLATE`, `POP_DIRECTIONAL_ISOLATE`, `DEFAULT_CACHE_SIZE`, `DEFAULT_TIME_ZONE`, `TIME_ZONE_COOKIE_MAX_AGE`. Types: `IntlOptions`, `IntlFormatters`, `DateInput`, `NumberInput`, `TimeZoneCookieOptions`, `TimeZoneOptions`, `TimeZoneResolver`, `RequestScope` |
| `@nizam-os/paraglide-intl` | Everything of `@nizam-os/intl-core` (the same bindings), plus `compile`, `watch`, and `MessageFormattingError`; and the types `CompileOptions`, `CompileResult`, `FormattingFinding`, `WatchOptions`, `Watcher`                                                                                                                                                                                                            |

`e2e/intl/package-surface.e2e.test.ts` asserts the exact value export list of both built packages
and that the binding's re-exports are the core's own bindings.

```
packages/intl-core/src/
  index.ts                    the public surface (re-exports only)
  isolate.ts                  isolate and the two isolate characters (section 2)
  intl/
    create-intl.ts            createIntl and the formatters (section 3)
    formatting-locales.ts     the formatting tag of a locale (3.2)
    intl-cache.ts             the bounded cache of Intl objects (3.4)
  internal/
    is-record.ts              the options-object check
  time-zone/
    to-time-zone.ts           toTimeZone, detectTimeZone (4.1, 4.2)
    cookie.ts                 timeZoneFromCookie, timeZoneCookie (4.3)
    create-time-zone.ts       createTimeZone (4.4)
packages/paraglide-intl/src/
  index.ts                    the public surface
  compile.ts                  compile (6.1)
  compile-options.ts          the options and their checks (6.1)
  paraglide-sdk.ts            the inlang SDK that Paraglide depends on (6.1)
  bundle.ts                   the bundle shape the binding reads, and its checks (6.1)
  isolate-patterns.ts         the pattern rewrite (6.2)
  formatting-annotations.ts   the annotations a message formats with (6.3)
  escape-bidi-controls.ts     the bidi controls of the compiled code as escapes (6.4)
  watch.ts                    watch (6.5)
  tracked-fs.ts               the file system that records what a load reads (6.5)
  directory-watchers.ts       the watchers of the directories a load read (6.5)
  output-hashes.ts            the hashes of the files in an output directory (6.5)
  internal/
    is-record.ts              the options-object check
```

Every module with behavior has a sibling `*.test.ts`; contract types have `*.test-d.ts`.

## 2. Isolation (`isolate.ts`, ADR 0006)

- `FIRST_STRONG_ISOLATE` is U+2068 and `POP_DIRECTIONAL_ISOLATE` is U+2069, typed `string`: a
  literal type would print the invisible character itself in declarations and editor hovers. The
  published code writes both as escapes.
- `isolate(value)` MUST return `FIRST_STRONG_ISOLATE + value + POP_DIRECTIONAL_ISOLATE` for every
  string, the empty string and an already isolated one included. Outside the isolate the value
  counts as one neutral character, and inside it takes its direction from its first strong character
  (UAX #9, 2.4, and rule X5c).
- `isolate` MUST NOT rewrite the value. A value whose own isolate controls are unbalanced escapes:
  an unmatched U+2069 in it closes the isolate, and an unmatched U+2066, U+2067, or U+2068 takes the
  closing U+2069 (UAX #9, BD9), as inside a `<bdi>` element (CSS Writing Modes 3, 2.4.2).
  Applications remove `\p{Bidi_Control}` from text they accept from users (ADR 0006).

## 3. Formatters (`intl/`, ADR 0003, ADR 0004)

### 3.1 `createIntl(options)` (`create-intl.ts`)

```ts
interface IntlOptions {
  readonly locale: () => string;
  readonly timeZone: () => string;
  readonly formattingLocales?: Readonly<Record<string, string>>;
  readonly cacheSize?: number;
}
```

- `locale` MUST be a function; it returns the application's current locale (Paraglide's
  `getLocale`). `timeZone` MUST be a function; it returns the reader's IANA time zone (4.4).
- `formattingLocales`, when given, MUST be an object whose own enumerable values are strings; each
  value MUST be a structurally valid BCP 47 language tag, checked and canonicalized once with
  `Intl.getCanonicalLocales()`.
- `cacheSize`, when given, MUST be an integer of at least 1; it defaults to `DEFAULT_CACHE_SIZE`.
- A violation throws when `createIntl()` runs (section 5). Nothing else is validated ahead of a
  call: a locale or zone a getter returns is checked by `Intl` itself when an object is built.

### 3.2 The formatting tag (`formatting-locales.ts`)

The formatting tag of a locale `l` is the canonicalized `formattingLocales[l]` when
`Object.hasOwn(formattingLocales, l)`, and `l` itself otherwise. `formattingLocale()` returns the
formatting tag of `locale()`. Every `Intl` object a formatter uses MUST be built with the formatting
tag of the locale `locale()` returned for that call, as its only requested locale.

### 3.3 The formatters (`create-intl.ts`)

`createIntl()` returns an `IntlFormatters`, a frozen object whose methods are closures, so a method
MAY be passed on its own (`intl.date` as a cell formatter). Each method calls `locale()` exactly
once; the date methods also call `timeZone()` exactly once, and only when their options name no
`timeZone`.

| Method                                | Builds                                               | Returns                   |
| ------------------------------------- | ---------------------------------------------------- | ------------------------- |
| `formattingLocale()`                  | nothing                                              | the formatting tag        |
| `date(value, options?)`               | `Intl.DateTimeFormat(tag, { ...options, timeZone })` | `format(value)`           |
| `dateRange(start, end, options?)`     | `Intl.DateTimeFormat(tag, { ...options, timeZone })` | `formatRange(start, end)` |
| `number(value, options?)`             | `Intl.NumberFormat(tag, options)`                    | `format(value)`           |
| `relativeTime(value, unit, options?)` | `Intl.RelativeTimeFormat(tag, options)`              | `format(value, unit)`     |
| `list(values, options?)`              | `Intl.ListFormat(tag, options)`                      | `format(values)`          |
| `displayName(code, options)`          | `Intl.DisplayNames(tag, options)`                    | `of(code)`                |
| `plural(value, options?)`             | `Intl.PluralRules(tag, options)`                     | `select(value)`           |
| `compare(left, right, options?)`      | `Intl.Collator(tag, options)`                        | `compare(left, right)`    |

- `DateInput` is `Date | number` (a time value in milliseconds). The date methods MUST NOT parse
  strings: a string's meaning depends on its format, and the caller knows it.
- `timeZone` in the table is `options.timeZone` when that is not `undefined`, and `timeZone()`
  otherwise.
- `NumberInput` is `number | bigint | string`. A string is read as ECMA-402 reads it
  ([ToIntlMathematicalValue](https://tc39.es/ecma402/#sec-tointlmathematicalvalue)): a
  StringNumericLiteral formats exactly, so a PostgreSQL `numeric` read as text (which pg-catalog
  types `string`) keeps its digits, and any other string formats as NaN.
- Errors from `Intl` propagate unchanged: a `RangeError` for an invalid time value
  ([PartitionDateTimePattern](https://tc39.es/ecma402/#sec-partitiondatetimepattern), step 2), an
  unknown time zone, an option out of range, or a tag `Intl` refuses.

### 3.4 The cache (`intl-cache.ts`)

- Each `createIntl()` result owns one cache. A formatter takes its `Intl` object from the cache
  under the key made of the constructor's name, the formatting tag, and the options: the own
  enumerable entries whose value is not `undefined`, sorted by name, each value with its type. The
  zone a date method fills in is part of its options. The constructor receives a copy of the own
  enumerable entries, so it reads exactly what the key is made of, each getter once.
- An options object with a value that is not a string, a finite or infinite number, or a boolean
  MUST NOT be cached: the object is built for that call only.
- On a hit the entry becomes the most recently used; on a miss with a full cache the least recently
  used entry is dropped before the new one is added. The cache never holds more than `cacheSize`
  entries.

## 4. Time zones (`time-zone/`, ADR 0005)

### 4.1 `toTimeZone(value)` (`to-time-zone.ts`)

Returns the trimmed `value` when it is a time zone, and `undefined` otherwise:

1. `undefined`, `null`, and a string that is empty after trimming are not time zones.
2. A string whose first character is `+`, `-`, or U+2212 is not a time zone: ECMA-402 accepts a UTC
   offset ([CreateDateTimeFormat](https://tc39.es/ecma402/#sec-createdatetimeformat), step 18), and
   Node 24 and Deno accept U+2212 as its sign, but an offset holds only until the next transition.
3. Otherwise the value is a time zone when `new Intl.DateTimeFormat(undefined, { timeZone })` does
   not throw; the lookup matches names ASCII-case-insensitively
   ([GetAvailableNamedTimeZoneIdentifier](https://tc39.es/ecma402/#sec-getavailablenamedtimezoneidentifier)).
   The value is returned as written, not canonicalized: engines canonicalize differently (Node 24
   resolves `Europe/Kyiv` to `Europe/Kiev`, Bun keeps it).

Nothing is remembered between calls, so input cannot grow memory: names match
ASCII-case-insensitively, so even the accepted spellings are unbounded. A call constructs one
`Intl.DateTimeFormat`, once per request on a server.

### 4.2 `detectTimeZone()` (`to-time-zone.ts`)

Returns `toTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone)`: the device's zone, for
seeding the cookie (4.3), never for formatting a render.

### 4.3 Cookies (`cookie.ts`)

- A cookie name MUST be an HTTP `token`
  ([RFC 9110, 5.6.2](https://www.rfc-editor.org/rfc/rfc9110#section-5.6.2);
  [RFC 6265bis-22, 4.1.1](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-4.1.1)).
- `timeZoneFromCookie(header, name)` reads a `Cookie` request header or `document.cookie`: the pairs
  are separated by `;` with optional whitespace
  ([RFC 6265, 5.4](https://www.rfc-editor.org/rfc/rfc6265#section-5.4)); the first pair whose name
  equals `name` exactly is used; a value in double quotes is unquoted, a percent-encoded value is
  decoded (a value that does not decode is used as is), and the result goes through `toTimeZone`.
  `undefined` or `null` for `header` reads as no cookie.
- `timeZoneCookie(zone, options)` returns the `Set-Cookie` value
  `<name>=<zone>; Path=<path>; Max-Age=<maxAge>`, followed by `; Domain=<domain>`,
  `; SameSite=<sameSite>`, and `; Secure` when given. `zone` MUST be a time zone (4.1); an IANA name
  is made of cookie-octets, so it is written unencoded. `path` defaults to `/` and `maxAge` to
  `TIME_ZONE_COOKIE_MAX_AGE`, Paraglide's locale cookie attributes. `maxAge` MUST be a positive
  integer (`max-age-av` is `non-zero-digit *DIGIT`); `path` and `domain` MUST be `av-octet`s, so no
  control character, no `;`, and nothing outside US-ASCII; `sameSite` is `'Strict'`, `'Lax'`, or
  `'None'`. A cookie a user agent would drop is refused: `sameSite: 'None'`, a `__Secure-` name, or
  a `__Host-` name without `secure`, and a `__Host-` name with a `domain` or a `path` other than `/`
  ([RFC 6265bis-22, 5.7](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22#section-5.7),
  steps 19 to 21). The cookie is never `HttpOnly`: the browser reads it (4.4).

### 4.4 `createTimeZone(options)` (`create-time-zone.ts`)

```ts
interface RequestScope<TStore> {
  getStore(): TStore | undefined;
  run<TResult>(store: TStore, callback: () => TResult): TResult;
}
interface TimeZoneOptions {
  readonly cookieName: string;
  readonly fallback?: string;
  readonly scope?: RequestScope<string>;
}
interface TimeZoneResolver {
  get(): string;
  fromRequest(request: Request): string;
  run<TResult>(request: Request, callback: () => TResult): TResult;
  useScope(scope: RequestScope<string>): void;
}
```

- `cookieName` MUST be a cookie name (4.3); `fallback`, when given, MUST be a time zone (4.1) and
  defaults to `DEFAULT_TIME_ZONE`; `scope`, when given, MUST have `getStore` and `run` functions (an
  `AsyncLocalStorage<string>` does).
- The resolver is a frozen object whose methods are closures; `get` MAY be passed on its own, as
  `createIntl({ timeZone: resolver.get })` does.
- `fromRequest(request)` returns `timeZoneFromCookie(request.headers.get('cookie'), cookieName)`, or
  the fallback.
- `useScope(scope)` checks the scope as the option is checked and makes it the resolver's scope,
  replacing any. A server entry calls it once with an `AsyncLocalStorage`, so the module that
  creates the resolver, shared with the browser, never imports `node:async_hooks`, as Paraglide's
  `overwriteServerAsyncLocalStorage()` lets its runtime do.
- `run(request, callback)` calls `scope.run(fromRequest(request), callback)` and returns its result.
  Without a scope it throws (section 5).
- `get()` returns, in order: `scope.getStore()` when a scope is given and that is not `undefined`;
  when `globalThis.document` existed as `createTimeZone()` ran, the zone of its `cookie` at that
  moment, or the fallback without one, returned unchanged by every later call (the pin); the
  fallback otherwise. A document with an opaque origin, such as a sandboxed iframe, throws a
  `SecurityError` when its cookie is read
  ([HTML, `document.cookie`](https://html.spec.whatwg.org/multipage/dom.html#dom-document-cookie))
  and reads as one without the cookie. Reading the cookie at creation, before any script can write
  it, keeps the zone the server rendered with.

## 5. Errors

Every message is constant apart from the names of options and of configured locales, and names the
function. No message contains a cookie, a header, a request URL, or a value read from a request.

| Thrown by                     | Class                    | When                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createIntl()`                | `TypeError`              | the options are not an object; `locale` or `timeZone` is not a function; `formattingLocales` is not an object or holds a value that is not a string                                                                                                                                                                                      |
| `createIntl()`                | `RangeError`             | a `formattingLocales` value is not a BCP 47 tag; `cacheSize` is not an integer of at least 1                                                                                                                                                                                                                                             |
| `timeZoneCookie()`            | `TypeError`              | `zone` is not a time zone; the name is not a token; `path` or `domain` is not `av-octet`s; `sameSite` is another value; a user agent would drop the cookie                                                                                                                                                                               |
| `timeZoneCookie()`            | `RangeError`             | `maxAge` is not a positive integer                                                                                                                                                                                                                                                                                                       |
| `createTimeZone()`            | `TypeError`              | the options are not an object; the cookie name is not a token; `fallback` is not a time zone; `scope` lacks `getStore` or `run`                                                                                                                                                                                                          |
| `TimeZoneResolver.useScope()` | `TypeError`              | `scope` lacks `getStore` or `run`                                                                                                                                                                                                                                                                                                        |
| `TimeZoneResolver.run()`      | `TypeError`              | the resolver has no scope: none was given to `createTimeZone()` or `useScope()`                                                                                                                                                                                                                                                          |
| `compile()`                   | `TypeError`              | the options are not an object; `project` or `outdir` is not a string; `isolate` is not a boolean or an array of strings, or lists a locale the project does not declare; `fs` is not a file system module; `formatters` is another value; Paraglide's SDK lacks a function the binding calls or returns a bundle the binding cannot read |
| `compile()`                   | `MessageFormattingError` | a message formats and `formatters` is `'refuse'` (6.3)                                                                                                                                                                                                                                                                                   |
| `watch()`                     | `TypeError`              | the options are not an object; `onCompile` or `onError` is not a function; an option `compile()` refuses before reading anything (6.1 step 1). What a compile throws goes to `onError` (6.5)                                                                                                                                             |

## 6. Paraglide binding (`@nizam-os/paraglide-intl`, `packages/paraglide-intl/src/`)

### 6.1 `compile(options)` (`compile.ts`, `compile-options.ts`, `paraglide-sdk.ts`, ADR 0007)

```ts
type CompileOptions = CompilerOptions & {
  readonly previousCompilation?: { readonly outputHashes?: Record<string, string> };
  readonly isolate?: boolean | ReadonlyArray<string>;
  readonly formatters?: 'refuse' | 'allow';
};
interface CompileResult {
  readonly outputHashes: Record<string, string>;
  readonly warnings: ReadonlyArray<Error>;
}
```

`CompilerOptions` is Paraglide's; a result is itself a `previousCompilation`, and so is the result
of Paraglide's `compile()`. `compile()` MUST:

1. Check the options before reading anything, and throw a `TypeError` when they are not an object,
   `project` or `outdir` is not a string, `isolate` is not absent, a boolean, or an array of
   strings, `fs` is not absent or an object with a `promises` object, or `formatters` is not absent,
   `'refuse'`, or `'allow'`.
2. Merge Paraglide's `defaultCompilerOptions` under the given options, without `isolate`,
   `formatters`, and `previousCompilation`, as Paraglide's `compile()` does.
3. Wait for any compile still running, then run, so two compiles never write at once, as Paraglide's
   `compile()` does
   ([paraglide-js#320](https://github.com/opral/paraglide-js/issues/320#issuecomment-2596951222)).
   The compiles of `watch()` (6.5) wait in the same queue.
4. Import the inlang SDK that Paraglide depends on: `@inlang/sdk` resolved with `createRequire()`
   from the file `@inlang/paraglide-js` resolves to, where Paraglide's own imports resolve it (root
   ADR 0009). A module without the functions `loadProjectFromDirectory`, `selectBundleNested`, and
   `upsertBundleNested`, which SDK 2, 3, and 4 all export, is a `TypeError` naming each one it
   lacks.
5. Load the project with `loadProjectFromDirectory({ path: project, fs })`, where `fs` is the `fs`
   option or `node:fs`.
6. Throw a `TypeError` when `isolate` lists a locale the project's settings do not declare.
7. When `formatters` is `'refuse'` or a locale is isolated, read every bundle with its messages and
   variants (`selectBundleNested(project.db)`), and throw a `TypeError` for one without an `id`,
   `declarations`, each with a `type` and a `name`, and `messages`, each with a `locale` and
   `variants`, each with a `pattern` of parts that have a `type`; an expression part, and the value
   of a `local-variable` declaration, must have an `arg` that is a variable reference or a literal
   and, if any, an `annotation` that is a function reference with a `name`.
8. When `formatters` is `'refuse'` (the default), throw a `MessageFormattingError` carrying every
   finding (6.3) when there is any. Nothing has been written at that point.
9. Rewrite the patterns (6.2) and write each changed bundle back with `upsertBundleNested()`, one at
   a time. A bundle is written back as it was read, but for its patterns, so the SDK of any major
   reads its own fields back.
10. Compile with `compileProject({ project, projectPath: project, compilerOptions })`, write the
    bidi controls of the output as escapes (6.4), and write it with `writeOutput()` into `outdir`
    resolved against the working directory, passing `previousCompilation.outputHashes` so unchanged
    files are not rewritten and the files the previous compile wrote and this one does not are
    deleted. It is cleaned first when `cleanOutdir` is set and no previous output hashes are given:
    `writeOutput()` cleans before writing only the changed files, so a clean under a previous
    compilation would leave nothing else, as Paraglide 2.27's own `compile()` does (measured).
11. Return the output hashes and `await project.errors.get()` as `warnings` (a plugin that failed to
    import, a file that failed to parse), and close the project whether or not a step threw.

The catalogs on disk MUST be unchanged: the project is loaded without a `syncInterval`, so the SDK
writes nothing back after the load. As it loads the project, the SDK writes its own files into the
project directory (`.gitignore`, `.meta.json`, `README.md`, `.lix/README.md`), as it does for
Paraglide's `compile()` (measured on Paraglide 2.27.0 with inlang SDK 4.0.1, ADR 0007).

### 6.2 Isolating patterns (`isolate-patterns.ts`, ADR 0006)

- The isolated locales are every locale of the project's settings when `isolate` is `true` or
  absent, none when it is `false`, and the listed ones otherwise.
- For each message of an isolated locale, each variant's pattern with two or more parts is
  rewritten: each part of type `expression` is replaced by three parts, a `text` part
  `FIRST_STRONG_ISOLATE`, the expression part unchanged, and a `text` part
  `POP_DIRECTIONAL_ISOLATE`. Every other part (`text`, `markup-start`, `markup-end`,
  `markup-standalone`) keeps its place. A pattern of one part is left as is, as Fluent does (ADR
  0006).
- Declarations, selectors, and matches are not changed. A bundle is written back only when one of
  its patterns changed.

### 6.3 Formatting annotations (`formatting-annotations.ts`, ADR 0008)

- The formatting annotations are `number`, `datetime`, `date`, `time`, `relativetime`, and
  `icu:pound`, the function references Paraglide 2.27 compiles to a `registry` call that formats
  ([`compile-annotation.ts`](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/compile-annotation.ts)).
  `plural` selects and is not one; any other name Paraglide interpolates unformatted.
- A finding is an expression part of a variant's pattern, or a `local-variable` declaration, whose
  annotation is a formatting annotation. Declarations live on the bundle in every SDK the peer range
  reaches: SDK 2.7.0, the lowest Paraglide 2.11 accepts, 2.10.2, 3.1.0, and 4.0.0 all declare them
  on the bundle table and none on the message table (measured 2026-10-12).
- The findings are the same on every Paraglide version, so a catalog is refused on each or on none,
  though what Paraglide formats differs (measured 2026-10-12 with the message-format plugin 4.5.1):
  2.11.0 formats an annotated declaration and interpolates an annotated expression unformatted,
  without a warning; 2.20.2, 2.25.2, and 2.26.0 format both, but interpolate `date`, `time`, and
  `icu:pound` unformatted, with a warning; 2.27.0 formats all six. A declaration is a finding
  whether or not a pattern or a selector reads it: up to 2.26.0 Paraglide compiles every local
  declaration into every locale's function, and 2.27.0 only the ones the locale reads.
- `FormattingFinding` is `{ bundleId, locale, variable, annotation }`: `locale` is `undefined` for a
  declaration, which every locale shares; `variable` is the name the expression refers to or the
  declaration declares, `undefined` for a literal.
- `MessageFormattingError` extends `Error`, has the name `MessageFormattingError`, and carries the
  findings, frozen, sorted by bundle id, locale, variable, and annotation in code-unit order with
  `undefined` first, each listed once. Its message names the count and lists one finding per line as
  `<bundleId> (<locale or "every locale">): <variable or "a literal">: <annotation>`; bundle ids are
  the application's own message keys.

### 6.4 Bidi controls in the compiled code (`escape-bidi-controls.ts`, ADR 0007)

Paraglide writes the text parts of a pattern into the compiled code as they are, so the isolates of
6.2, and any bidi control a catalog holds, would stand raw in the output: invisible in an editor,
and what Trojan Source scanners flag
([CVE-2021-42574](https://www.cve.org/CVERecord?id=CVE-2021-42574)). In every output file whose name
ends in `.js`, `.cjs`, `.mjs`, `.ts`, `.cts`, `.mts`, or `.json`, each `\p{Bidi_Control}` character
(U+061C, U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069) MUST be written as `\u` and four
lowercase hex digits. In those languages such a character can stand only in a string, a template, a
regular expression, or a comment, and in the first three the escape denotes the same character
([ECMA-262, UnicodeEscapeSequence](https://tc39.es/ecma262/#prod-UnicodeEscapeSequence);
[RFC 8259, 7](https://www.rfc-editor.org/rfc/rfc8259#section-7)), so the compiled messages return
the same strings. Other files are written as Paraglide emits them.

### 6.5 `watch(options)` (`watch.ts`, `tracked-fs.ts`, `directory-watchers.ts`, `output-hashes.ts`, ADR 0010)

```ts
type WatchOptions = CompileOptions & {
  readonly onCompile?: (result: CompileResult) => void;
  readonly onError?: (error: unknown) => void;
};
interface Watcher {
  close(): Promise<void>;
}
```

`watch()` MUST:

1. Check the options before reading anything, and throw a `TypeError` naming `watch` when they are
   not an object, `onCompile` or `onError` is not absent or a function, or another option fails 6.1
   step 1.
2. Compile as 6.1 does, in the same queue, loading the project through a file system that records,
   before each call, the absolute path that `readFile`, `readFileSync`, `readdir`, or `readdirSync`
   of the `fs` option or of its `promises` reads, and the path's state: its device, inode, size, and
   birth, modification, and status change times, or absent. Only the load reads through it; the
   output is written through the `fs` option.
3. Give the first compile, unless `previousCompilation` is given and when `cleanOutdir` is set, the
   hashes of the files already in `outdir`, in the form `writeOutput()` returns them from Paraglide
   2.11 to 2.27: the hexadecimal SHA-256 of each file's text followed by its absolute path, by path
   relative to `outdir` with `/` separators. That compile then rewrites the files that changed and
   deletes the files it no longer writes, instead of removing the directory (6.1 step 10), as
   Paraglide's CLI and bundler plugins seed theirs
   ([`compile/command.ts`](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/cli/commands/compile/command.ts)).
   A file that cannot be read has no hash and is rewritten; a missing directory has none. Each later
   compile is given the previous compile's output hashes, or after a compile that threw, those read
   again from `outdir`.
4. Watch with the `watch()` of the `fs` option the directory of each file read and each directory
   listed, or the nearest existing ancestor of one that does not exist; stop watching any other
   directory; and start a watcher again when its directory's device, inode, or birth time changed,
   since a watcher follows the inode it started on
   ([Node, Inodes](https://nodejs.org/docs/latest-v24.x/api/fs.html#inodes)), or when it emitted
   `error`, which goes to `onError`. An inode number is unique only among the files that exist
   ([inode(7)](https://man7.org/linux/man-pages/man7/inode.7.html)), so a new directory can get the
   number of one just removed; the birth time tells them apart. An update that starts or stops a
   watcher counts as an event (5): Node on macOS serves all of a process's watchers with one
   FSEvents stream, which it replaces on each start or stop with one that reports from its own
   creation, so a change made meanwhile is never reported
   ([libuv `uv__fsevents_reschedule`](https://github.com/libuv/libuv/blob/v1.52.1/src/unix/fsevents.c#L398-L468)).
5. After an event, once none came for `SETTLE_MS`, compare the state of each recorded path with its
   recorded state, and compile only when one differs. After each compile, update the watchers (4)
   and compare again, compiling until nothing differs: a change made while a compile ran, before the
   watcher of its directory started, compiles too.
6. Run one check or compile at a time, and resolve once the first compile, and any it led to, has
   finished, whether or not it threw.
7. Hand each compile's result to `onCompile` and what a compile throws to `onError`, `console.error`
   by default; what `onCompile` throws goes to `onError`, and what `onError` throws is swallowed.
   After a compile that threw, the recorded paths are those this compile read and those the one
   before read, these with their state when this compile started, so the change that made it throw
   does not compile again on its own.
8. On `close()`, stop the watchers and a pending check, and resolve once the compile that runs, if
   any, has finished; nothing compiles after it.

On a project's first load the SDK writes its own files into the project directory (6.1), and a
plugin it fetched from a URL into its `cache/plugins`, after listing it, so the first watch after a
checkout compiles twice; later loads write nothing outside `outdir` (measured with SDK 2.10.2,
3.1.0, and 4.0, with plugins from a path and from a URL). An editor's swap file beside a catalog
compiles nothing; a new file in the project directory, which the SDK lists and reads, compiles.

### 6.6 Peer and floor

`@inlang/paraglide-js` is the one peer dependency (ADR 0002); the inlang SDK comes from Paraglide's
own dependency (6.1, root ADR 0009). The range starts at the oldest release on which
`compileProject()`, `writeOutput()`, and the SDK's `loadProjectFromDirectory()`,
`selectBundleNested()`, and `upsertBundleNested()` behave as 6.1 to 6.5 require, past any published
advisory (root ADR 0007). A CI job runs the binding's typecheck and tests there and on the last
release of each SDK major between the floor and the current release. Section 8 lists the range.

## 7. Test plan

### 7.1 Unit tests

- `isolate.test.ts`: the characters by code point, the empty string, nesting.
- `create-intl.test.ts`: option checks; each formatter against the same call on a fresh `Intl`
  object with the formatting tag; the zone default and an explicit zone winning; the getters read
  once per call and on every call; the formatting tag reaching every constructor.
- `intl-cache.test.ts`: key canonicalization (option order, `undefined` values), the bypass for
  other values, the least recently used eviction and the bound.
- `to-time-zone.test.ts`, `cookie.test.ts`, `create-time-zone.test.ts`: every rule of section 4,
  including a scope given by an `AsyncLocalStorage` in the type tests and the tests.
- `bundle.test.ts`, `isolate-patterns.test.ts`, `formatting-annotations.test.ts`: the checks of 6.1
  and the rules of 6.2 and 6.3 over patterns and bundles written as data.
- `compile.test.ts`, `compile-run.test.ts`, `compile-formatters.test.ts`: fixture projects in
  `mkdtemp` directories compiled with Paraglide, the emitted functions called in each locale, the
  catalogs compared byte for byte before and after, the refusal raised before any output exists, and
  `formatters: 'allow'` rendering the same project as Paraglide does, each value isolated.
- `tracked-fs.test.ts`, `directory-watchers.test.ts`, `output-hashes.test.ts`: the reads recorded in
  each form by absolute path with their state before the first read; watchers on the nearest
  existing directory, started again over a replaced directory or after an error, a late error
  leaving the replacement, an update that starts or stops one reported as an event; the hashes equal
  to those a compile returns, in both output structures.
- `watch.test.ts`, `watch-cases.test.ts`: real `fs.watch()` over fixture projects: one compile per
  change and none for a file no load reads, a change made during a compile, a compile that throws
  and its fix, a first load that fails, `close()` waiting for a compile and a check queued behind
  it, a new locale, a replaced messages directory, the first compile over an existing output with
  and without `cleanOutdir`, a change made while the watchers start that no watcher reports,
  callbacks that throw, and the option errors.

### 7.2 End-to-end suite (`e2e/intl/`)

A private package that consumes the built packages through `workspace:*` and never imports `src/`:

- `package-surface.e2e.test.ts`: the export lists of 1.
- `time-zone.e2e.test.ts`: concurrent requests resolved from their cookies in a request scope, the
  cookie `timeZoneCookie` writes read back by the next request, and a browser resolver keeping the
  zone its document had when it was created.
- `compile.e2e.test.ts`: a fixture project compiled with the built binding, its messages called in
  English and Arabic, and a project whose messages format refused with the built
  `MessageFormattingError`.
- `hydration.e2e.test.ts`: a server render inside a request scope and a jsdom document render from
  the same cookie produce the same strings; without the cookie both use the fallback. Each side
  loads its own copy of the compiled output, as its bundle would: Paraglide's runtime decides when
  it loads whether it runs on a server.
- `visual-order.e2e.test.ts`: bidi-js (UAX #9 C1) resolves the compiled messages' visual order with
  each value in place, where the plain interpolation reorders it.
- `watch.e2e.test.ts`: an edit compiled through the built package into the output a fresh
  `compile()` writes, and nothing compiled after `close()`.
- `support/catalogs.ts` and `support/project.ts`: the fixture catalogs, and projects written into
  `mkdtemp` directories by their real path. The temporary directory is a symlink on macOS, and
  Vitest loads a module imported through it and through its target twice, where Node loads it once.

### 7.3 Runtime smoke test (`e2e/intl/smoke/`)

The core's formatters and time zone resolver, and the compiled fixture messages, on Bun, Deno, and
workerd. Each smoke script first compiles `support/catalogs.ts` with the built binding into
`.tmp/smoke/` on the runtime under test, or on Node for workerd, which runs compiled messages but
does not compile them. The checks import the output as `#compiled-messages`, a `package.json`
subpath import whose `types` condition is `smoke/compiled-messages.d.ts`, so the smoke type-checks
before any compile; Bun, Deno, Node, and the workerd bundle resolve it to the output. The package's
`build` also compiles the fixture on Node, as `e2e/resource`'s compiles its project, so the import
resolves for the deps check (knip) after `pnpm run build` on a fresh checkout. The smoke compile
refuses Deno before 2.6.10 (section 8) instead of never exiting. On Bun and Deno, `smoke/watch.ts`
then watches a new copy of the fixture, edits a catalog, waits for the compile, and closes, after
which the process must exit on its own. The resolver's request scope is an `AsyncLocalStorage` from
`node:async_hooks` on each; workerd runs with the `nodejs_als` compatibility flag, which
compatibility dates before 2026-08-04 need.

## 8. Packaging and support

ESM only, TypeScript declarations emitted with isolated declarations, `sideEffects: false`.
`@nizam-os/intl-core` runs on Node 22.12+, Bun, Deno, Cloudflare Workers, and browsers.
`@nizam-os/paraglide-intl` runs at build time on Node 22.12+, Bun, and Deno 2.6.10+; it reads and
writes files through the `fs` it is given (ADR 0002). inlang SDK 3.1 and 4 run their database in a
`node:worker_threads` worker that Deno before 2.6.10 does not unref reliably
([denoland/deno#32161](https://github.com/denoland/deno/pull/32161)): there the compile finishes, as
Paraglide's own does, but the process does not exit (measured on Deno 2.1.4 and 2.6.9). On Deno a
compile needs `--allow-read`, `--allow-write`, and `--allow-env`: Paraglide's logger, consola, reads
`TERM` and about forty variables that name a CI provider (measured on Deno 2.9.7). A watch needs the
same. It relies on the operating system's file events, which a network file system or a container's
bind mount may not deliver
([Node, Availability](https://nodejs.org/docs/latest-v24.x/api/fs.html#availability)). Deno reports
file times to the millisecond, so there a directory replaced within the same millisecond, under the
inode number of the one removed, is not told apart from it (6.5, step 4).

| Peer                   | Range             | Floor                                                                                                                                                                                                           |
| ---------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@inlang/paraglide-js` | `>=2.11.0 <3.0.0` | 2.11.0, the first release that compiles markup (`{#b}...{/b}`); 2.10.0 fails inside its own `compilePattern()`. No advisory is published. CI also runs 2.26.0, the last release on SDK 3; 2.11.0 runs on SDK 2. |

## 9. Constants

| Name                       | Value      | Why                                                                    |
| -------------------------- | ---------- | ---------------------------------------------------------------------- |
| `FIRST_STRONG_ISOLATE`     | `'\u2068'` | UAX #9, 2.4                                                            |
| `POP_DIRECTIONAL_ISOLATE`  | `'\u2069'` | UAX #9, 2.4                                                            |
| `DEFAULT_CACHE_SIZE`       | `256`      | ADR 0003: a few locales, a few styles, the zones of concurrent readers |
| `DEFAULT_TIME_ZONE`        | `'UTC'`    | ADR 0005: the same answer on every host                                |
| `TIME_ZONE_COOKIE_MAX_AGE` | `34560000` | 400 days, Paraglide's locale cookie and RFC 6265bis-22, 5.5            |
| `SETTLE_MS` (internal)     | `100`      | 6.5: the quiet a watch waits for, as Paraglide's `compile --watch`     |
