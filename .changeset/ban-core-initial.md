---
'@nizam-os/ban-core': major
---

First release of `@nizam-os/ban-core`, the framework-free core extracted from hono-ban 1.x: the
typed catalog and factories, `BanError`, the Problem Details, JSON:API, plain, Google API, and
Stripe formats, `defineFormat`, the validation hooks and converters, the OpenAPI helpers, the
OpenTelemetry adapter, the Postgres SQLSTATE mapper, and the testing utilities, under the same
subpaths. It has no dependencies and no peer dependencies; `@nizam-os/hono-ban` 2.0 is the Hono
adapter built on it.

What differs from hono-ban 1.x:

- `ban.handler(options?)` replaces `ban.onError()`. It returns
  `(thrown, request, ctx) => Promise<Response>` where `request` is an `ErrorRequest` (`method`,
  `path`, `header()`), built from a fetch `Request` with `fromRequest(request)`, and `ctx` is a
  context of your choosing (`ban.handler<MyContext>()`) that `requestId`, `traceId`, `transform`,
  and `onReport` receive.
- `BanError` extends `Error` and nothing else. `status` is `ErrorStatusCode`, the registered 4xx and
  5xx statuses (`isErrorStatus()` is the runtime check), instead of Hono's `ContentfulStatusCode`.
- `errors: ReadonlyArray<ErrorItem>` replaces `issues: ReadonlyArray<ValidationIssue>` on the error
  and is accepted by every factory (`ban.badRequest({ errors })`). `ban.validation()` builds the
  list from validator issues and defaults `detail` to `'Request validation failed'`. An item has
  `detail`, optional `location`, `path`, `reason` (the validator's code), `expected`, `received`,
  `meta`, and an optional identity (`status`, `code`, `title`, `type`).
- Formats implement `renderErrors` and `errorsSchema` instead of `renderValidation` and
  `validationSchema`; `defineFormat` defaults them from `render` and `schema`. `ValidationEntry` is
  now `ErrorEntry` with `location` optional.
- `createBan({ adopt })` recognizes thrown values that already describe an HTTP outcome ahead of
  `map`, inside `ban.from()` too; `ban.fromStatus(status, options?)` picks the primary entry for a
  status.
- JSON:API: `mixedEntries` renders per-item `status`, `code`, and `title` and loosens `errorsSchema`
  to match; `document` adds static top-level `jsonapi`, `links`, and `meta` members;
  `responseStatus(errors)` picks the document's status the way the specification asks.
- `assertFormatConformance` renders an extra mixed-items list per location.

Wire bodies for the built-in formats are unchanged for single errors and validation errors.
