# @nizam-os/hono-ban

Structured, extensible HTTP errors for [Hono](https://hono.dev), built on
[@nizam-os/ban-core](https://github.com/nizam-os/kit/tree/main/packages/ban-core#readme). One API
for creating errors, one `onError` handler, and pluggable wire formats: RFC 9457 Problem Details,
JSON:API, Google's AIP-193, and Stripe's error object are built in, and your own shape is a
`defineFormat` call away.

@nizam-os/hono-ban is the Hono adapter: everything that does not need Hono lives in
`@nizam-os/ban-core`, which it re-exports under the same subpaths, and its `createBan` adds
`onError` for `app.onError()` and adopts Hono's `HTTPException`. Code that needs the same errors
outside Hono imports `@nizam-os/ban-core`.

## Install

```bash
pnpm add @nizam-os/hono-ban hono
```

`@nizam-os/ban-core` comes along as a dependency.

`hono >= 4.13.7` is the only peer dependency, the first release no published Hono advisory affects:
an affected Hono in your application is an unmet peer dependency. Node 22.12+, Bun, Deno, and
Cloudflare Workers are supported. CI runs the unit and end-to-end suites on Node 22 and 24, the unit
suite on Hono 4.13.7, and a smoke test of every subpath on Bun, Deno, and workerd.

## Quick start

```ts
import { Hono } from 'hono';

import { createBan } from '@nizam-os/hono-ban';

const ban = createBan();

const app = new Hono();
app.onError(ban.onError());

app.get('/orders/:id', async (c) => {
  const order = await orders.find(c.req.param('id'));
  if (!order) {
    throw ban.notFound(`Order ${c.req.param('id')} does not exist`);
  }
  return c.json(order);
});
```

```http
HTTP/1.1 404 Not Found
Content-Type: application/problem+json
X-Error-Id: 6f1c2f0e-...

{
  "type": "about:blank",
  "status": 404,
  "title": "Not Found",
  "detail": "Order 42 does not exist",
  "instance": "/orders/42",
  "id": "6f1c2f0e-..."
}
```

Install the handler: Hono answers a thrown `BanError` with its own plain 500 otherwise, as it does
for any other `Error`.

### Guard and narrow

```ts
import { assert } from '@nizam-os/hono-ban';

const order = await orders.find(id);
assert(order, () => ban.notFound(`Order ${id} does not exist`));
order.total; // narrowed: Order
```

Factories return errors and never throw them, so a bare `ban.notFound()` statement is a no-op. The
`no-unused-expressions` rule (ESLint core, typescript-eslint, oxlint) flags the missing `throw`.

### Unmatched routes

Hono answers a request no route matches from its own `notFound` handler with a plain-text 404, not
through `onError`. Throwing from `app.notFound` routes it through the handler, so unmatched routes
carry the same body, `X-Error-Id`, and report as every other error:

```ts
app.notFound(() => {
  throw ban.notFound();
});
```

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

### Database errors

`@nizam-os/hono-ban/postgresql` maps a Postgres driver error to a catalog entry by SQLSTATE with
constant client-facing text. It recognizes the errors of node-postgres, postgres.js, PGlite, Neon,
and Bun, thrown directly or wrapped by Drizzle, Kysely, TypeORM, MikroORM, Slonik, or Sequelize:

```ts
import { postgresMapper } from '@nizam-os/hono-ban/postgresql';

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
import { findPostgresError, postgresMapper } from '@nizam-os/hono-ban/postgresql';

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
503 may suggest `Retry-After`. Pass them through `headers`; `onError` keeps them when a middleware
such as `hono/bearer-auth` already set them, because the `HTTPException` it throws is adopted into
the catalog with its status, message, and headers. `bearerChallenge()` builds the RFC 6750 value,
validates every attribute against its grammar, and knows RFC 9728 `resource_metadata` for
OAuth-protected resources.

```ts
import { bearerChallenge } from '@nizam-os/hono-ban';

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

The full table with RFC references is in `docs/ban/SPEC.md` section 3.1.

### Pick a format

```ts
import { jsonApi } from '@nizam-os/hono-ban/formats/json-api';

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
import { googleApi } from '@nizam-os/hono-ban/formats/google-api';

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
import { stripe } from '@nizam-os/hono-ban/formats/stripe';

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
import { createBan, defineFormat } from '@nizam-os/hono-ban';

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

### Validation and OpenAPI

```ts
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { errorResponses, validationResponse } from '@nizam-os/hono-ban/openapi';
import { defaultHook } from '@nizam-os/hono-ban/zod';

const app = new OpenAPIHono({ defaultHook: defaultHook(ban) });

const route = createRoute({
  method: 'get',
  path: '/orders/{id}',
  responses: {
    200: { description: 'Order', content: { 'application/json': { schema: OrderSchema } } },
    ...errorResponses(ban, [401, 404]),
    // The hook throws ban.validation(), which is VALIDATION_FAILED with an
    // `errors` array; a bare 422 would document UNPROCESSABLE_CONTENT instead.
    422: validationResponse(ban),
  },
});
```

With `jsonApi({ mixedEntries: true })` each route's error responses repeat the objects of the codes
it lists. Register each object once and reference it, so the document stays small however many
routes there are:

```ts
import { errorObjectSchemas, errorResponses } from '@nizam-os/hono-ban/openapi';

const name = (key: string) => `Error.${key}`;
const objectRef = (key: string) => `#/components/schemas/${name(key)}`;
for (const [key, schema] of Object.entries(errorObjectSchemas(ban, codes))) {
  app.openAPIRegistry.registerComponent('schemas', name(key), schema);
}
// In each createRoute: responses: { ...errorResponses(ban, codes, { objectRef }) }
```

A status that carries one code answers the same on every route that lists it. Register that response
once too, with any format: `responseRef` makes such a status a reference, and `errorResponseObjects`
gives the responses to register. A status that carries several codes, such as a combined 400 or 500,
stays inline:

```ts
import { errorResponseObjects, errorResponses } from '@nizam-os/hono-ban/openapi';

const responseRef = (key: string) => `#/components/responses/${name(key)}`;
for (const [key, response] of Object.entries(errorResponseObjects(ban, codes, { objectRef }))) {
  app.openAPIRegistry.registerComponent('responses', name(key), response);
}
// In each createRoute: responses: { ...errorResponses(ban, codes, { objectRef, responseRef }) }
```

Hooks for `@hono/zod-validator` (`hook` from `@nizam-os/hono-ban/zod`), `@hono/valibot-validator`
(`@nizam-os/hono-ban/valibot`), and `@hono/standard-validator`
(`@nizam-os/hono-ban/standard-schema`) work the same way: they throw into `onError`, so validation
failures get the same id, header, and report as every other error, rendered by the active format.
Under the hood `ban.validation(issues, { location })` builds an `errors` list of items (`detail`,
`path`, `reason`, `expected`, `received`); any factory accepts `errors` too, so several problems
that did not come from a validator render the same way:

```ts
throw ban.badRequest('Two fields are wrong', {
  errors: [
    { detail: 'The customer does not exist', path: ['customerId'], location: 'body' },
    { detail: 'The coupon has expired', path: ['coupon'], location: 'body' },
  ],
});
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

### Observe

```ts
import { trace } from '@opentelemetry/api';

import { traceIdFromOtel } from '@nizam-os/hono-ban/otel';

app.onError(
  ban.onError({
    traceId: traceIdFromOtel(trace), // default: W3C traceparent header
    onReport: (report) => {
      logger.error({ err: report.cause, ...report.context }, report.error.title);
    },
  }),
);
```

Every response carries `X-Error-Id`; the same id is in the report and, for every built-in format
except Stripe (whose shape has no member for it), in the body.

### Localize or redact

`transform` post-processes the rendered body. RFC 9457 lets `title` vary between occurrences only
for localization, and the catalog fixes it otherwise, so this is where a translation happens; set
`Content-Language` yourself through `headers`.

```ts
app.onError(
  ban.onError({
    transform: (body, error, c) =>
      typeof body === 'object' && body !== null
        ? { ...body, title: t(c.req.header('accept-language'), error.code) }
        : body,
  }),
);
```

The published schemas document `title` as any string, with the catalog's title as the example, and
keep `status` and `code` pinned, so a localized body still matches the response its route documents.
Under `jsonApi()` the titles sit in each object of `errors`, and the document is closed, so localize
them there rather than adding a top-level `title`.

### Without Hono

The instance `@nizam-os/hono-ban` builds is a `@nizam-os/ban-core` instance with `onError` added.
`ban.handler()` is the framework-free handler underneath, usable from any `fetch` handler with
`fromRequest`:

```ts
import { createBan, fromRequest } from '@nizam-os/ban-core';

const ban = createBan();
const handle = ban.handler();

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

The `@nizam-os/ban-core` README covers the core on its own, including `createBan({ adopt })` for
recognizing other frameworks' exceptions the way `@nizam-os/hono-ban` recognizes `HTTPException`.

## Modules

| Import                                                                                                                                                                                                | What it gives you                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nizam-os/hono-ban`                                                                                                                                                                                  | everything `@nizam-os/ban-core` exports, with `createBan` adding `onError`; plus `fromHttpException`, `assert`, `defineFormat`, `bearerChallenge`, `BanError`, `isBanError`, `problemDetails` |
| `@nizam-os/hono-ban/formats/problem-details`, `@nizam-os/hono-ban/formats/json-api`, `@nizam-os/hono-ban/formats/plain`, `@nizam-os/hono-ban/formats/google-api`, `@nizam-os/hono-ban/formats/stripe` | the built-in wire formats                                                                                                                                                                     |
| `@nizam-os/hono-ban/zod`, `@nizam-os/hono-ban/valibot`, `@nizam-os/hono-ban/standard-schema`                                                                                                          | validator hooks and issue converters                                                                                                                                                          |
| `@nizam-os/hono-ban/openapi`                                                                                                                                                                          | `errorResponses`, `errorResponseObjects`, `errorObjectSchemas`, `errorResponse`, `errorSchema`, `validationResponse`, `validationSchema`                                                      |
| `@nizam-os/hono-ban/otel`                                                                                                                                                                             | `traceIdFromOtel`                                                                                                                                                                             |
| `@nizam-os/hono-ban/postgresql`                                                                                                                                                                       | `postgresMapper`, `findPostgresError`, `readPostgresFields`                                                                                                                                   |
| `@nizam-os/hono-ban/testing`                                                                                                                                                                          | `expectBanError`, `renderError`, `assertFormatConformance`                                                                                                                                    |

Every subpath is the same module as the matching `@nizam-os/ban-core/<subpath>`; importing either is
fine in one application. Other databases go through `createBan({ map })` the same way
`@nizam-os/hono-ban/postgresql` does: catalog entries with constant client-facing messages, never
the driver's own text (a driver's detail line can contain the failing row).

## Documentation

- [`docs/ban/DESIGN.md`](https://github.com/nizam-os/kit/blob/main/docs/ban/DESIGN.md): goals, the
  full API, architecture, security defaults, and roadmap
- [`docs/ban/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/ban/SPEC.md): the normative
  implementation specification (exact types, catalog, rendering rules, handler algorithm, validator
  mappings, packaging, test plan)
- [`docs/ban/adr/`](https://github.com/nizam-os/kit/blob/main/docs/ban/adr/): architecture decision
  records
- [`CONTRIBUTING.md`](https://github.com/nizam-os/kit/blob/main/CONTRIBUTING.md): setup, quality
  gates, release process
- [`CHANGELOG.md`](./CHANGELOG.md): what changed in each release, including the 2.0 migration notes

## Why

Without a contract, error bodies drift: `{ message }` here, `{ error }` there, a Zod issue array
somewhere else, and an OpenAPI document that describes none of them. @nizam-os/hono-ban gives every
error in a Hono app one shape, one id, and one place to observe it, while letting you choose which
standard that shape follows.

- **Typed catalog.** Every standard 4xx and 5xx status has a factory (`ban.notFound()`), and your
  own domain errors join the catalog with full inference (`ban.ORDER_CONFLICT()`).
- **Formats are pluggable.** `problemDetails()` (RFC 9457), `jsonApi()`, `googleApi()` (AIP-193),
  `stripe()`, `plain()`, or `defineFormat()` with a schema and a renderer. The schema drives
  OpenAPI; the renderer drives the wire. They cannot disagree.
- **A handler that cannot misbehave.** `ban.onError()` never throws, runs once per error, adopts
  Hono's `HTTPException` with its status, message, and headers, marks error responses
  `Cache-Control: no-store` unless you set one, and never puts server internals in a response.
- **Validation done once.** Hooks for `@hono/zod-openapi`, `@hono/zod-validator`, and any Standard
  Schema validator normalize issues, then the active format renders them (JSON:API `source.pointer`,
  Problem Details `errors`).
- **Observability built in.** One `ErrorReport` per error with the same id the client received, the
  request id, and the trace id. Plug in pino, Sentry, or OpenTelemetry in a few lines.
- **Runs everywhere Hono runs.** Web standards only; no `process.env`, no Node-only APIs. ESM, and
  `hono` is the only peer dependency: the Zod, Valibot, Standard Schema, and OpenTelemetry modules
  are typed structurally and never import those packages.
- **Not tied to Hono.** The core is `@nizam-os/ban-core`; a library, a worker, or a test renders the
  same errors without the framework.

## Comparison

|                                         | @nizam-os/hono-ban 2.0                                          | hono-problem-details          | @hapi/boom |
| --------------------------------------- | --------------------------------------------------------------- | ----------------------------- | ---------- |
| Wire formats                            | RFC 9457, JSON:API, Google API (AIP-193), Stripe, plain, custom | RFC 9457                      | flat JSON  |
| Typed error catalog with custom entries | yes                                                             | registry                      | no         |
| Validation hooks                        | Zod, Valibot, Standard Schema                                   | Zod, Valibot, Standard Schema | no         |
| OpenAPI response helpers                | yes, derived from the format schema                             | yes                           | no         |
| Error report hook with shared error id  | yes                                                             | no                            | no         |
| Hono `HTTPException` interop            | adopts it                                                       | maps it                       | n/a        |
| Usable without Hono                     | yes, through `@nizam-os/ban-core`                               | no                            | yes        |
| Runtime                                 | web standards only                                              | web standards only            | Node       |

## License

[MIT](./LICENSE)
