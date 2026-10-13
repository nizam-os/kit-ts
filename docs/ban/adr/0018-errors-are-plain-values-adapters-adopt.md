# ADR 0018: `BanError` extends `Error`; adapters adopt their framework's exceptions

- Status: accepted
- Date: 2026-10-08

## Context

hono-ban 1.x had `BanError extends HTTPException` so that Hono middleware special-casing
`HTTPException` kept working and a `BanError` that escaped the handler still produced a response
through `getResponse()`. With the core split out (ADR 0016), the base class had to go: a
framework-free package cannot inherit from a framework's exception.

What the inheritance actually provided, checked against Hono's source:

- Hono's default error handler calls `getResponse()` on an `HTTPException` and answers 500 for
  anything else. @ref https://github.com/honojs/hono/blob/main/src/hono-base.ts
- Middleware such as `hono/bearer-auth` and the built-in validator throw `HTTPException`; they never
  check for it. The useful direction is those exceptions reaching the catalog, which `ban.from()`
  handled by `instanceof`.
- `HTTPException` carries a `status` typed as `ContentfulStatusCode`, which includes 2xx and 3xx; a
  thrown 302 reached `onError` and was rendered as an error body.

Hono 4.13's `HTTPException` is still a plain class with `status`, `res`, and `getResponse()`;
nothing in Hono depends on a subclass relationship. @ref https://hono.dev/docs/api/exception

## Decision

`BanError extends Error` and nothing else. Its `status` is the library's own `ErrorStatusCode`, the
registered members of the 4xx and 5xx classes, with `isErrorStatus()` accepting any integer from 400
to 599 at runtime so a non-standard 499 keeps working with a cast. `getResponse()` stays, so a
caller holding an error can still produce its response.

Recognition of framework exceptions moves to a hook: `createBan({ adopt })` takes
`(value, ban) => BanError | undefined`. It runs inside `ban.from()` and ahead of `map` in the
handler (SPEC 6.3), and what it returns counts as handled: an adopted value is a deliberate HTTP
outcome, not an unexpected failure. `ban.fromStatus(status, options)` is the building block for
adopters (primary catalog entry by status, else a custom error).

`@nizam-os/hono-ban`'s `createBan` installs `fromHttpException` as the adopter ahead of the caller's
own. It keeps the 1.x rules: entry by status, `MALFORMED_JSON` for Hono's validator by exact
message, `detail` from the message, response headers kept minus those describing the discarded body,
`Content-Range` kept on 416. New in 2.0, `onError` answers an `HTTPException` outside the error
classes with its own response before the pipeline starts, which matches Hono's default handler and
fixes the rendered 302.

Without `app.onError(ban.onError())`, Hono answers a thrown `BanError` with its default 500 instead
of the error's own body. The quick start has always installed the handler; the README states the
consequence.

## Consequences

- The core has no framework import, type-level or otherwise, and the hook gives any adapter the same
  leverage `@nizam-os/hono-ban` has.
- Breaking for 1.x code that relied on `instanceof HTTPException` for a `BanError`, on
  `ContentfulStatusCode` in its own signatures, or on a `BanError` escaping the handler and still
  rendering through Hono's default handler.
- The handler's resolution order gains a step (`BanError`, `adopt`, `map`, unexpected). A throwing
  or ill-typed adopter is a handler failure, like a throwing `map`, and `from()` treats it as
  declining; both paths are tested.
