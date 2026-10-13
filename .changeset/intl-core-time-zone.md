---
'@nizam-os/intl-core': minor
---

`createTimeZone({ cookieName })` resolves the reader's time zone from a cookie, the same during SSR
and after hydration: on a server, `run(request, callback)` makes each request's zone the active one
in an `AsyncLocalStorage` the server entry passes to `useScope`; in a browser, `get()` keeps the
zone the document's cookie held when the resolver was created, so writing the cookie later never
changes rendered text. Pass `timeZone.get` to `createIntl`. `timeZoneCookie(zone, { name })` writes
the cookie with the attributes of Paraglide's locale cookie and refuses one that user agents would
drop; `timeZoneFromCookie`, `toTimeZone`, and `detectTimeZone` read, check, and detect a zone, and
offsets such as `+03:00` are refused.
