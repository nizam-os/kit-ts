# @nizam-os/ban-core

Structured, extensible HTTP errors for any JavaScript runtime that speaks `fetch`. One API for
creating errors, one handler that turns anything thrown into a well-formed response, and pluggable
wire formats: RFC 9457 Problem Details, JSON:API, Google's AIP-193, and Stripe's error object are
built in, and your own shape is a `defineFormat` call away. No dependencies, no peer dependencies,
web standards only.

Using Hono?
[@nizam-os/hono-ban](https://github.com/nizam-os/kit/tree/main/packages/hono-ban#readme) is this
package plus `app.onError()` wiring and `HTTPException` adoption, under the same subpaths.

## Install

```bash
pnpm add @nizam-os/ban-core
```

Node 22.12+, Bun, Deno, and Cloudflare Workers are supported. CI runs the unit and end-to-end suites
on Node 22 and 24 and a smoke test of every subpath on Bun, Deno, and workerd.

## Quick start

```ts
import { createBan, fromRequest } from '@nizam-os/ban-core';

const ban = createBan();
const handle = ban.handler();

async function route(request: Request): Promise<Response> {
  const id = new URL(request.url).pathname.slice('/orders/'.length);
  const order = await orders.find(id);
  if (!order) {
    throw ban.notFound(`Order ${id} does not exist`);
  }
  return Response.json(order);
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await route(request);
    } catch (thrown) {
      return handle(thrown, fromRequest(request));
    }
  },
};
```

```http
HTTP/1.1 404 Not Found
Content-Type: application/problem+json
Cache-Control: no-store
X-Error-Id: 6f1c2f0e-...

{
  "type": "about:blank",
  "status": 404,
  "title": "Not Found",
  "detail": "Order 42 does not exist",
  "instance": "/orders/42",
  "code": "NOT_FOUND",
  "id": "6f1c2f0e-..."
}
```

`ban.handler()` takes the thrown value, the request facts (`method`, `path`, and a `header()`
lookup; `fromRequest` reads them from a fetch `Request`), and an optional context of your own that
every callback receives (`ban.handler<MyContext>()`). It resolves to a `Response` for every value,
`Error` or not, never throws, and hides anything it does not recognize behind a constant 500.

### Guard and narrow

```ts
import { assert } from '@nizam-os/ban-core';

const order = await orders.find(id);
assert(order, () => ban.notFound(`Order ${id} does not exist`));
order.total; // narrowed: Order
```

Factories return errors and never throw them, so a bare `ban.notFound()` statement is a no-op. The
`no-unused-expressions` rule (ESLint core, typescript-eslint, oxlint) flags the missing `throw`.

### Your own errors

```ts
const ban = createBan({
  docsBaseUrl: 'https://api.example.com/errors',
  errors: {
    ORDER_CONFLICT: { status: 409, title: 'Order Conflict' },
    PLAN_LIMIT_REACHED: { status: 402, title: 'Plan Limit Reached' },
  },
});

throw ban.ORDER_CONFLICT({
  detail: `Order ${id} was modified by another request`,
  meta: { orderId: id },
});
```

### Several problems at once

Every factory accepts `errors`, a list of items with a `detail` and, when they describe an input, a
`location` and a `path`. The active format decides how the list appears: Problem Details and plain
render an `errors` array, JSON:API one error object per item with `source.pointer`, Google API a
`BadRequest` payload, Stripe the first item's `param`.

```ts
throw ban.badRequest('Two fields are wrong', {
  errors: [
    { detail: 'The customer does not exist', path: ['customerId'], location: 'body' },
    { detail: 'The coupon has expired', path: ['coupon'], location: 'body' },
  ],
});
```

`ban.validation(issues, { location })` builds that list from validator issues (see Validation
below). For JSON:API documents that combine entries with different statuses,
`jsonApi({ mixedEntries: true })` renders each item's own `status`, `code`, and `title`, and
`responseStatus(errors)` picks the response status the way the specification asks:

```ts
import { jsonApi, responseStatus } from '@nizam-os/ban-core/formats/json-api';

const ban = createBan({ format: jsonApi({ mixedEntries: true }) });
const errors = [
  { status: 404, code: 'AUTHOR_NOT_FOUND', title: 'Author Not Found', detail: 'No author 7' },
  { status: 422, code: 'TITLE_REQUIRED', title: 'Title Required', detail: 'Give it a title' },
] as const;
throw ban.fromStatus(responseStatus(errors) ?? 400, { errors }); // 400 with two error objects
```

### Adopt another framework's exceptions

`createBan({ adopt })` recognizes thrown values that already describe an HTTP outcome, ahead of
`map` and inside `ban.from()` too; what it returns counts as handled rather than unexpected.
`ban.fromStatus()` picks the catalog entry for a status. This is how `@nizam-os/hono-ban` recognizes
`HTTPException`; the same shape serves any router that throws its own class:

```ts
const ban = createBan({
  adopt: (value, ban) =>
    value instanceof UpstreamError
      ? ban.fromStatus(value.status, { detail: value.message, cause: value })
      : undefined,
});
```

### Errors from another copy of the package

A package manager installs a second copy of `@nizam-os/ban-core` when two packages that depend on it
ask for ranges that cannot meet, such as `^0.1.0` and `^0.2.0`. Each `BanError` carries a brand from
the global symbol registry, so `isBanError` and `instanceof BanError` recognize an error another
copy built, and your handler answers it with its own status, code, and items instead of a 500
([ADR 0019](https://github.com/nizam-os/kit/blob/main/docs/ban/adr/0019-a-ban-error-is-recognized-across-copies-by-a-registered-brand.md)).
A copy whose errors have another shape is not recognized, so keep one copy where you can:
`npm ls @nizam-os/ban-core` (or `pnpm why`) shows each, and upgrading the `@nizam-os` packages
together keeps their ranges meeting.

### Database errors

`@nizam-os/ban-core/postgresql` maps a Postgres driver error to a catalog entry by SQLSTATE with
constant client-facing text. It recognizes the errors of node-postgres, postgres.js, PGlite, Neon,
and Bun, thrown directly or wrapped by Drizzle, Kysely, TypeORM, MikroORM, Slonik, or Sequelize:

```ts
import { postgresMapper } from '@nizam-os/ban-core/postgresql';

const ban = createBan({
  map: postgresMapper({
    constraints: {
      users_email_key: { issue: { path: ['email'], message: 'That email is already registered' } },
      orders_customer_id_fkey: 'The customer does not exist',
    },
    columns: { 'users.email': { issue: { path: ['email'], message: 'Email is required' } } },
    codes: { '42501': { key: 'FORBIDDEN' } },
    retryAfter: 1,
  }),
});
```

A unique violation is a 409, a not-null or check violation a 422, a serialization failure or a
deadlock a 503 with `Retry-After`. `constraints` and `columns` refine the wording per constraint
name or `table.column`, or turn the violation into a validation error with one issue at a path, the
shape a form already handles; `codes` overrides the entry per SQLSTATE or class. Nothing from the
driver's message, detail, or hint reaches a body: the driver error stays on the report as
`report.error.cause`, and `findPostgresError(report.cause)` reads it out of any wrapper. Codes with
no row, such as a syntax error, a missing table, or a `RAISE EXCEPTION`, fall through to the
constant 500 with `handled: false`. The full table and the precedence rules are in SPEC section
6.10.

How each driver's support is verified (versions are the pins in `e2e/ban/package.json`; the dated
matrix is in ADR 0015):

| Driver or ORM                                | Verified by                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| node-postgres (`pg`)                         | Real server errors over the wire protocol (PGlite behind `pglite-socket`) in the e2e suite |
| postgres.js (`postgres`)                     | The same, plus a type-level check of its error type against the mapper's input type        |
| PGlite                                       | Real server errors in-process in the e2e suite                                             |
| Drizzle                                      | Real server errors through its wrapper in the e2e suite                                    |
| Neon, Bun SQL, Sequelize 6                   | Error shapes built from the driver source, driven over HTTP                                |
| Kysely, TypeORM, MikroORM, Slonik, Objection | Source inspection of how each rethrows or wraps the driver error (ADR 0015)                |

To put an application-authored `RAISE` message on the wire, compose your own `map`:

```ts
import { findPostgresError, postgresMapper } from '@nizam-os/ban-core/postgresql';

const postgres = postgresMapper();
const ban = createBan({
  map: (thrown, ban) => {
    const error = findPostgresError(thrown);
    if (error?.code === 'P0001' && error instanceof Error) {
      return ban.badRequest(error.message, { cause: thrown });
    }
    return postgres(thrown, ban);
  },
});
```

`readPostgresFields(error)` reads the fields such a `map` needs in every driver's spelling:
`{ sqlstate, errorClass, constraint, table, schema, column, dataType }`. A violated domain CHECK has
no table or column; `dataType` names the domain.

### Headers some statuses require

HTTP makes the application, not the library, responsible for a few headers: a 401 MUST carry
`WWW-Authenticate`, a 405 MUST carry `Allow`, a 407 MUST carry `Proxy-Authenticate`, and a 429 or
503 may suggest `Retry-After`. Pass them through `headers`; an adopted framework exception keeps the
headers it carried. `bearerChallenge()` builds the RFC 6750 value, validates every attribute against
its grammar, and knows RFC 9728 `resource_metadata` for OAuth-protected resources.

```ts
import { bearerChallenge } from '@nizam-os/ban-core';

throw ban.methodNotAllowed({ headers: { Allow: 'GET, HEAD' } });
throw ban.unauthorized({
  headers: {
    'WWW-Authenticate': bearerChallenge({
      realm: 'api',
      error: 'invalid_token',
      errorDescription: 'The access token expired',
      resourceMetadata: 'https://api.example.com/.well-known/oauth-protected-resource',
    }),
  },
});
throw ban.tooManyRequests({ headers: { 'Retry-After': '30' } });
```

The full table with RFC references is in
[`docs/ban/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/ban/SPEC.md) section 3.1.

### Pick a format

```ts
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';

const ban = createBan({ format: jsonApi() });
```

```http
HTTP/1.1 409 Conflict
Content-Type: application/vnd.api+json

{
  "errors": [
    {
      "id": "6f1c2f0e-...",
      "status": "409",
      "code": "ORDER_CONFLICT",
      "title": "Order Conflict",
      "detail": "Order 42 was modified by another request",
      "links": { "type": "https://api.example.com/errors/ORDER_CONFLICT" },
      "meta": { "orderId": "42" }
    }
  ]
}
```

`googleApi()` renders the AIP-193 shape Google's APIs use. It needs the `ErrorInfo.domain` AIP-193
requires; `status` comes from the catalog code when it names a `google.rpc.Code`, else from the HTTP
status, and `rpcCodes` overrides it per code. `meta` becomes `ErrorInfo.metadata`, whose keys must
match `[a-z][a-zA-Z0-9-_]+` and stay under 64 characters (`error_details.proto`); a key outside that
grammar (`order.id`, `UserId`) is dropped rather than sent.

```ts
import { googleApi } from '@nizam-os/ban-core/formats/google-api';

const ban = createBan({
  format: googleApi({ domain: 'orders.example.com' }),
  docsBaseUrl: 'https://api.example.com/errors',
});
```

```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": {
    "code": 404,
    "message": "Order 42 does not exist",
    "status": "NOT_FOUND",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        "reason": "NOT_FOUND",
        "domain": "orders.example.com"
      },
      { "@type": "type.googleapis.com/google.rpc.RequestInfo", "requestId": "6f1c2f0e-..." },
      {
        "@type": "type.googleapis.com/google.rpc.Help",
        "links": [
          {
            "description": "Documentation for NOT_FOUND errors",
            "url": "https://api.example.com/errors/NOT_FOUND"
          }
        ]
      }
    ]
  }
}
```

`stripe()` renders Stripe's error object, the most copied envelope in commercial APIs. The shape has
no member for `meta`, the trace id, or the error id, which stays in the `X-Error-Id` header; a
validation error carries its first issue as `param`.

```ts
import { stripe } from '@nizam-os/ban-core/formats/stripe';

const ban = createBan({ format: stripe(), docsBaseUrl: 'https://api.example.com/errors' });
```

```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": {
    "code": "not_found",
    "doc_url": "https://api.example.com/errors/NOT_FOUND",
    "message": "Order 42 does not exist",
    "type": "invalid_request_error"
  }
}
```

### Define your own format

`defineFormat` takes a renderer and the JSON Schema that describes it. This one answers OAuth 2.0
token endpoint errors (RFC 6749 section 5.2): the catalog `code` is the OAuth error code, `detail`
becomes `error_description`, and `type` becomes `error_uri`. The end-to-end suite serves this exact
definition and checks it against its own schema.

```ts
import { createBan, defineFormat } from '@nizam-os/ban-core';

const oauth = defineFormat({
  name: 'oauth',
  contentType: 'application/json',
  render: (error) => ({
    error: error.code,
    ...(error.detail === undefined ? {} : { error_description: error.detail }),
    ...(error.type === undefined ? {} : { error_uri: error.type }),
  }),
  schema: (definition, ctx) => ({
    type: 'object',
    required: ['error'],
    properties: {
      error:
        ctx.dialect === 'openapi-3.0' ? { enum: [definition.code] } : { const: definition.code },
      error_description: { type: 'string' },
      error_uri: { type: 'string', format: 'uri-reference' },
    },
    additionalProperties: false,
  }),
});

const token = createBan({
  format: oauth,
  validationKey: 'INVALID_REQUEST',
  errors: {
    INVALID_REQUEST: { status: 400, code: 'invalid_request', title: 'Invalid Request' },
    INVALID_CLIENT: { status: 401, code: 'invalid_client', title: 'Invalid Client' },
    INVALID_GRANT: { status: 400, code: 'invalid_grant', title: 'Invalid Grant' },
  },
});

throw token.INVALID_GRANT('The refresh token has expired');
// 400 {"error":"invalid_grant","error_description":"The refresh token has expired"}
```

### Validation

`@nizam-os/ban-core/zod`, `@nizam-os/ban-core/valibot`, and `@nizam-os/ban-core/standard-schema`
convert a validator's failure into `ban.validation()`: `fromZodError(ban, error, location)`,
`fromValibotIssues(ban, issues, location)`, `fromIssues(ban, issues, location)`, and `toIssues()`
for the raw list. Each also exports `hook(ban)`, a function that takes a
`{ success, target, error | issues }` result (the shape the `@hono/*` validator middleware passes)
and throws the validation error, so the hooks work unchanged through `@nizam-os/hono-ban` and with
anything that produces the same result object.

```ts
import { fromZodError } from '@nizam-os/ban-core/zod';

const parsed = OrderInput.safeParse(await request.json());
if (!parsed.success) {
  throw fromZodError(ban, parsed.error, 'body');
}
```

```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{
  "type": "about:blank",
  "status": 422,
  "title": "Validation Failed",
  "detail": "Request validation failed",
  "instance": "/orders",
  "code": "VALIDATION_FAILED",
  "id": "6f1c2f0e-...",
  "location": "body",
  "errors": [{ "location": "body", "pointer": "/email", "detail": "Invalid email address", "code": "invalid_format" }]
}
```

### OpenAPI

`@nizam-os/ban-core/openapi` turns the active format's schemas into OpenAPI Response Objects, so the
documented body is the rendered body:

```ts
import { errorResponses, validationResponse } from '@nizam-os/ban-core/openapi';

const responses = {
  200: { description: 'Order', content: { 'application/json': { schema: OrderSchema } } },
  ...errorResponses(ban, [401, 404, 'ORDER_CONFLICT']),
  422: validationResponse(ban),
};
```

Pass `{ dialect: 'openapi-3.0' }` for 3.0 documents, which predate `const`.

List every code an operation can send. With `jsonApi({ mixedEntries: true })` one document may
combine them, and `errorResponses` describes those documents too: each status admits the objects of
its own codes, 400 also every client-error code once they span two statuses, and 500 every code once
a server error is among them, which is how `responseStatus` picks the status of a combined document.
Each object stays pinned to one entry's `status` and `code`; its `title` may be localized (see
Localize or redact).

Those responses repeat the object of every code they may carry, and 400 and 500 carry most of them,
so in a document of many operations, place each object once and reference it. `objectRef` says where
an entry's object lives; `errorObjectSchemas` gives the objects to put there:

```ts
import { errorObjectSchemas, errorResponses } from '@nizam-os/ban-core/openapi';

const codes = ['QUERY_INVALID', 'ID_REFUSED', 'TYPE_CONFLICT', 'STORE_DOWN'];
const name = (key: string) => `Error.${key}`;
const objectRef = (key: string) => `#/components/schemas/${name(key)}`;

const document = {
  openapi: '3.1.2',
  info: { title: 'Reports', version: '1' },
  paths: {
    '/reports': { get: { responses: errorResponses(ban, codes, { objectRef }) } },
  },
  components: {
    schemas: Object.fromEntries(
      Object.entries(errorObjectSchemas(ban, codes)).map(([key, schema]) => [name(key), schema]),
    ),
  },
};
```

Map keys to names the same way in both places. Component names must match `^[a-zA-Z0-9.\-_]+$`, and
a catalog key can be any string, so encode keys that might not. Both helpers throw `TypeError` for a
format that does not combine entries, whose responses have no objects to share.

A status that carries one code answers the same in every operation that lists it, so place that
response once too, with any format. `responseRef` says where an entry's response alone lives, and
`errorResponseObjects` gives the responses to put there; a status that carries several codes, such
as a combined 400 or 500, stays inline:

```ts
import {
  errorObjectSchemas,
  errorResponseObjects,
  errorResponses,
} from '@nizam-os/ban-core/openapi';

const responseRef = (key: string) => `#/components/responses/${name(key)}`;
const named = <T>(entries: Record<string, T>) =>
  Object.fromEntries(Object.entries(entries).map(([key, value]) => [name(key), value]));

const document = {
  openapi: '3.1.2',
  info: { title: 'Reports', version: '1' },
  paths: {
    '/reports': { get: { responses: errorResponses(ban, codes, { objectRef, responseRef }) } },
  },
  components: {
    schemas: named(errorObjectSchemas(ban, codes)),
    responses: named(errorResponseObjects(ban, codes, { objectRef })),
  },
};
```

### Observe

```ts
import { trace } from '@opentelemetry/api';

import { traceIdFromOtel } from '@nizam-os/ban-core/otel';

interface RequestContext {
  readonly tenant: string;
}

const handle = ban.handler<RequestContext>({
  traceId: traceIdFromOtel(trace), // default: W3C traceparent header
  onReport: (report, ctx) => {
    logger.error({ err: report.cause, tenant: ctx.tenant, ...report.context }, report.error.title);
  },
});

// handle(thrown, fromRequest(request), { tenant })
```

Every response carries `X-Error-Id`; the same id is in the report and, for every built-in format
except Stripe (whose shape has no member for it), in the body. `X-Request-Id` is echoed into the
report when the client sent a well-formed one; it is never fabricated.

### Localize or redact

`transform` post-processes the rendered body. RFC 9457 lets `title` vary between occurrences only
for localization, and the catalog fixes it otherwise, so this is where a translation happens; set
`Content-Language` yourself through `headers`.

```ts
const handle = ban.handler<{ language: string }>({
  transform: (body, error, ctx) =>
    typeof body === 'object' && body !== null
      ? { ...body, title: t(ctx.language, error.code) }
      : body,
});
```

The published schemas document `title` as any string, with the catalog's title as the example, and
keep `status` and `code` pinned, so a localized body still matches the response its route documents.
Under `jsonApi()` the titles sit in each object of `errors`, and the document is closed, so localize
them there rather than adding a top-level `title`.

### Test

`@nizam-os/ban-core/testing` has `expectBanError(value, { status, code, detail })` for asserting on
what a handler received, `renderError(ban, error)` for reproducing a body without a request, and
`assertFormatConformance(format, ban.catalog, { compile })` for proving a custom format's bodies
match its schemas, with any JSON Schema 2020-12 compiler.

## Modules

| Import                                                                                                                                                                                           | What it gives you                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nizam-os/ban-core`                                                                                                                                                                              | `createBan`, `assert`, `defineFormat`, `fromRequest`, `bearerChallenge`, `isErrorStatus`, `BanError`, `isBanError`, `problemDetails`, `BUILTIN_CATALOG`, `parseTraceparent`, pointer helpers |
| `@nizam-os/ban-core/formats/problem-details`, `@nizam-os/ban-core/formats/json-api`, `@nizam-os/ban-core/formats/plain`, `@nizam-os/ban-core/formats/google-api`, `@nizam-os/ban-core/formats/stripe` | the built-in wire formats; `json-api` also exports `responseStatus`                                                                                                                          |
| `@nizam-os/ban-core/zod`, `@nizam-os/ban-core/valibot`, `@nizam-os/ban-core/standard-schema`                                                                                                        | validator hooks and issue converters                                                                                                                                                         |
| `@nizam-os/ban-core/openapi`                                                                                                                                                                      | `errorResponses`, `errorResponseObjects`, `errorObjectSchemas`, `errorResponse`, `errorSchema`, `validationResponse`, `validationSchema`                                                     |
| `@nizam-os/ban-core/otel`                                                                                                                                                                         | `traceIdFromOtel`                                                                                                                                                                            |
| `@nizam-os/ban-core/postgresql`                                                                                                                                                                   | `postgresMapper`, `findPostgresError`, `readPostgresFields`                                                                                                                                  |
| `@nizam-os/ban-core/testing`                                                                                                                                                                      | `expectBanError`, `renderError`, `assertFormatConformance`                                                                                                                                   |

Other databases go through `createBan({ map })` the same way `@nizam-os/ban-core/postgresql` does:
catalog entries with constant client-facing messages, never the driver's own text (a driver's detail
line can contain the failing row).

## Documentation

- [`docs/ban/DESIGN.md`](https://github.com/nizam-os/kit/blob/main/docs/ban/DESIGN.md): goals,
  the full API, architecture, security defaults, and roadmap
- [`docs/ban/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/ban/SPEC.md): the normative
  implementation specification (exact types, catalog, rendering rules, handler algorithm, validator
  mappings, packaging, test plan)
- [`docs/ban/adr/`](https://github.com/nizam-os/kit/blob/main/docs/ban/adr/): architecture
  decision records
- [`CONTRIBUTING.md`](https://github.com/nizam-os/kit/blob/main/CONTRIBUTING.md): setup, quality
  gates, release process

## Why

Without a contract, error bodies drift: `{ message }` here, `{ error }` there, a Zod issue array
somewhere else, and an OpenAPI document that describes none of them. @nizam-os/ban-core gives every
error one shape, one id, and one place to observe it, while letting you choose which standard that
shape follows, and it does so without binding you to a framework.

- **Typed catalog.** Every standard 4xx and 5xx status has a factory (`ban.notFound()`), and your
  own domain errors join the catalog with full inference (`ban.ORDER_CONFLICT()`).
- **Formats are pluggable.** `problemDetails()` (RFC 9457), `jsonApi()`, `googleApi()` (AIP-193),
  `stripe()`, `plain()`, or `defineFormat()` with a schema and a renderer. The schema drives
  OpenAPI; the renderer drives the wire. They cannot disagree.
- **A handler that cannot misbehave.** `ban.handler()` never throws, runs once per error, marks
  error responses `Cache-Control: no-store` unless you set one, caps body size, and never puts
  server internals in a response.
- **Validation done once.** Zod, Valibot, and any Standard Schema validator normalize issues into
  error items, then the active format renders them.
- **Observability built in.** One `ErrorReport` per error with the same id the client received, the
  request id, and the trace id. Plug in pino, Sentry, or OpenTelemetry in a few lines.
- **Runs everywhere.** Web standards only; no `process.env`, no Node-only APIs, no dependencies.
  ESM. The Zod, Valibot, Standard Schema, and OpenTelemetry modules are typed structurally and never
  import those packages.

## License

[MIT](./LICENSE)
