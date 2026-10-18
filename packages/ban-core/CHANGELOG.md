# @nizam-os/ban-core

## 1.0.0

### Major Changes

- First release of `@nizam-os/ban-core`, the framework-free core extracted from hono-ban 1.x: the
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

### Minor Changes

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`890844a`](https://github.com/nizam-os/kit-ts/commit/890844ae14747d4b64a38061cd31fd03484c108d) Thanks [@ali-issa](https://github.com/ali-issa)! - A `BanError` built by another copy of `@nizam-os/ban-core` is recognized: every error carries a
  brand from the global symbol registry on its prototype, and `isBanError` and `instanceof BanError`
  accept an error whose brand has the version this copy reads. A handler answers such an error with
  its own status, code, detail, and items, where it answered 500 before, as happened when a package
  manager installed a second copy for ranges that cannot meet. A subclass keeps the ordinary
  `instanceof` check, and an error from a copy with another shape is still an unexpected failure.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`2ff6270`](https://github.com/nizam-os/kit-ts/commit/2ff6270ed3751cc04cafc4aeaf4d31cf6e0291b2) Thanks [@ali-issa](https://github.com/ali-issa)! - Document error titles as strings, so localized bodies conform. The Problem Details, JSON:API, and
  plain schemas pinned `title` to the catalog's value with `const`, so a body whose title the
  handler's `transform` localized, as RFC 9457 allows, failed the response its route documented. They
  now document `title` as a string with the catalog's title as its example (`examples` in JSON Schema
  2020-12 and OpenAPI 3.1, `example` in the OpenAPI 3.0 dialect), and keep `status` and `code` pinned,
  so each entry's schema still refuses another entry's body.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`50b1e6a`](https://github.com/nizam-os/kit-ts/commit/50b1e6a32cb2c1bf6f95c1df4f9304da114f27dd) Thanks [@ali-issa](https://github.com/ali-issa)! - `errorResponses` describes the documents a format that combines entries sends. With
  `jsonApi({ mixedEntries: true })`, each status's response admits the error objects of every code a
  body of that status may carry: its own codes, 400 also every client-error code once they span two
  statuses, and 500 every code once a server error is among them, as `responseStatus` picks the status
  of a combined document. Each object stays pinned to one entry's `status`, `code`, and `title`.
  Before, the schemas rejected a document holding two codes of one status, such as an invalid and an
  unknown query parameter, and a 400 holding a 403 object. `ErrorFormat` gains the optional
  `mixedSchema(definitions, ctx)` that describes such documents, which the JSON:API format defines
  when `mixedEntries` is on.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`eeff0dd`](https://github.com/nizam-os/kit-ts/commit/eeff0dd61a32580458e85d5c22501e77210e079d) Thanks [@ali-issa](https://github.com/ali-issa)! - `errorResponses` takes `objectRef`, where the document holds each entry's error object, and then
  references the objects instead of inlining them; `errorObjectSchemas` gives the objects to place
  there, for example in `components.schemas`. Under `jsonApi({ mixedEntries: true })` the 400 and 500
  responses of each operation carry the objects of most of its codes, so an OpenAPI document of many
  operations repeated every object many times; it now holds each once. `ErrorFormat` gains the
  optional `objectSchema(definition, ctx)` beside `mixedSchema`, which the JSON:API format defines
  when `mixedEntries` is on, and `SchemaContext` the optional `objectRef`. A response description
  names a description several entries share once, where it repeated it before.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`a2ded61`](https://github.com/nizam-os/kit-ts/commit/a2ded61e43cefd3157c1a1f0e0ffd26237d501cf) Thanks [@ali-issa](https://github.com/ali-issa)! - `readPostgresFields` returns `dataType`, the domain named by a violated domain constraint
  (PostgreSQL error field `d`), read from `dataType` or postgres.js's `data type_name`. A field that
  is not a string, such as the number Bun puts on `column` when the server sent none, reads as
  undefined.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`3ad2c60`](https://github.com/nizam-os/kit-ts/commit/3ad2c60449ed8d0d974cf036cf292cd47e7efc51) Thanks [@ali-issa](https://github.com/ali-issa)! - `errorResponses` takes `responseRef`, where the document holds each entry's response, and then gives
  a status that carries one entry as a Reference Object to that response instead of inlining it;
  `errorResponseObjects` gives the responses to place there, for example in `components.responses`. A
  document of many operations repeated the response of each 404 or 409 that carries one code on every
  operation; it now holds each once. A status that combines entries, such as the 400 and the 500 under
  `jsonApi({ mixedEntries: true })`, stays inline. Without `responseRef` the result keeps its type,
  `Record<string, ResponseObject>`; with it, each value is a `ResponseObject` or a new
  `ReferenceObject`. `ResponseObject` and `MediaTypeObject` are now object types, so a document
  builder that types its components with specification extensions, such as `openapi3-ts`, accepts
  them.

### Patch Changes

- [#191](https://github.com/nizam-os/kit-ts/pull/191) [`ebbd31f`](https://github.com/nizam-os/kit-ts/commit/ebbd31fddc3a17e259958e2397ec93bf4f6fd154) Thanks [@ali-issa](https://github.com/ali-issa)! - Declarations that compile without the DOM library. Every `headers` option named `HeadersInit`, an
  alias only TypeScript's DOM library declares: Node's types declare `Headers` but not the alias, so a
  Node application without `lib: ["dom"]` got TS2304 in the packages' declarations, or read each
  `headers` option as `any` where it skipped checking them. `@nizam-os/ban-core` and
  `@nizam-os/jsonapi-client` now vendor the Fetch Standard's `HeadersInit` as the DOM library types
  it, and `@nizam-os/jsonapi-core` types an error's `headers` as `BanErrorOptions['headers']`. Every
  value the DOM library's alias accepts is still accepted.
