# ADR 0014: Errors are @nizam-os/ban-core errors; the adapter renders through @nizam-os/hono-ban

- Status: accepted; supersedes ADR 0006 and the construction rules of ADR 0009
- Date: 2026-10-08

## Context

The first error layer was this package's own: a `JsonApiError` class over error objects, a status
table, factories per catalog entry, structural recognition for a second installed copy, and an
`errorHandler` that mapped Hono's `HTTPException` by status.
[@nizam-os/ban-core](https://github.com/nizam-os/kit) is the same author's framework-free error
library: a catalog of definitions, one `BanError` class with a per-item `errors` list, a JSON:API
format that renders those items as error objects with `source.pointer`, `source.parameter`, or
`source.header`, a handler with an error id, W3C `traceparent`, a report hook, a body cap, and a
never-throwing fallback, and `@nizam-os/hono-ban`, its Hono adapter, which adopts `HTTPException`
and passes thrown redirects through. An application on both libraries had two error models to
reconcile: two base classes, two handlers, two ways to add a code. @ref
https://jsonapi.org/format/1.1/#errors @ref https://jsonapi.org/format/1.1/#errors-processing @ref
https://github.com/nizam-os/kit/blob/main/docs/jsonapi/SPEC.md (sections 4, 6, 6.11, 7.2)

## Decision

- Every error `@nizam-os/jsonapi-core` throws is a `BanError` built by `jsonApiBan`, an instance
  whose catalog is `ERROR_CATALOG` (the entries @nizam-os/ban-core does not ship, in
  @nizam-os/ban-core's definition shape) over @nizam-os/ban-core's built-ins, and whose format is
  `jsonApi({ mixedEntries: true })`. The builders are `jsonApiError(code, init?)` for one object and
  `jsonApiError(items, options?)` for a list of `ErrorItem`s from `errorItem(code, init)`; a parser
  accumulates items and throws once.
- An item's identity (`status`, `code`, `title`, the profile's `type`) is always set from the
  catalog, so one document can combine entries. The response status is the shared entry's, else
  `responseStatus(items)` from `@nizam-os/ban-core/formats/json-api` through `fromStatus`, which is
  the specification's "most generally applicable" rule ADR 0009 had implemented here.
- A `source` becomes @nizam-os/ban-core's address: a pointer is a path with no location, a parameter
  name a one-segment path in `query`, a header name one in `header`. The format renders them back,
  and adds `meta.location` for parameters and headers; no `pointer` ever carries a `location`.
- The error's own headers (`Allow` on 405, `Vary: Accept` on 415 and 406) ride on
  `BanError.headers`, so every renderer sends them.
- `errorHandler()` in `@nizam-os/hono-jsonapi` is
  `createBan({ errors: ERROR_CATALOG, format: jsonApi({ mixedEntries: true }) }).onError(options)`
  from `@nizam-os/hono-ban`, with `document` and `format` added for the JSON:API document's own
  members. Rendering, `HTTPException` adoption, the constant 500, the id header,
  `Cache-Control: no-store`, `traceparent`, `onReport`, and the fallback are @nizam-os/hono-ban's.
  An application with its own entries builds that instance itself and installs its `onError`; it
  renders this package's errors identically.
- Validators, `jsonApi()`, and `atomicOperations()` throw instead of rendering their own rejections.
  Hono's default error handler answers any thrown value with a `getResponse()` method through it, so
  a `BanError` is still a JSON:API document on an app without `errorHandler()`; ADR 0006's reason
  for self-rendering no longer holds.
- `respondError` stays for callers that render by hand: `errorDocument(error, base)` with the
  error's status and headers, no id header, no report.
- `@nizam-os/jsonapi-core` depends on `@nizam-os/ban-core`; `@nizam-os/hono-jsonapi` has
  `@nizam-os/hono-ban` as a second peer dependency (ADR 0002 and ADR 0013 said "no dependencies" and
  "only peer dependency"; this ADR amends both). One copy of each in the graph keeps `instanceof`
  true across the packages.

## Consequences

One error model across the application, this package, and any other library on @nizam-os/ban-core:
one base class to catch (`isBanError`), one catalog to extend (spread `ERROR_CATALOG` into
`createBan`), one handler with one id in the header and in the body. The package no longer maintains
a status table, reason phrases, structural recognition, or an `HTTPException` mapping. The cost is
the dependency: `@nizam-os/ban-core` ships with the core, and the two libraries version together (a
catalog or format change in @nizam-os/ban-core is a change here). Error objects now carry `id` and,
for parameters and headers, `meta.location`; clients that compared whole objects see those members.
The factories of the old class (`JsonApiError.notFound()`, `validationFailed()`, `internal()`) are
`jsonApiError('NOT_FOUND')`, `jsonApiBan.validation()`, and the handler's own 500.
