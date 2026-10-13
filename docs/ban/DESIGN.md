# @nizam-os/ban-core and @nizam-os/hono-ban: design

This document describes what @nizam-os/ban-core 1.0 and @nizam-os/hono-ban 2.0 are, the API they
expose, and how they are built.

Architecture decisions referenced as ADR-NNNN live in `docs/ban/adr/`. The normative, field-by-field
specification that implementers work from is `docs/ban/SPEC.md`; this document explains the intent
behind it. When the two disagree, fix one in the same PR.

## 1. Purpose

@nizam-os/ban-core is an HTTP error layer for any JavaScript runtime that speaks the fetch standard;
@nizam-os/hono-ban is the same layer wired into Hono (ADR-0016). Together they give an application:

1. one way to create HTTP errors, with a typed catalog that the application extends;
2. one handler that turns anything thrown into a well-formed response, safely, with `app.onError()`
   on Hono or a `fetch` handler's `catch` anywhere else;
3. one pluggable wire format, so the same application code can emit RFC 9457 Problem Details,
   JSON:API error objects, or a custom shape;
4. validation, OpenAPI, and observability integrations that all derive from the same catalog and
   format, so documentation, responses, and logs cannot disagree.

It is a library for teams who treat their error responses as an API contract. @nizam-os/ban-core
started life as hono-ban 1.x; the core was extracted so that a library of its own, a non-Hono
service, or a test can build and render the same errors, and so that other adapters can be thin.

### Who it is for

- API teams on Hono who want a standard error body without hand-rolling RFC 9457 or JSON:API in
  every project.
- Libraries and services that render HTTP errors outside Hono and want the same catalog, formats,
  and handler without a framework dependency.
- Teams whose clients consume JSON:API and who have had no Hono-native option.
- Teams who need domain errors (`OrderNotFound`, `PlanLimitReached`) translated into HTTP at the
  edge, once, with the same id in the response and in the logs.

### Non-goals

- Replacing your logger or tracer. The handler emits one `ErrorReport` per error and stops there.
- Forwarding database or driver text to clients. `@nizam-os/ban-core/postgresql` maps Postgres
  errors to catalog entries with constant messages (ADR-0015); other drivers go through `map` the
  same way, and no driver's `message`, `detail`, or `hint` is ever forwarded (ADR-0007).
- Content negotiation between formats per request. One format per `createBan` instance. If demand
  appears, it is additive.
- Supporting CommonJS-only consumers on Node older than 22.12 (ADR-0006).

## 2. Principles

1. **The handler never throws and runs once per error.** ADR-0002.
2. **Factories return; callers throw.** `throw ban.notFound()` is the idiom. ADR-0005.
3. **One options bag everywhere.** Every factory takes the same `BanErrorOptions`.
4. **A format owns schema and rendering.** ADR-0003. Docs equal wire.
5. **Nothing about the server reaches a client unless a factory put it there.** ADR-0007.
6. **Web standards only. No ambient environment.** ADR-0004.
7. **Typed catalog, no strings at call sites.** Custom errors are keys with inference, not
   `problem({ status, title })` literals repeated across handlers.
8. **One id per error occurrence**, present in the body, the `X-Error-Id` header, and the report.
9. **Small core, optional integrations.** @nizam-os/ban-core has no dependencies and no peer
   dependencies; @nizam-os/hono-ban adds `hono` as its only peer (ADR-0016). The Zod, Valibot,
   Standard Schema, OpenAPI, and OpenTelemetry integrations are subpath exports that type the
   third-party objects they receive structurally and never import those packages (ADR-0009).
10. **Errors are plain values; adapters adopt.** `BanError` extends `Error` and nothing else. An
    adapter recognizes its framework's own exceptions through the `adopt` hook instead of the core
    inheriting from them (ADR-0018).
11. **Every non-obvious decision cites its source** with `@ref` in code and an ADR in docs.

## 3. The API by example

### 3.1 Minimal

```ts
import { Hono } from 'hono';

import { createBan } from '@nizam-os/hono-ban';

const ban = createBan();
const app = new Hono();

app.onError(ban.onError());

app.get('/orders/:id', async (c) => {
  const order = await orders.find(c.req.param('id'));
  if (!order) throw ban.notFound(`Order ${c.req.param('id')} does not exist`);
  return c.json(order);
});
```

Default format is RFC 9457 Problem Details (section 4.4 explains the choice).

Without Hono, the same instance comes from `@nizam-os/ban-core` and the handler is called directly:

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

`@nizam-os/hono-ban`'s `createBan` is the core's plus `onError`, which feeds the Hono context's
request facts to that same handler (section 4.5).

### 3.2 Options bag

```ts
throw ban.tooManyRequests({
  detail: 'Rate limit exceeded for this API key',
  headers: { 'Retry-After': '30' },
  meta: { limit: 100, window: '1m' },
  cause: limiterError,
});

throw ban.unauthorized({
  detail: 'Access token expired',
  headers: { 'WWW-Authenticate': 'Bearer realm="api", error="invalid_token"' },
});

// Positional shorthand: detail first, options second.
throw ban.conflict('Email already registered', { meta: { field: 'email' } });
```

### 3.3 Custom catalog entries

```ts
const ban = createBan({
  docsBaseUrl: 'https://api.example.com/errors',
  errors: {
    ORDER_CONFLICT: { status: 409, title: 'Order Conflict' },
    PLAN_LIMIT_REACHED: {
      status: 402,
      title: 'Plan Limit Reached',
      description: 'The workspace has used its monthly quota.',
    },
  },
});

throw ban.ORDER_CONFLICT({ detail: `Order ${id} was modified concurrently` });
throw ban.error('PLAN_LIMIT_REACHED'); // generic form, key is typed
```

Keys are `SCREAMING_SNAKE_CASE` by convention and become both the factory name and the default
`code`. Built-in factories are camelCase (`ban.notFound`), so the two namespaces cannot collide; the
type of `errors` rejects keys that shadow an instance member.

### 3.4 Guarding with narrowing

```ts
import { assert } from '@nizam-os/hono-ban';

const user = await users.find(id);
assert(user, () => ban.notFound(`User ${id} does not exist`));
user.email; // narrowed: User
```

`assert` is a standalone export rather than `ban.assert()`: TypeScript only honors assertion
signatures when every name in the call target has an explicit type annotation (TS2775), which
`const ban = createBan()` does not.

### 3.5 Domain errors from lower layers

```ts
class OrderNotFound extends Error {}
class InsufficientStock extends Error {
  constructor(public readonly sku: string) {
    super(`Out of stock: ${sku}`);
  }
}

const ban = createBan({
  map: (error, ban) => {
    if (error instanceof OrderNotFound) return ban.notFound(error.message, { cause: error });
    if (error instanceof InsufficientStock) {
      return ban.conflict({ detail: error.message, meta: { sku: error.sku }, cause: error });
    }
    return undefined; // fall through to the default handling
  },
});
```

`map` is a single ordered function, not a class registry, so `instanceof` chains, discriminant
checks, and third-party error shapes all work the same way, and subclasses match their parent.
Postgres errors have a ready-made one: `postgresMapper()` from `@nizam-os/ban-core/postgresql` is
such a `map`, keyed on SQLSTATE, with constant client text and per-constraint overrides (section
4.5, ADR-0015).

`adopt` is the sibling hook for values that already describe an HTTP outcome, such as a framework's
own exception class. It runs before `map`, inside `ban.from()` too, and what it returns counts as
handled rather than unexpected. `@nizam-os/hono-ban` installs one for `HTTPException`; an
application adds its own for, say, a fetch wrapper's error that carries an upstream status.

### 3.6 Formats

```ts
import { googleApi } from '@nizam-os/ban-core/formats/google-api';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';
import { plain } from '@nizam-os/ban-core/formats/plain';
import { problemDetails } from '@nizam-os/ban-core/formats/problem-details';
import { stripe } from '@nizam-os/ban-core/formats/stripe';

createBan({ format: jsonApi() });
createBan({ format: problemDetails({ typeBaseUrl: 'https://api.example.com/problems' }) });
createBan({ format: googleApi({ domain: 'orders.example.com' }) }); // AIP-193 { error: { code, message, status, details } }
createBan({ format: stripe() }); // { error: { code, doc_url, message, type } }
createBan({ format: plain() }); // { status, code, title, detail, id, meta }
```

A custom format with a schema:

```ts
import { z } from 'zod';

import { defineFormat } from '@nizam-os/ban-core';

const legacy = defineFormat({
  name: 'legacy-envelope',
  contentType: 'application/json',
  schema: z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string(), requestId: z.string().optional() }),
  }),
  // render must return the schema's output type; a mismatch is a compile error.
  render: (error, ctx) => ({
    ok: false,
    error: { code: error.code, message: error.detail ?? error.title, requestId: ctx.requestId },
  }),
});

const ban = createBan({ format: legacy });
```

### 3.7 Validation

```ts
import { OpenAPIHono } from '@hono/zod-openapi';

import { defaultHook } from '@nizam-os/hono-ban/zod';

const app = new OpenAPIHono({ defaultHook: defaultHook(ban) });
```

```ts
import { zValidator } from '@hono/zod-validator';

import { hook } from '@nizam-os/hono-ban/zod';

app.post('/users', zValidator('json', UserSchema, hook(ban)), handler);
```

```ts
import { sValidator } from '@hono/standard-validator';

import { hook } from '@nizam-os/hono-ban/standard-schema';

app.post('/users', sValidator('json', UserSchema, hook(ban)), handler);
```

All three normalize issues into `ValidationIssue[]` and **throw**
`ban.validation(issues, { location })`. Throwing rather than returning a `Response` from the hook
sends validation errors through the same `onError` pipeline as everything else, so they get the
error id, the `X-Error-Id` header, the report, and the trace id like any other error (section 4.7).
The hooks are exported from `@nizam-os/ban-core/zod`, `@nizam-os/ban-core/valibot`, and
`@nizam-os/ban-core/standard-schema` as well as under `@nizam-os/hono-ban/*`; they take a result
object and need nothing from Hono.

### 3.8 OpenAPI

```ts
import { createRoute } from '@hono/zod-openapi';

import { errorResponse, errorResponses } from '@nizam-os/ban-core/openapi';

createRoute({
  method: 'post',
  path: '/orders',
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: OrderSchema } } },
    ...errorResponses(ban, [401, 403, 'ORDER_CONFLICT', 422]),
    429: errorResponse(ban, 429, { description: 'Per-key rate limit' }),
  },
});
```

The schemas come from `ban.format.schema(definition)`; the content type comes from
`ban.format.contentType`. Change the format and the document changes with it.

### 3.9 Observability

```ts
app.onError(
  ban.onError({
    requestId: (c) => c.get('requestId'),
    onReport: async (report, c) => {
      const level = report.status >= 500 ? 'error' : 'warn';
      log[level]({ err: report.cause ?? report.error, ...report.context }, report.error.title);
      if (report.status >= 500)
        Sentry.captureException(report.cause ?? report.error, {
          tags: { errorId: report.id },
        });
    },
  }),
);
```

`report.id` equals the `id` in the response body and the `X-Error-Id` header. A user quoting the id
from an error page finds the log line and the Sentry event.

### 3.10 Environment-dependent behavior

```ts
import { env } from 'hono/adapter';

app.onError((err, c) => ban.onError({ includeStack: env(c).NODE_ENV !== 'production' })(err, c));
```

Or resolve once at startup on platforms with static config. The library never reads the environment
itself (ADR-0004).

### 3.11 Header obligations

HTTP makes the application responsible for a few headers on error responses (SPEC 3.1): a 401 MUST
carry `WWW-Authenticate`, a 405 `Allow`, a 407 `Proxy-Authenticate`. They travel through `headers`;
the one with a grammar worth enforcing has a builder (ADR-0013).

```ts
import { bearerChallenge } from '@nizam-os/ban-core';

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
throw ban.methodNotAllowed({ headers: { Allow: 'GET, HEAD' } });
```

@ref https://www.rfc-editor.org/rfc/rfc9110#section-15.5.2 @ref
https://www.rfc-editor.org/rfc/rfc6750#section-3 @ref
https://www.rfc-editor.org/rfc/rfc9728#section-5.1

## 4. Concepts and architecture

### 4.1 Error definitions and the catalog

```ts
interface ErrorDefinition {
  readonly status: ErrorStatusCode;
  /** Defaults to the RFC 9110 reason phrase for `status`. */
  readonly title?: string;
  /** Machine-readable code. Defaults to the catalog key. */
  readonly code?: string;
  /** URI reference identifying the error type (RFC 9457 section 3.1.1). When omitted, the format derives `${typeBaseUrl ?? docsBaseUrl}/${code}` at render time (ADR-0010). */
  readonly type?: string;
  /** OpenAPI response description. */
  readonly description?: string;
}
```

The built-in catalog covers every registered 4xx and 5xx status except 418 with RFC 9110 names
(`CONTENT_TOO_LARGE` for 413, `UNPROCESSABLE_CONTENT` for 422) and the names they replaced as
factory aliases: `payloadTooLarge` (RFC 7231) and `unprocessableEntity` (RFC 4918, the WebDAV
specification that defined 422 before RFC 9110 adopted it). Titles are the IANA reason phrases. The
catalog is an `as const` object; there are no enums (ADR-0006). @ref
https://www.rfc-editor.org/rfc/rfc9110#name-status-codes @ref
https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml

`createBan({ errors })` merges custom definitions over the built-ins with full type inference. A
custom key that equals a built-in key overrides its definition (for example to change the title of
`NOT_FOUND`).

### 4.2 BanError

`BanError extends Error` (implemented in `packages/ban-core/src/core/ban-error.ts`). hono-ban 1.x
extended Hono's `HTTPException`; the core cannot, and the two things that inheritance bought are
covered another way (ADR-0018): Hono middleware that throws `HTTPException` is adopted into the
catalog by `@nizam-os/hono-ban` (section 4.5), and `err.getResponse()` still renders in the
configured format because the error carries a reference to its renderer. What was lost on purpose: a
`BanError` that escapes without `app.onError(ban.onError())` is answered by Hono's default 500
rather than by its own body, which is the same as any other error and is covered by the quick start.

Fields: `status`, `code`, `title`, `detail`, `meta`, `headers`, `id`, `cause`, `definition`,
`errors` (the list of items, section 4.7), `instance` (request path when rendered). `message` is
`detail ?? title` so ordinary logging of the error reads well. `status` is typed as
`ErrorStatusCode`, the library's own union of the registered 4xx and 5xx statuses, so the core does
not borrow a framework's status type and a 2xx or 3xx error is a type error.

### 4.3 Factories

Every catalog entry produces a factory with two call forms:

```ts
type Factory = {
  (detail?: string, options?: BanErrorOptions): BanError;
  (options: BanErrorOptions): BanError;
};
```

Factories are pure: they allocate a `BanError` and return it. No I/O, no side effects, no throw.
`ban.error(key, options)` is the generic form for dynamic keys.
`ban.custom({ status, title, code?, ...options })` builds a one-off error that is not in the
catalog, for prototypes and for statuses an application uses exactly once; it is excluded from
`errorResponses()` because it has no definition to document. `ban.fromStatus(status, options)` picks
the primary entry for a status, or a custom error when none exists, the building block for adopters
that receive a status from elsewhere. `ban.from(unknown)` converts any thrown value: `BanError`
passes through, the `adopt` hook gets the next say, anything else becomes the
`INTERNAL_SERVER_ERROR` entry with the value as `cause`.

### 4.4 Formats

```ts
interface ErrorFormat<TBody = unknown> {
  readonly name: string;
  readonly contentType: string;
  render(error: BanError, ctx: RenderContext): TBody;
  renderErrors(error: BanError, errors: ReadonlyArray<ErrorItem>, ctx: RenderContext): TBody;
  schema(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
  errorsSchema(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
}

interface RenderContext {
  readonly requestId: string | undefined;
  readonly traceId: string | undefined;
  readonly instance: string | undefined; // the error's, else the request path
  readonly method: string | undefined;
  readonly includeStack: boolean;
  readonly docsBaseUrl: string | undefined;
  readonly meta: Readonly<Record<string, unknown>>; // already sanitized (ADR-0007)
  readonly stack: string | undefined; // only when includeStack and status >= 500
  readonly truncated: boolean; // second render after the body cap
}
```

All four methods are required on `ErrorFormat`; `defineFormat` (SPEC 7.5) fills in `renderErrors`
and `errorsSchema` from `render` and `schema` when a hand-written format omits them. `renderErrors`
is the list path: an error carrying `errors` (section 4.7) renders through it, with every built-in
format deciding how items appear in its own shape. A format sees only what the context carries: it
cannot set response headers, which stay with the error (`BanError.headers`) and the handler
(`HandlerOptions.headers`).

Built-in formats:

| Format             | Content type               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `problemDetails()` | `application/problem+json` | RFC 9457 members plus `id`, `code`, and `meta` flattened as extension members; standard members win on collision. See ADR-0008 and SPEC 7.1. `type` is `about:blank` unless a type URI is derived. Error items render as an `errors` array of `{ location, pointer \| name, detail, code, expected, received }`.                                                                                                      |
| `jsonApi()`        | `application/vnd.api+json` | `{ errors: [ErrorObject] }` with `id`, `status` (string), `code`, `title`, `detail`, `links.type`, `links.about`, `source`, `meta`. Error items become one error object each with `source.pointer` (RFC 6901 escaped) or `source.parameter` or `source.header`; `mixedEntries` lets items carry their own status, code, and title, and `responseStatus()` picks the document's status the way the specification asks. |
| `googleApi()`      | `application/json`         | AIP-193: `{ error: { code, message, status, details } }` with `code` the HTTP status, `status` the `google.rpc.Code` name (from the catalog code, the `rpcCodes` option, or the HTTP status through the gax table), and `details` holding `ErrorInfo` (always), `BadRequest` (validation), `RetryInfo`, `RequestInfo` (the error id), `DebugInfo`, `Help`. See ADR-0014 and SPEC 7.6.                                 |
| `stripe()`         | `application/json`         | Stripe's `api_errors` shape: `{ error: { code, doc_url, message, param, request_log_url, type } }` in alphabetical order, `type` classified by status like Stripe's SDKs or per code. No member for `meta`, the trace id, or the id. See ADR-0014 and SPEC 7.7.                                                                                                                                                       |
| `plain()`          | `application/json`         | `{ status, code, title, detail, id, meta, errors? }`. For teams migrating from ad hoc bodies.                                                                                                                                                                                                                                                                                                                         |

@ref https://www.rfc-editor.org/rfc/rfc9457 @ref https://jsonapi.org/format/#error-objects @ref
https://jsonapi.org/format/#content-negotiation-servers @ref
https://www.rfc-editor.org/rfc/rfc6901#section-3

**Default format.** RFC 9457 is the default because it is the IETF standard, needs no configuration
(`about:blank` is a valid `type`), and is what Hono users ask for in upstream threads. JSON:API is
one import away and is a first-class citizen, not an adapter.

**Schema-driven custom formats.** `defineFormat` accepts either the interface above or a Standard
Schema object with JSON Schema support as `schema`, in which case `render` is typed as returning
`StandardSchemaV1.InferOutput<S>` and the OpenAPI helpers call the schema's JSON Schema projection.
Built-in formats do not depend on any schema library and express their schemas as JSON Schema
literals with a conformance test (ADR-0003). @ref https://standardschema.dev

### 4.5 Handler

`ban.handler(options)` returns `(thrown, request, ctx) => Promise<Response>`: the thrown value, the
request facts (`method`, `path`, and a case-insensitive `header()`, which `fromRequest(request)`
reads from a fetch `Request`), and a context of the caller's choosing that every callback receives.
`@nizam-os/hono-ban`'s `ban.onError(options)` wraps it as a Hono `ErrorHandler` with the `Context`
as that context, so `requestId`, `traceId`, `transform`, and `onReport` see `c` exactly as in 1.x.
The pipeline for a thrown value `err`:

1. `BanError` → use as is.
2. `adopt` → if the instance's hook returns a `BanError`, use it as a handled error.
   `@nizam-os/hono-ban` installs `fromHttpException`: catalog entry by status,
   `detail = err.message`, headers from `err.res` preserved minus those describing its body. Hono's
   own validator throws `HTTPException(400, 'Malformed JSON in request body')`; it is matched by
   status and exact message, never by substring. An `HTTPException` outside the error classes (a
   thrown redirect) is answered with its own response before the pipeline starts.
3. `options.map ?? createBan({ map })` → if it returns a `BanError`, use it.
4. Anything else → `INTERNAL_SERVER_ERROR` with the constant detail and `cause = err`.

Then, exactly once: strip dangerous keys from `meta`, add `Cache-Control: no-store` unless a header
was supplied, apply `options.headers` and the error's headers, set `X-Error-Id`, render through the
format, cap the body size, build the report, call `onReport` inside a try/catch, and return the
`Response`. A failure in the format or in `map` is itself caught and rendered as a minimal 500 with
the failure attached to the report as `handlerFailure`.

```ts
interface HandlerOptions<TContext = void> {
  includeStack?: boolean; // default false
  requestIdHeader?: string | false; // default 'X-Request-Id'; validated, never fabricated
  requestId?: (ctx: TContext) => string | undefined; // overrides the header lookup
  traceId?: (ctx: TContext) => string | undefined; // default: W3C traceparent
  onReport?: (report: ErrorReport, ctx: TContext) => void | Promise<void>;
  headers?: HeadersInit; // added to every error response
  errorIdHeader?: string | false; // default 'X-Error-Id'
  maxBodyBytes?: number; // default 65536
  transform?: (body: unknown, error: BanError, ctx: TContext) => unknown; // localization etc.
  map?: BanOptions['map']; // overrides the instance-level map
}
```

On Hono `TContext` is `Context<E>`; elsewhere it is whatever the host passes, or nothing.

@ref https://www.w3.org/TR/trace-context/#traceparent-header

The step-by-step algorithm, the fallback path, header merge order, and every edge case are in SPEC
section 6.

`@nizam-os/ban-core/postgresql` supplies a `map` for Postgres driver errors.
`postgresMapper(options)` recognizes the error by its SQLSTATE and severity, directly or through an
ORM wrapper's `cause`, and returns a catalog entry with constant text (409 for conflicts, 422 for
rejected values, 503 for transient conditions) or `undefined` for codes it has no row for, so those
stay unhandled 500s. `constraints`, `columns`, and `codes` refine the entry and wording, or turn a
violation into a validation error with one issue. SPEC section 6.10 has the table and the
precedence; ADR-0015 the reasoning.

### 4.6 Error report

```ts
interface ErrorReport {
  readonly id: string;
  readonly status: ErrorStatusCode;
  readonly code: string;
  readonly error: BanError; // what was rendered
  readonly cause: unknown; // what was thrown, when different
  readonly handled: boolean; // false when it fell through to the generic 500
  readonly handlerFailure: unknown; // set only on the fallback path
  readonly context: {
    readonly requestId: string | undefined;
    readonly traceId: string | undefined;
    readonly spanId: string | undefined;
    readonly method: string;
    readonly path: string;
  };
}
```

There is no logger abstraction and no adapter zoo. `onReport` receives everything a logger, tracer,
or error tracker needs, including the raw `Error` instance, so pino's `err` serializer and Sentry's
`captureException` work natively.

### 4.7 Validation

```ts
interface ValidationIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code?: string;
  readonly expected?: string;
  readonly received?: string;
}

type IssueLocation = 'body' | 'form' | 'query' | 'param' | 'header' | 'cookie';
```

`ban.validation(issues, { location })` creates a `BanError` for the `VALIDATION_FAILED` entry (422;
`createBan({ validationKey })` selects another entry) with one `ErrorItem` per issue in `errors` and
`'Request validation failed'` as the default `detail`; the format renders the items. Hooks throw
this error so it reaches the handler and gets an id, header, report, and trace id. The location is
always stated by the caller (the validator hook knows which target it validated), never inferred
from key names. JSON pointers escape `~` and `/` per RFC 6901; symbol path segments are stringified.

`errors` is not reserved for validation (ADR-0017). Every factory accepts it, and an item is the
unit every list-bearing format shares: `detail`, an optional `location` and `path`, the validator's
own `reason`, `expected`, and `received`, per-item `meta`, and an optional identity (`status`,
`code`, `title`, `type`) for formats that let one document combine several problems, which JSON:API
does under `mixedEntries`. A batch of domain checks or a JSON:API document with three unrelated
problems builds the list directly: `ban.badRequest({ errors })`.

Subpath exports (each also available as `@nizam-os/hono-ban/<name>`):

- `@nizam-os/ban-core/zod`: `defaultHook(ban)` for `OpenAPIHono`, `hook(ban)` for `zValidator`, and
  `fromZodError(ban, error, location)`. Zod 3.25+ and 4.
- `@nizam-os/ban-core/valibot`: `hook(ban)` for `@hono/valibot-validator` and
  `fromValibotIssues(ban, issues, location)`, keeping Valibot's `type`, `expected`, and `received`
  on each issue.
- `@nizam-os/ban-core/standard-schema`: `hook(ban)` for `@hono/standard-validator` and
  `fromIssues(ban, issues, location)`. Covers ArkType, Effect Schema, and any other Standard Schema
  library through one interface (path and message only, which is all the spec carries). @ref
  https://standardschema.dev

### 4.8 OpenAPI

`@nizam-os/ban-core/openapi` exports `errorResponse(ban, statusOrKey, opts?)`,
`errorResponses(ban, list)`, `errorSchema(ban, statusOrKey)`, `validationResponse(ban)`, and
`validationSchema(ban)`. Schemas are JSON Schema 2020-12 objects, which OpenAPI 3.1 accepts
directly; pass `{ dialect: 'openapi-3.0' }` to get `enum` instead of `const` for 3.0 documents.
Under `jsonApi({ mixedEntries: true })` a document may combine the listed codes, so `errorResponses`
describes each status as the documents whose objects carry any code a body of that status may carry,
the statuses chosen as `responseStatus` chooses them, each object pinned to one entry.
`errorResponses(ban, list, { objectRef })` references each entry's object instead of inlining it in
every response, and `errorObjectSchemas(ban, list)` gives the objects to place once, typically in
`components.schemas`, which keeps a document of many operations small. With `responseRef`, a status
that carries one entry is a Reference Object to that entry's response, which
`errorResponseObjects(ban, list)` gives to place once, typically in `components.responses`; a status
that combines entries stays inline. `@hono/zod-openapi` accepts raw schema objects in
`responses[*].content[*].schema`, so the helpers drop into `createRoute()` without any Zod wrapping
(verified by a generated-document test). @ref https://spec.openapis.org/oas/v3.1.0#schema-object
@ref https://github.com/asteasolutions/zod-to-openapi/blob/master/src/openapi-registry.ts

A conformance test in the repository renders every catalog entry in every built-in format and
validates the body against `format.schema(entry)`.
`assertFormatConformance(format, catalog, { compile })` is exported from
`@nizam-os/ban-core/testing` for custom formats; `compile` turns a JSON Schema into a validator so
the package does not depend on Ajv (ADR-0009).

### 4.9 Security defaults

See ADR-0007. In short: constant 500 detail, opt-in stack under a dedicated member, prototype
pollution keys stripped from `meta`, request id validated, body size capped, headers only from
`BanError.headers` and `HandlerOptions.headers`. Error responses are `Cache-Control: no-store`
unless the application says otherwise (ADR-0012), because their bodies carry per-occurrence ids and
several error statuses are heuristically cacheable.

### 4.10 Runtime and packaging

- Two packages, versioned independently (ADR-0016): `@nizam-os/ban-core` (the core) and
  `@nizam-os/hono-ban` (the Hono adapter, depending on `@nizam-os/ban-core` with a caret range).
- ESM only, `platform: 'neutral'`, `engines.node >= 22.12`, `sideEffects: false` (ADR-0006).
- `@nizam-os/ban-core` has no dependencies and no peers. `@nizam-os/hono-ban` has one peer,
  `hono >= 4.13.7` (upstream security floor: the first release no published Hono advisory affects,
  root ADR 0007). No optional peers anywhere: the integrations are typed structurally, so `zod`,
  `valibot`, `@hono/*` validators, `@standard-schema/spec`, `@opentelemetry/api`, and the Postgres
  drivers are devDependencies of this repository only (ADR-0009).
- Ids come from `crypto.randomUUID()`.
- Subpath exports, identical in both packages: `.`, `./formats/json-api`,
  `./formats/problem-details`, `./formats/plain`, `./formats/google-api`, `./formats/stripe`,
  `./zod`, `./valibot`, `./standard-schema`, `./openapi`, `./otel`, `./postgresql`, `./testing`. A
  `@nizam-os/hono-ban` subpath is a one-line re-export of the `@nizam-os/ban-core` one; only the
  root differs.

## 5. Package layout

The authoritative file map, with the SPEC section each file implements, is SPEC section 1. In
outline:

Under `packages/ban-core/src/`:

- `core/` `BanError`, `ErrorItem`, status codes, catalog data, definitions, factories, `createBan`,
  `assert`, `from`
- `formats/` `ErrorFormat` types, `defineFormat`, extension-member flattening, error entries, the
  five built-in formats
- `headers/` the `WWW-Authenticate` Bearer challenge builder
- `handler/` the handler pipeline, `fromRequest`, request id and traceparent parsing, body cap,
  report
- `validation/` `ValidationIssue`, pointer helpers, the Zod, Valibot, and Standard Schema hooks
- `openapi/` response schema helpers
- `observability/` the OpenTelemetry trace id adapter
- `postgresql/` the Postgres SQLSTATE mapper
- `testing/` consumer-facing test helpers and format conformance
- `internal/` helpers that are never exported

Under `packages/hono-ban/src/`: `create-ban.ts` (the wrapping `createBan` and `onError`),
`http-exception.ts` (`HTTPException` adoption and passthrough), the re-export files for each
subpath, and the tests that need Hono or its middleware (validator hooks through `onError`, the
generated OpenAPI document, hook type assignability).

Every module with behavior has `*.test.ts` beside it; types that are part of the contract have
`*.test-d.ts`. The per-module test list is SPEC section 14.

## 6. Comparison

| Capability           | @nizam-os/ban-core 1.0 / @nizam-os/hono-ban 2.0                                | hono-problem-details                                              | @hapi/boom         |
| -------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------ |
| Formats              | RFC 9457, JSON:API, Google API (AIP-193), Stripe, plain, custom (schema-typed) | RFC 9457                                                          | flat               |
| Catalog              | built-in plus typed custom keys as factories                                   | user registry, `create(key)`                                      | built-in factories |
| Options per error    | detail, code, title, meta, headers, cause, id                                  | detail, instance, type, extensions                                | data, headers      |
| Domain error mapping | `map(error, ban)`                                                              | `mapError`                                                        | `boomify`          |
| Validation           | Zod, Valibot, Standard Schema; format renders; flows through the handler       | Zod, Valibot, Standard Schema; hook returns the response directly | none               |
| OpenAPI              | derived from format schema; zod-openapi and JSON Schema                        | zod-openapi and JSON Schema                                       | none               |
| Observability        | `ErrorReport` with shared id, request id, trace id                             | `traceId` extension via OTel                                      | none               |
| Handler safety       | never throws, once per error, constant 500 detail                              | never throws, constant 500 detail                                 | n/a                |
| Runtime              | web standards only                                                             | web standards only                                                | Node               |
| Framework            | none in the core; Hono through `@nizam-os/hono-ban`                            | Hono                                                              | none               |

Neither package depends on or wraps hono-problem-details.

## 7. Roadmap

Everything described in this document has shipped and is covered by the unit, end-to-end, and
runtime smoke suites (SPEC section 14). Adapters for other hosts (a `fetch`-native router, a Node
`http` server) are the expected additions: each is a package that depends on `@nizam-os/ban-core`,
installs an `adopt` hook for the host's own exceptions, and maps the host's request to
`ErrorRequest`, the way `@nizam-os/hono-ban` does. Additive proposals start as a discussion
(`CONTRIBUTING.md`).
