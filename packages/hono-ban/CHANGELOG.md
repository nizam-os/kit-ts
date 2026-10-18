# @nizam-os/hono-ban

## 2.0.0

### Major Changes

- @nizam-os/hono-ban 2.0 is the Hono adapter for `@nizam-os/ban-core`, which now holds everything that
  does not need Hono. Every subpath keeps its name and exports (`@nizam-os/hono-ban/formats/json-api`
  is `@nizam-os/ban-core/formats/json-api`), `createBan` keeps `ban.onError()` for `app.onError()`,
  and the callbacks still receive the Hono `Context`. The root also exports `fromHttpException` and
  the core's new members (`ban.handler`, `fromRequest`, `isErrorStatus`, `ban.fromStatus`,
  `createBan({ adopt })`).
  
  Breaking changes:
  
  - `BanError` extends `Error`, not `HTTPException`. Hono middleware that throws `HTTPException` is
    still mapped into the catalog, now through the `adopt` hook (`fromHttpException`), with the same
    rules for status, message, `MALFORMED_JSON`, and response headers. A `BanError` that escapes
    without `app.onError(ban.onError())` is answered by Hono's default 500; code that relied on
    `instanceof HTTPException` must use `isBanError()`.
  - `status` fields are typed `ErrorStatusCode` (registered 4xx and 5xx) instead of
    `ContentfulStatusCode`; a non-standard status such as 499 needs an `ErrorStatusCode` cast.
  - `error.issues` is `error.errors`, a list of `ErrorItem` (`message` became `detail`, `code` became
    `reason`); every factory accepts `errors`, and `ban.validation()` defaults `detail` to
    `'Request validation failed'`.
  - Custom formats implement `renderErrors` and `errorsSchema` instead of `renderValidation` and
    `validationSchema`; `ValidationEntry` is `ErrorEntry` with `location` optional.
  - An `HTTPException` outside the 4xx and 5xx classes (a thrown redirect) is answered with its own
    response by `onError`, as Hono's default handler does, instead of being rendered as an error.
  - The catalog key `onError` is reserved, as before; `handler` and `fromStatus` are reserved too.
  
  Wire bodies for the built-in formats are unchanged for single errors and validation errors.
  
  This is the first release under the `@nizam-os` scope. Releases before 2.0.0 were published as
  `hono-ban`, without the scope; that name stays at 1.x and is deprecated in favor of
  `@nizam-os/hono-ban`.

### Minor Changes

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

- [#154](https://github.com/nizam-os/kit-ts/pull/154) [`dbc48f5`](https://github.com/nizam-os/kit-ts/commit/dbc48f52ced0d7f864d454a640446b1449fb44a6) Thanks [@ali-issa](https://github.com/ali-issa)! - Requires `hono` 4.13.7 or later, the first release no published Hono advisory affects. 4.13.5 fixes
  GHSA-crvj-82cr-hjcx (the query parser reads parameters after a URL fragment), GHSA-g6gw-c38x-mqfc
  (unbounded dot-notation nesting in `parseBody()`), and GHSA-gqvv-2mrq-wpjv (`toSSG()` writes outside
  its output directory); 4.13.7 fixes GHSA-hxh3-vqpv-xpqv (`hono/jsx` renders plain strings unescaped
  in boundary components). None of these packages calls those helpers, but each runs on the
  application's own Hono, so its peer range no longer admits an affected release.

### Patch Changes

- Updated dependencies [[`890844a`](https://github.com/nizam-os/kit-ts/commit/890844ae14747d4b64a38061cd31fd03484c108d), [`2ff6270`](https://github.com/nizam-os/kit-ts/commit/2ff6270ed3751cc04cafc4aeaf4d31cf6e0291b2), [`50b1e6a`](https://github.com/nizam-os/kit-ts/commit/50b1e6a32cb2c1bf6f95c1df4f9304da114f27dd), [`eeff0dd`](https://github.com/nizam-os/kit-ts/commit/eeff0dd61a32580458e85d5c22501e77210e079d), [`a2ded61`](https://github.com/nizam-os/kit-ts/commit/a2ded61e43cefd3157c1a1f0e0ffd26237d501cf), [`3ad2c60`](https://github.com/nizam-os/kit-ts/commit/3ad2c60449ed8d0d974cf036cf292cd47e7efc51), [`ebbd31f`](https://github.com/nizam-os/kit-ts/commit/ebbd31fddc3a17e259958e2397ec93bf4f6fd154)]:
  - @nizam-os/ban-core@1.0.0

## 1.3.0

### Minor Changes

- [`dd1a1b1`](https://github.com/nizam-os/kit-ts/commit/dd1a1b1188aa722d263ab8592c26e1f097b63a51) Thanks [@ali-issa](https://github.com/ali-issa)! - `ban.validation()` accepts `cause`, and `hono-ban/postgresql` keeps its reporting contract for every
  mapping kind.

  - `ValidationOptions` gains an optional `cause`, stored on the error like every other `cause` and
    never rendered, so a converted validator or driver failure reaches `ErrorReport.error.cause`.
  - `postgresMapper()` passes the driver error as `cause` for `{ issue }` mappings too. Previously an
    ordinary mapping put it on `report.error.cause` and an issue mapping left that member undefined.
  - `postgresMapper()` reads `codes` entries as own properties, like `constraints` and `columns`, and
    rejects a `retryAfter` above `Number.MAX_SAFE_INTEGER`, whose `String()` form is exponential and
    not RFC 9110 `delay-seconds`.

## 1.2.0

### Minor Changes

- [`4a17ce0`](https://github.com/nizam-os/kit-ts/commit/4a17ce0676177c9ceff6f877731ab8f7ce513e2b) Thanks [@ali-issa](https://github.com/ali-issa)! - Add `hono-ban/postgresql`: `postgresMapper(options?)` turns a Postgres driver error into a catalog
  entry by SQLSTATE with constant client-facing text, for `createBan({ map })` or
  `ban.onError({ map })`.

  - Recognizes the errors of node-postgres, PGlite, postgres.js, Neon, and Bun, directly or through
    the `cause` of an ORM wrapper such as Drizzle's `DrizzleQueryError` (also Sequelize 6 `original`
    and Objection `nativeError`). Nothing from the driver's `message`, `detail`, or `hint` reaches
    `detail`, `meta`, or `headers`; the driver error stays on the report.
  - Built-in table: unique, exclusion, foreign key, and restrict violations are 409; not-null, check,
    and data exceptions are 422; serialization failures, deadlocks, `NOWAIT` locks, read-only
    replicas, and the connection, resource, and operator classes are 503, with `Retry-After` when
    `retryAfter` is set. Codes with no row (syntax, privilege, `RAISE`, statement timeout, commit
    outcome unknown) fall through to the handler's constant 500 with `handled: false`.
  - `constraints`, `columns`, and `codes` override the entry, detail, meta, and headers per constraint
    name, `table.column`, SQLSTATE, or class; a constraint or column can instead map to a validation
    error with one issue at a path.
  - `findPostgresError(value)` and `readPostgresFields(error)` are exported for `onReport` sinks.

## 1.1.0

### Minor Changes

- [`95a62e1`](https://github.com/nizam-os/kit-ts/commit/95a62e17f663f5f30522eda7fb76d4ef63b3487c) Thanks [@ali-issa](https://github.com/ali-issa)! - Validate options at construction instead of producing broken responses.

  - `problemDetails()` throws `TypeError` when `traceIdMember` names a reserved member (`status`,
    `id`, `errors`, ...) or is not an RFC 9457 extension member name; `jsonApi()` rejects a
    `traceIdMetaKey` the format writes itself (`stack`, `location`, `code`, ...) or that is not a
    JSON:API member name; `googleApi()` rejects a `traceIdMetadataKey` outside the
    `ErrorInfo.metadata` key grammar. Previously `traceIdMember: 'status'` replaced the numeric status
    with the trace id.
  - `ban.onError()` throws `TypeError` when `errorIdHeader`, `requestIdHeader`, or `headers` holds a
    name or value `Headers` rejects. Previously the failure surfaced inside the handler's last-resort
    fallback and the handler rejected.
  - `googleApi()` drops `meta` keys that do not match `[a-z][a-zA-Z0-9-_]+` or exceed 64 characters,
    as `error_details.proto` requires for `ErrorInfo.metadata`, and the 2020-12 schema states the rule
    with `propertyNames`. Keys such as `order.id` or `UserId` were previously sent as-is.

### Patch Changes

- [`95a62e1`](https://github.com/nizam-os/kit-ts/commit/95a62e17f663f5f30522eda7fb76d4ef63b3487c) Thanks [@ali-issa](https://github.com/ali-issa)! - Keep every rendered validation body inside its own schema and the handler inside its guarantee.

  - `jsonApi()` renders one summary error object for `ban.validation([])` instead of an empty `errors`
    array its schema rejects; `googleApi()` omits `BadRequest` when there are no issues instead of
    sending an empty `fieldViolations`.
  - `assertFormatConformance` from `hono-ban/testing` now also renders a validation error with no
    issues per location.
  - `ban.onError()` gains a third fallback tier: when the header merge itself throws, the response
    still carries `Content-Type`, `Cache-Control: no-store`, and the error id header.

## 1.0.0

### Major Changes

- [`efcb0b6`](https://github.com/nizam-os/kit-ts/commit/efcb0b6bd24a598bf0e8868bff9942ec248a7868) Thanks [@ali-issa](https://github.com/ali-issa)! - First 1.0 release. `createBan()` builds a typed error catalog with a factory per IANA status and per
  custom entry, `ban.onError()` renders every thrown value once through a pluggable format (RFC 9457
  Problem Details by default; JSON:API, Google API (AIP-193), Stripe, and plain built in;
  `defineFormat()` for your own), validator hooks for Zod, Valibot, and Standard Schema throw into the
  handler, `hono-ban/openapi` derives response schemas from the active format, and `hono-ban/otel`
  adds trace ids. Error responses carry `Cache-Control: no-store` unless you set one, and
  `bearerChallenge()` builds RFC 6750 and RFC 9728 `WWW-Authenticate` values. `hono` is the only peer
  dependency.

## 1.0.0-alpha.1

### Major Changes

- First 1.0 release. `createBan()` builds a typed error catalog with a factory per IANA status and per
  custom entry, `ban.onError()` renders every thrown value once through a pluggable format (RFC 9457
  Problem Details by default; JSON:API, Google API (AIP-193), Stripe, and plain built in;
  `defineFormat()` for your own), validator hooks for Zod, Valibot, and Standard Schema throw into the
  handler, `hono-ban/openapi` derives response schemas from the active format, and `hono-ban/otel`
  adds trace ids. Error responses carry `Cache-Control: no-store` unless you set one, and
  `bearerChallenge()` builds RFC 6750 and RFC 9728 `WWW-Authenticate` values. `hono` is the only peer
  dependency.

Release notes are generated by [Changesets](https://github.com/changesets/changesets) from the
entries in `.changeset/` when a version PR is merged.
