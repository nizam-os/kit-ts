# @nizam-os/intl-core

## 0.1.0

### Minor Changes

- [#171](https://github.com/nizam-os/kit-ts/pull/171) [`608b235`](https://github.com/nizam-os/kit-ts/commit/608b2354f641864f9a9077750d5ad806c60ebe8f) Thanks [@ali-issa](https://github.com/ali-issa)! - `createIntl({ locale, timeZone, formattingLocales, cacheSize })` returns formatters for dates, date
  ranges, numbers, relative times, lists, display names, plural categories, and collation. Each call
  reads the locale, and a date call the reader's time zone, from the getters you pass, so one set of
  formatters serves concurrent requests on a server and the document in a browser. Each call formats
  through an `Intl` object built for the locale's formatting tag, such as
  `ar-SA-u-ca-gregory-nu-latn`, so the calendar and the digits no longer depend on the engine, and the
  last 256 objects are reused. Numeric text, such as a PostgreSQL `numeric`, formats with every digit.

- [#171](https://github.com/nizam-os/kit-ts/pull/171) [`fa0c8ee`](https://github.com/nizam-os/kit-ts/commit/fa0c8eefb77037e7423733875d76d48266b2e2c8) Thanks [@ali-issa](https://github.com/ali-issa)! - First release: `isolate(value)` wraps an interpolated value in U+2068 FIRST STRONG ISOLATE and
  U+2069 POP DIRECTIONAL ISOLATE, so a right-to-left name no longer pulls the digits and punctuation
  after it out of place, and `FIRST_STRONG_ISOLATE` and `POP_DIRECTIONAL_ISOLATE` name the two
  characters.

- [#171](https://github.com/nizam-os/kit-ts/pull/171) [`0b9c5c8`](https://github.com/nizam-os/kit-ts/commit/0b9c5c8335b6a52790d569917cca11dcd4b44d25) Thanks [@ali-issa](https://github.com/ali-issa)! - `createTimeZone({ cookieName })` resolves the reader's time zone from a cookie, the same during SSR
  and after hydration: on a server, `run(request, callback)` makes each request's zone the active one
  in an `AsyncLocalStorage` the server entry passes to `useScope`; in a browser, `get()` keeps the
  zone the document's cookie held when the resolver was created, so writing the cookie later never
  changes rendered text. Pass `timeZone.get` to `createIntl`. `timeZoneCookie(zone, { name })` writes
  the cookie with the attributes of Paraglide's locale cookie and refuses one that user agents would
  drop; `timeZoneFromCookie`, `toTimeZone`, and `detectTimeZone` read, check, and detect a zone, and
  offsets such as `+03:00` are refused.
