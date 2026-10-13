# @nizam-os/ban-core 1.0 and @nizam-os/hono-ban 2.0: implementation specification

- Status: normative for the @nizam-os/ban-core 1.x and @nizam-os/hono-ban 2.x lines;
  `docs/ban/DESIGN.md` explains the why

The key words MUST, MUST NOT, SHOULD, and MAY are used as in RFC 2119. Every section names the
source file that implements it and the tests that prove it. File references are relative to
`packages/ban-core/src/` unless they start with `packages/`. When this document and the code
disagree, fix one of them in the same pull request.

Contents

1. Public surface and module map
2. Core types
3. Built-in catalog
4. `BanError`
5. Factories, `error`, `custom`, `fromStatus`, `assert`, `from`, `adopt`
6. The handler, and `onError` for Hono
7. Formats
8. Validation
9. OpenAPI
10. Observability
11. Testing utilities
12. Packaging
13. Constants
14. Test plan

---

## 1. Public surface and module map

Two packages ship from this repository (ADR 0016):

- `@nizam-os/ban-core` is the framework-free core: the catalog, `BanError`, the formats, the
  handler, and the validation, OpenAPI, observability, Postgres, and testing modules. It has no
  dependencies and no peer dependencies. Every integration types the third-party objects it receives
  structurally (ADR 0009), so installing `@nizam-os/ban-core` never pulls in or requires Hono, Zod,
  Valibot, `@standard-schema/spec`, `@hono/*` validators, `@opentelemetry/api`, a Postgres driver,
  or Ajv. Its declarations name no type only the DOM library declares: every `headers` option is
  `HeadersInit`, the Fetch Standard's, vendored in `internal/headers-init.ts` as the DOM library
  types it, so a Node consumer compiles them with Node's types alone, which declare `Headers` but
  not the alias (14.1).
- `@nizam-os/hono-ban` is the Hono adapter. It depends on `@nizam-os/ban-core`, peers on `hono`,
  re-exports every `@nizam-os/ban-core` subpath under its own name, and replaces `createBan` with
  one whose instances also carry `onError` for `app.onError()` and adopt Hono's `HTTPException`
  (6.11).

| Subpath                                      | Exports                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nizam-os/ban-core`                         | `createBan`, `assert`, `defineFormat`, `problemDetails`, `bearerChallenge`, `fromRequest`, `isErrorStatus`, `reasonPhrase`, `resolveDefinition`, `BanError`, `isBanError`, `BUILTIN_CATALOG`, `FACTORY_NAMES`, `parseTraceparent`, `pointerFromPath`, `nameFromPath`, `locationFromTarget`, and every type in sections 2, 3.2, 4, 6, 7, 8 |
| `@nizam-os/ban-core/formats/problem-details` | `problemDetails(options?)`, `PROBLEM_DETAILS_CONTENT_TYPE`, `ProblemDetailsOptions`, `ProblemDetailsBody`                                                                                                                                                                                                                                 |
| `@nizam-os/ban-core/formats/json-api`        | `jsonApi(options?)`, `responseStatus(errors)`, `JSON_API_CONTENT_TYPE`, `JsonApiOptions`, `JsonApiDocumentMembers`, `JsonApiBody`, `JsonApiErrorObject`, `JsonApiLinks`, `JsonApiSource`                                                                                                                                                  |
| `@nizam-os/ban-core/formats/google-api`      | `googleApi(options)`, `GOOGLE_API_CONTENT_TYPE`, `GoogleApiOptions`, `GoogleApiBody`, `GoogleApiStatus`, `GoogleApiDetail`, `GoogleApiErrorInfo`, `GoogleApiBadRequest`, `GoogleApiFieldViolation`, `GoogleApiRetryInfo`, `GoogleApiRequestInfo`, `GoogleApiDebugInfo`, `GoogleApiHelp`, `GoogleApiHelpLink`, `GoogleRpcCode`             |
| `@nizam-os/ban-core/formats/stripe`          | `stripe(options?)`, `STRIPE_CONTENT_TYPE`, `StripeOptions`, `StripeBody`, `StripeErrorObject`, `StripeErrorType`                                                                                                                                                                                                                          |
| `@nizam-os/ban-core/formats/plain`           | `plain()`, `PLAIN_CONTENT_TYPE`, `PlainBody`                                                                                                                                                                                                                                                                                              |
| `@nizam-os/ban-core/zod`                     | `hook(ban)`, `defaultHook(ban)`, `fromZodError(ban, error, location, options?)`, `toIssues(error)`, `ZodIssueLike`, `ZodErrorLike`, `ZodHookResult`                                                                                                                                                                                       |
| `@nizam-os/ban-core/valibot`                 | `hook(ban)`, `fromValibotIssues(ban, issues, location, options?)`, `toIssues(issues)`, `ValibotIssueLike`, `ValibotPathItemLike`, `ValibotHookResult`                                                                                                                                                                                     |
| `@nizam-os/ban-core/standard-schema`         | `hook(ban)`, `fromIssues(ban, issues, location, options?)`, `toIssues(issues)`, `StandardHookResult`                                                                                                                                                                                                                                      |
| `@nizam-os/ban-core/openapi`                 | `errorSchema`, `errorResponse`, `errorResponses`, `errorResponseObjects`, `errorObjectSchemas`, `validationSchema`, `validationResponse`, `SchemaSource`, `OpenApiOptions`, `ResponseObject`, `MediaTypeObject`, `ReferenceObject`, `ErrorRef`                                                                                            |
| `@nizam-os/ban-core/otel`                    | `traceIdFromOtel(source)`, `OtelSource`, `OtelTraceLike`, `OtelSpanLike`, `OtelSpanContextLike`                                                                                                                                                                                                                                           |
| `@nizam-os/ban-core/postgresql`              | `postgresMapper(options?)`, `findPostgresError(value)`, `readPostgresFields(error)`, `PostgresMapOptions`, `PostgresMapping`, `PostgresIssue`, `PostgresIssueMapping`, `PostgresConstraintMapping`, `PostgresMapper`, `CatalogWith`, `PostgresErrorLike`, `PostgresErrorFields`                                                           |
| `@nizam-os/ban-core/testing`                 | `renderError`, `expectBanError`, `assertFormatConformance`, `ExpectedError`, `ConformanceOptions`, `SchemaValidator`                                                                                                                                                                                                                      |
| `@nizam-os/hono-ban`                         | everything `@nizam-os/ban-core` exports, with `createBan`, `Ban`, `BanInstance`, `HandlerOptions`, `NoReserved`, and `ReservedKey` replaced by the Hono-aware versions (2.2), plus `fromHttpException` and `HonoMembers`                                                                                                                  |
| `@nizam-os/hono-ban/<subpath>`               | the same module object as `@nizam-os/ban-core/<subpath>`, for each subpath above                                                                                                                                                                                                                                                          |

Source layout. Every module with behavior has a sibling `*.test.ts`; contract types have
`*.test-d.ts`. Type-only and data-only modules (`types.ts`, `context.ts`, `internal.ts`,
`report.ts`, `resolve.ts`, `hook.ts`, `schema-helpers.ts`) are covered through their consumers;
coverage thresholds apply to both packages' `src/`. Imports form a DAG (`import/no-cycle` is
enforced, type-only imports included). `packages/hono-ban/src` imports `@nizam-os/ban-core` by
package name; in the repository the `source` export condition resolves it to `packages/ban-core/src`
for tests and type checks, and the published build resolves it to `@nizam-os/ban-core`'s `dist/`.

```
packages/ban-core/src/
  index.ts                     root entry
  internal/
    constants.ts               section 13
    id.ts                      generateErrorId(): crypto.randomUUID()
    json.ts                    safeStringify(), isPlainRecord()
    sanitize-meta.ts           sanitizeMeta() (ADR 0007)
    member-name.ts             assertMemberName() for format option names
    standard-schema-types.ts   vendored Standard Schema and Standard JSON Schema interfaces
    headers-init.ts            vendored Fetch Standard HeadersInit, as the DOM library types it
  core/
    status.ts                  ErrorStatusCode, isErrorStatus() (2.1)
    catalog.ts                 BUILTIN_CATALOG, FACTORY_NAMES, SECONDARY_KEYS (section 3)
    definition.ts              ErrorDefinition, ResolvedDefinition, resolveDefinition(), indexByStatus(), reasonPhrase()
    ban-error.ts               BanError, BanErrorOptions, BanErrorInit, RenderedError, Renderer (section 4)
    error-item.ts              ErrorItem, itemFromIssue(), itemsFromIssues() (4.1)
    types.ts                   Factory, Catalog, BanOptions, BanInstance, Ban, HandlerOptions, BanHandler, ErrorRequest, ErrorReport, ... (section 2)
    internal.ts                BanCore: what modules share without importing the public Ban
    factories.ts               parseFactoryArgs(), createFactory() (5.1, 5.2)
    assert.ts                  assert() (5.4)
    from.ts                    createFrom() (5.5)
    render.ts                  createRenderer() (6.7)
    create-ban.ts              createBan()
  formats/
    context.ts                 RenderContext, RenderOptions, SchemaContext, SchemaDialect, JsonSchema
    types.ts                   ErrorFormat
    schema-helpers.ts          constant(value, dialect)
    extension-members.ts       flattenMeta() (7.1.2, ADR 0008)
    error-entries.ts           ErrorEntry, toErrorEntries(), readLocation(), ERROR_ENTRIES_SCHEMA (7.1.3)
    define-format.ts           defineFormat() (7.5)
    problem-details/index.ts   7.1
    json-api/
      index.ts                 jsonApi(), JsonApiOptions, JsonApiBody (7.2)
      error-object.ts          error objects, sources, and meta per item (7.2.1, 7.2.2)
      response-status.ts       responseStatus() (7.2.4)
      schema.ts                bodySchema() (7.2.3)
    plain/index.ts             7.3
    google-api/
      index.ts                 googleApi(), GoogleApiOptions, GoogleApiBody (7.6)
      rpc-code.ts              GoogleRpcCode, rpcCodeFromStatus(), resolveRpcCode() (7.6.1)
      details.ts               detail payload types and builders (7.6.2)
      schema.ts                bodySchema() (7.6.3)
    stripe/index.ts            7.7
  headers/
    bearer-challenge.ts        bearerChallenge(), BearerChallengeOptions (3.2)
  handler/
    handler.ts                 createHandler(): the pipeline (6.2), fallback (6.4)
    request.ts                 fromRequest(): ErrorRequest from a fetch Request (section 6)
    headers.ts                 mergeHeaders() (6.9), assertHeaderName(), assertHeadersInit(), lastResortHeaders() (6.4)
    resolve.ts                 resolveThrown() (6.3)
    request-id.ts              readRequestId() (6.5)
    traceparent.ts             parseTraceparent(), TraceContext (6.6)
    body-cap.ts                capBody() (6.8)
    report.ts                  buildReport() (10.1)
  validation/
    issue.ts                   ValidationIssue, IssueLocation, HookTarget, pointerFromPath(), nameFromPath(), normalizeSegment(), locationFromTarget()
    validation-error.ts        createValidation(): ban.validation() (8.2)
    hook.ts                    createHook(), scalarToString(), ValidationSource, HookResultBase (8.4)
    zod.ts                     8.5
    valibot.ts                 8.6
    standard-schema.ts         8.7
  openapi/index.ts             section 9: one entry's schema and response, the validation response
  openapi/responses.ts         section 9: an operation's error responses, and the objects and responses it references
  openapi/source.ts            section 9: the options, the OpenAPI objects returned, ref resolution
  openapi/status-groups.ts     the statuses of an operation's error responses (section 9)
  observability/otel.ts        10.3
  postgresql/
    error.ts                   PostgresErrorLike, PostgresErrorFields, findPostgresError(), readPostgresFields() (6.10)
    sqlstate.ts                sqlstateDefault(): the built-in SQLSTATE table (6.10)
    options.ts                 PostgresMapOptions, PostgresMapping, PostgresIssueMapping, PostgresMapper, CatalogWith, assertOptions() (6.10)
    index.ts                   postgresMapper() (6.10)
  testing/index.ts             section 11
  test-support/ajv.ts          compileWithAjv() for the repository's own conformance tests; not published
  test-support/handler-dispatch.ts   fakeRequest() and dispatch() for the handler and postgres tests; not published
  test-support/postgresql-fixtures.ts   driver-shaped fixtures; not published

packages/hono-ban/src/
  index.ts                     export * from '@nizam-os/ban-core', then the Hono-aware createBan and types (2.2)
  create-ban.ts                createBan(): wraps the core with the HTTPException adopter and adds onError (6.11)
  http-exception.ts            fromHttpException(), passthroughResponse(), MALFORMED_JSON_MESSAGE (6.11)
  formats/<name>.ts, <name>.ts one-line re-exports of each @nizam-os/ban-core subpath
  hooks.test-d.ts              validator hook types against the @hono/* middleware (8.4)
  validators.test.ts           zValidator, vValidator, sValidator, and OpenAPIHono through onError (8.4)
  openapi.test.ts              the generated @hono/zod-openapi document (section 9)
```

## 2. Core types

All in `core/types.ts`, `core/ban-error.ts`, `core/definition.ts`, `core/status.ts`, and
`formats/context.ts`; re-exported from `index.ts`. Every optional property is declared
`?: T | undefined` because the package compiles with `exactOptionalPropertyTypes`. Nothing here
imports a framework: `ErrorStatusCode` (2.1) is the library's own.

```ts
export interface ErrorDefinition {
  readonly status: ErrorStatusCode;
  readonly title?: string | undefined; // default: IANA reason phrase, else 'Error'
  readonly code?: string | undefined; // default: the catalog key
  readonly type?: string | undefined; // explicit URI reference only (RFC 9457 3.1.1); formats derive `${base}/${code}` otherwise (ADR 0010)
  readonly description?: string | undefined; // default: title (OpenAPI response description)
}

export interface ResolvedDefinition {
  readonly key: string;
  readonly status: ErrorStatusCode;
  readonly title: string;
  readonly code: string;
  readonly type: string | undefined; // never derived here; see 7.1.1 and 7.2.1
  readonly description: string;
}

export interface BanErrorOptions {
  readonly detail?: string | undefined;
  readonly type?: string | undefined; // no code or title here: the catalog fixes them (ADR 0011, ADR 0020)
  readonly instance?: string | undefined; // RFC 9457 instance; default: request path at render time
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
  readonly headers?: HeadersInit | undefined;
  readonly cause?: unknown;
  readonly id?: string | undefined;
  readonly errors?: ReadonlyArray<ErrorItem> | undefined; // 4.1: one entry per reported problem
}

export interface Factory {
  (detail?: string, options?: BanErrorOptions): BanError;
  (options: BanErrorOptions): BanError;
}

export type Catalog = Readonly<Record<string, ErrorDefinition>>;
export type EmptyCatalog = Record<never, never>;
export type ErrorKey<TErrors extends Catalog> = keyof BuiltinCatalog | (keyof TErrors & string);
export type BuiltinFactories = { readonly [K in FactoryName]: Factory };
export type CustomFactories<TErrors extends Catalog> = { readonly [K in keyof TErrors]: Factory };
export type ErrorMapper<TErrors extends Catalog> = (
  error: unknown,
  ban: Ban<TErrors>,
) => BanError | undefined;
export type ErrorAdopter<TErrors extends Catalog> = (
  value: unknown,
  ban: Ban<TErrors>,
) => BanError | undefined; // 5.7

export interface BanOptions<TErrors extends Catalog> {
  readonly format?: ErrorFormat | undefined; // default problemDetails()
  readonly errors?: TErrors | undefined;
  readonly docsBaseUrl?: string | undefined;
  readonly validationKey?: NoInfer<ErrorKey<TErrors>> | undefined; // default 'VALIDATION_FAILED'
  readonly map?: NoInfer<ErrorMapper<TErrors>> | undefined;
  readonly adopt?: NoInfer<ErrorAdopter<TErrors>> | undefined;
  readonly id?: (() => string) | undefined; // default crypto.randomUUID()
}

export interface CustomErrorInit extends BanErrorOptions {
  readonly status: ErrorStatusCode;
  readonly code?: string | undefined; // default 'CUSTOM'; free because custom errors have no schema
  readonly title?: string | undefined; // default: IANA reason phrase, else 'Error'
}

export interface ValidationOptions {
  readonly location: IssueLocation;
  readonly detail?: string | undefined; // default VALIDATION_DETAIL (8.2)
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
  readonly cause?: unknown;
}

export interface RenderedError {
  readonly status: ErrorStatusCode;
  readonly headers: Headers; // includes Content-Type for the format
  readonly body: unknown;
}

export type Renderer = (error: BanError, options?: RenderOptions) => RenderedError;
export type RenderOptions = Partial<Omit<RenderContext, 'meta' | 'stack'>>;

export interface BanInstance<TErrors extends Catalog> {
  readonly format: ErrorFormat;
  readonly catalog: Readonly<Record<ErrorKey<TErrors>, ResolvedDefinition>>;
  readonly docsBaseUrl: string | undefined;
  readonly validationKey: ErrorKey<TErrors>;
  readonly error: (key: ErrorKey<TErrors>, options?: BanErrorOptions) => BanError;
  readonly custom: (init: CustomErrorInit) => BanError;
  readonly fromStatus: (status: ErrorStatusCode, options?: BanErrorOptions) => BanError; // 5.6
  readonly validation: (
    issues: ReadonlyArray<ValidationIssue>,
    options: ValidationOptions,
  ) => BanError;
  readonly from: (value: unknown) => BanError;
  readonly handler: <TContext = void>(
    options?: HandlerOptions<TContext, TErrors>,
  ) => BanHandler<TContext>; // section 6
  readonly render: Renderer;
}

export type Ban<TErrors extends Catalog> = BuiltinFactories &
  CustomFactories<TErrors> &
  BanInstance<TErrors>;
export type ReservedKey = keyof BanInstance<Catalog> | FactoryName;
export type NoReserved<T extends Catalog, TReserved extends string = ReservedKey> = {
  readonly [K in keyof T]: K extends TReserved ? never : T[K];
};

export function createBan<const TErrors extends Catalog = EmptyCatalog>(
  options?: BanOptions<TErrors> & { readonly errors?: NoReserved<TErrors> | undefined },
): Ban<TErrors>;
```

Rules and rationale:

- Instance members are function-typed properties, not methods, so `ban.from` and `ban.render` can be
  passed around unbound and `unbound-method` lint stays quiet.
- `validationKey` and `map` are wrapped in `NoInfer`: without it, a typo in `validationKey` makes
  TypeScript infer `TErrors` from `keyof TErrors`, fail the constraint, and fall back to `Catalog`,
  which would accept any string. `create-ban.test-d.ts` proves
  `createBan({ validationKey: 'NOPE' })` is rejected.
- **Reserved keys.** `createBan` rejects at the type level any custom key that is an instance member
  or a built-in factory name, and throws `TypeError` at runtime for the same condition.
- **Overriding a built-in.** A custom key equal to a built-in key replaces that definition; the
  camelCase factory keeps working and uses the replacement.
- `ErrorStatusCode` (2.1) names the registered 4xx and 5xx statuses; a non-standard status such as
  499 needs a cast on the caller's side, and `isErrorStatus()` is the runtime check.

### 2.1 Status codes (`core/status.ts`)

```ts
export type ClientErrorStatusCode = 400 | 401 | ... | 418 | 421 | ... | 426 | 428 | 429 | 431 | 451;
export type ServerErrorStatusCode = 500 | 501 | ... | 508 | 510 | 511;
export type ErrorStatusCode = ClientErrorStatusCode | ServerErrorStatusCode;
export function isErrorStatus(value: unknown): value is ErrorStatusCode;
```

The unions list the IANA-registered members of the 4xx and 5xx classes, the only statuses an error
can carry (`BanErrorInit.status`, `ErrorDefinition.status`, `CustomErrorInit.status`,
`ErrorReport.status`). `isErrorStatus` accepts any integer from 400 to 599: RFC 9110 defines the
classes so that an unregistered code is treated as the `x00` of its class, which is what a
non-standard 499 relies on. 1xx, 2xx, and 3xx are rejected at the type level and at runtime. @ref
https://www.rfc-editor.org/rfc/rfc9110#section-15 @ref
https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml

### 2.2 `@nizam-os/hono-ban` types (`packages/hono-ban/src/create-ban.ts`)

```ts
import type { Context, Env, ErrorHandler } from 'hono';

export type HandlerOptions<
  E extends Env = Env,
  TErrors extends Catalog = Catalog,
> = CoreHandlerOptions<Context<E>, TErrors>; // the core's, with the Hono Context as the callback context
export interface HonoMembers<TErrors extends Catalog> {
  readonly onError: <E extends Env = Env>(options?: HandlerOptions<E, TErrors>) => ErrorHandler<E>;
}
export type BanInstance<TErrors extends Catalog> = CoreBanInstance<TErrors> & HonoMembers<TErrors>;
export type Ban<TErrors extends Catalog> = CoreBan<TErrors> & HonoMembers<TErrors>;
export type ReservedKey = CoreReservedKey | 'onError';
export type NoReserved<T extends Catalog> = CoreNoReserved<T> &
  ('onError' extends keyof T ? never : unknown);

export function createBan<const TErrors extends Catalog = EmptyCatalog>(
  options?: BanOptions<TErrors> & { readonly errors?: NoReserved<TErrors> | undefined },
): Ban<TErrors>;
export function fromHttpException<TErrors extends Catalog>(
  value: unknown,
  ban: Ban<TErrors>,
): BanError | undefined;
```

`@nizam-os/hono-ban`'s `createBan` calls the core's with `adopt` set to `fromHttpException` followed
by the caller's own `adopt`, rejects the catalog key `onError` (type level and `TypeError`), and
returns the core instance with `onError` assigned (6.11). Everything else on the instance is the
core's.

## 3. Built-in catalog

`core/catalog.ts` exports `BUILTIN_CATALOG` (`as const`, `{ status, title }` per key),
`FACTORY_NAMES` (camelCase name to key; aliases point at the same key), and `SECONDARY_KEYS`. Titles
are the IANA reason phrases; RFC 9110 names are used for 413 and 422, and the names they replaced
are kept as factory aliases: `payloadTooLarge` (RFC 7231 section 6.5.11) and `unprocessableEntity`
(RFC 4918 section 11.2; RFC 7231 never defined 422, RFC 9110 appendix B.3 added it from WebDAV).
@ref https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml @ref
https://www.rfc-editor.org/rfc/rfc9110#name-status-codes @ref
https://www.rfc-editor.org/rfc/rfc4918#section-11.2 @ref
https://www.rfc-editor.org/rfc/rfc9110#appendix-B.3

| Key                             | Status | Factory                                   | Title                           |
| ------------------------------- | ------ | ----------------------------------------- | ------------------------------- |
| BAD_REQUEST                     | 400    | badRequest                                | Bad Request                     |
| MALFORMED_JSON                  | 400    | malformedJson                             | Malformed JSON                  |
| UNAUTHORIZED                    | 401    | unauthorized                              | Unauthorized                    |
| PAYMENT_REQUIRED                | 402    | paymentRequired                           | Payment Required                |
| FORBIDDEN                       | 403    | forbidden                                 | Forbidden                       |
| NOT_FOUND                       | 404    | notFound                                  | Not Found                       |
| METHOD_NOT_ALLOWED              | 405    | methodNotAllowed                          | Method Not Allowed              |
| NOT_ACCEPTABLE                  | 406    | notAcceptable                             | Not Acceptable                  |
| PROXY_AUTHENTICATION_REQUIRED   | 407    | proxyAuthenticationRequired               | Proxy Authentication Required   |
| REQUEST_TIMEOUT                 | 408    | requestTimeout                            | Request Timeout                 |
| CONFLICT                        | 409    | conflict                                  | Conflict                        |
| GONE                            | 410    | gone                                      | Gone                            |
| LENGTH_REQUIRED                 | 411    | lengthRequired                            | Length Required                 |
| PRECONDITION_FAILED             | 412    | preconditionFailed                        | Precondition Failed             |
| CONTENT_TOO_LARGE               | 413    | contentTooLarge, payloadTooLarge          | Content Too Large               |
| URI_TOO_LONG                    | 414    | uriTooLong                                | URI Too Long                    |
| UNSUPPORTED_MEDIA_TYPE          | 415    | unsupportedMediaType                      | Unsupported Media Type          |
| RANGE_NOT_SATISFIABLE           | 416    | rangeNotSatisfiable                       | Range Not Satisfiable           |
| EXPECTATION_FAILED              | 417    | expectationFailed                         | Expectation Failed              |
| MISDIRECTED_REQUEST             | 421    | misdirectedRequest                        | Misdirected Request             |
| UNPROCESSABLE_CONTENT           | 422    | unprocessableContent, unprocessableEntity | Unprocessable Content           |
| VALIDATION_FAILED               | 422    | validationFailed                          | Validation Failed               |
| LOCKED                          | 423    | locked                                    | Locked                          |
| FAILED_DEPENDENCY               | 424    | failedDependency                          | Failed Dependency               |
| TOO_EARLY                       | 425    | tooEarly                                  | Too Early                       |
| UPGRADE_REQUIRED                | 426    | upgradeRequired                           | Upgrade Required                |
| PRECONDITION_REQUIRED           | 428    | preconditionRequired                      | Precondition Required           |
| TOO_MANY_REQUESTS               | 429    | tooManyRequests                           | Too Many Requests               |
| REQUEST_HEADER_FIELDS_TOO_LARGE | 431    | requestHeaderFieldsTooLarge               | Request Header Fields Too Large |
| UNAVAILABLE_FOR_LEGAL_REASONS   | 451    | unavailableForLegalReasons                | Unavailable For Legal Reasons   |
| INTERNAL_SERVER_ERROR           | 500    | internalServerError                       | Internal Server Error           |
| NOT_IMPLEMENTED                 | 501    | notImplemented                            | Not Implemented                 |
| BAD_GATEWAY                     | 502    | badGateway                                | Bad Gateway                     |
| SERVICE_UNAVAILABLE             | 503    | serviceUnavailable                        | Service Unavailable             |
| GATEWAY_TIMEOUT                 | 504    | gatewayTimeout                            | Gateway Timeout                 |
| HTTP_VERSION_NOT_SUPPORTED      | 505    | httpVersionNotSupported                   | HTTP Version Not Supported      |
| VARIANT_ALSO_NEGOTIATES         | 506    | variantAlsoNegotiates                     | Variant Also Negotiates         |
| INSUFFICIENT_STORAGE            | 507    | insufficientStorage                       | Insufficient Storage            |
| LOOP_DETECTED                   | 508    | loopDetected                              | Loop Detected                   |
| NOT_EXTENDED                    | 510    | notExtended                               | Not Extended                    |
| NETWORK_AUTHENTICATION_REQUIRED | 511    | networkAuthenticationRequired             | Network Authentication Required |

Rules:

- 418 is not included.
- `MALFORMED_JSON` and `VALIDATION_FAILED` are the secondary entries: they share a status with a
  primary entry so OpenAPI documents and clients can tell them apart.
- **Primary entry per status** (`indexByStatus()` in `definition.ts`): the built-in entry named
  after the status wins; a custom entry only claims a status no built-in covers. 400 resolves to
  `BAD_REQUEST`, 422 to `UNPROCESSABLE_CONTENT`.
- `catalog.test.ts` asserts IANA completeness (every 4xx and 5xx except 418, once each as a
  primary), title equality with the IANA phrase, alias targets, and that every key has a factory.

### 3.1 Headers some statuses require

The library fills in `Content-Type`, the error id header, and `Cache-Control` (6.9). Some statuses
also require a header only the application can write; the factories accept it through `headers`
(`ban.methodNotAllowed({ headers: { Allow: 'GET, HEAD' } })`) and `@nizam-os/hono-ban`'s adopter
keeps it from an `HTTPException` (6.11). The library never fabricates these values.

| Status   | Header                          | Strength | Source                                                 |
| -------- | ------------------------------- | -------- | ------------------------------------------------------ |
| 401      | `WWW-Authenticate`              | MUST     | https://www.rfc-editor.org/rfc/rfc9110#section-15.5.2  |
| 405      | `Allow`                         | MUST     | https://www.rfc-editor.org/rfc/rfc9110#section-15.5.6  |
| 407      | `Proxy-Authenticate`            | MUST     | https://www.rfc-editor.org/rfc/rfc9110#section-15.5.8  |
| 416      | `Content-Range: bytes */N`      | SHOULD   | https://www.rfc-editor.org/rfc/rfc9110#section-15.5.17 |
| 451      | `Link: <...>; rel="blocked-by"` | SHOULD   | https://www.rfc-editor.org/rfc/rfc7725#section-4       |
| 429      | `Retry-After`                   | MAY      | https://www.rfc-editor.org/rfc/rfc6585#section-4       |
| 503, 3xx | `Retry-After`                   | MAY      | https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3  |

For bearer tokens the 401 challenge follows RFC 6750 section 3 (`Bearer realm=..., error=...`), and
RFC 9728 section 5.1 adds `resource_metadata`; `hono/bearer-auth` produces the former and
`@nizam-os/hono-ban`'s `onError` preserves it (6.11). `bearerChallenge()` (3.2) builds the value.
@ref https://www.rfc-editor.org/rfc/rfc6750#section-3 @ref
https://www.rfc-editor.org/rfc/rfc9728#section-5.1

### 3.2 `bearerChallenge(options?)` (`headers/bearer-challenge.ts`, ADR 0013)

```ts
export interface BearerChallengeOptions {
  readonly realm?: string | undefined; // printable ASCII; `"` and `\` escaped as quoted-pairs
  readonly scope?: string | ReadonlyArray<string> | undefined; // scope-tokens, space-joined; empty list omits
  readonly error?: string | undefined; // invalid_request | invalid_token | insufficient_scope | extension
  readonly errorDescription?: string | undefined;
  readonly errorUri?: string | undefined;
  readonly resourceMetadata?: string | undefined; // RFC 9728 5.1
}
export function bearerChallenge(options?: BearerChallengeOptions): string;
```

Returns `Bearer ` followed by the present attributes in the order above, each as `name="value"`,
joined by `, `. With no attribute the result is `Bearer realm=""` (RFC 6750 requires one; this is
what `hono/bearer-auth` sends). Values are checked against RFC 6749 appendix A: `scope-token`,
`error_uri`, and `resource_metadata` must be `NQCHAR` (%x21 / %x23-5B / %x5D-7E), `error` and
`error_description` must be `NQSCHAR` (`NQCHAR` plus space), and `realm` must be printable ASCII;
anything else throws a `TypeError` naming the attribute. A string `scope` is split on single spaces
and each token checked. The function only builds the value; it travels through
`BanErrorOptions.headers`. @ref https://www.rfc-editor.org/rfc/rfc6750#section-3 @ref
https://www.rfc-editor.org/rfc/rfc6749#appendix-A @ref
https://www.rfc-editor.org/rfc/rfc9728#section-5.1 @ref
https://www.rfc-editor.org/rfc/rfc9110#section-5.6.4

## 4. `BanError`

File: `core/ban-error.ts`.

```ts
export interface BanErrorInit extends BanErrorOptions {
  readonly status: ErrorStatusCode;
  readonly code: string;
  readonly title: string;
  readonly definition?: ResolvedDefinition | undefined;
  readonly render?: Renderer | undefined; // injected by factories
}

export class BanError extends Error {
  override readonly name: string = 'BanError';
  readonly status: ErrorStatusCode;
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly type: string | undefined;
  readonly instance: string | undefined;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly headers: Headers;
  readonly definition: ResolvedDefinition | undefined;
  readonly errors: ReadonlyArray<ErrorItem> | undefined;
  constructor(init: BanErrorInit);
  toInit(): BanErrorInit; // rebuild an equivalent error (body cap uses it)
  getResponse(): Response;
  static [Symbol.hasInstance](value: unknown): boolean; // another copy's errors too (ADR 0019)
}
export function isBanError(value: unknown): value is BanError;
```

- `BanError` extends `Error` and nothing else (ADR 0018): the core knows no framework, and
  `instanceof HTTPException` was the one thing a Hono app lost. `@nizam-os/hono-ban` restores the
  behavior that mattered, Hono middleware's `HTTPException` reaching the catalog, through `adopt`
  (6.11). Without `app.onError(ban.onError())`, Hono answers a thrown `BanError` with its
  default 500.
- `super(detail ?? title, { cause })`, so ordinary logging of the error reads well.
- `id` is `init.id ?? generateErrorId()`; `meta` is stored as given (sanitized at render time);
  `headers` is `new Headers(init.headers)`; `errors` is stored as given.
- `getResponse()` uses the injected renderer when present (status, headers including `Content-Type`,
  `safeStringify(body)`); otherwise it returns `{ status, code, title, detail, id }` as
  `application/json` with the error's headers. Neither branch adds the handler's `Cache-Control`
  default or the error id header (6.9); those belong to `ban.handler()`.
- No `process`, `Error.captureStackTrace`, or other non-web globals.
- Recognition across copies of the package (ADR 0019): `BanError.prototype` carries
  `Symbol.for('@nizam-os/ban-core/BanError')`, non-enumerable and non-writable, whose value `1` is
  the version of this section's shape. `BanError[Symbol.hasInstance]` is the ordinary prototype
  check or, called on `BanError` itself, whether the value is an object whose brand is that version;
  a subclass keeps the ordinary check. `isBanError` is `instanceof BanError`, so an error another
  copy built is a `BanError` in every copy, and the handler renders it from its members, `toInit()`,
  and its own `getResponse()`. The version changes when a member listed here changes its name, type,
  or meaning; an error of another version is an unexpected failure.

### 4.1 Error items (`core/error-item.ts`, ADR 0017)

```ts
export interface ErrorItem {
  readonly status?: ErrorStatusCode | undefined;
  readonly code?: string | undefined;
  readonly title?: string | undefined;
  readonly type?: string | undefined;
  readonly detail: string;
  readonly location?: IssueLocation | undefined;
  readonly path?: ReadonlyArray<string | number> | undefined;
  readonly reason?: string | undefined; // the validator's own code (`invalid_type`)
  readonly expected?: string | undefined;
  readonly received?: string | undefined;
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
}
export function itemFromIssue(issue: ValidationIssue, location: IssueLocation): ErrorItem;
export function itemsFromIssues(
  issues: ReadonlyArray<ValidationIssue>,
  location: IssueLocation,
): Array<ErrorItem>;
```

An error reports one problem by default; `errors` is the list of several, each an `ErrorItem`, the
shape every list-bearing wire format shares: JSON:API's error objects, Problem Details' and plain's
`errors` entries, Google's `BadRequest.fieldViolations`, Stripe's `param`. Only `detail` is
required. `status`, `code`, `title`, and `type` give an item its own identity where the format
allows it (7.2.4); `location`, `path`, `reason`, `expected`, and `received` describe a rejected
input; `meta` is per-item metadata. Every factory accepts `errors` (`ban.badRequest({ errors })`);
`ban.validation()` (8.2) is the shorthand that builds the list from validator issues:
`itemFromIssue` keeps `message` as `detail`, `code` as `reason`, and copies `path`, `expected`, and
`received` when defined.

## 5. Factories, `error`, `custom`, `fromStatus`, `assert`, `from`, `adopt`

### 5.1 Factory call forms (`factories.ts`)

```ts
ban.notFound();
ban.notFound('Order 42 does not exist');
ban.notFound('Order 42 does not exist', { meta: { orderId: 42 } });
ban.notFound({ detail: 'Order 42 does not exist', headers: { 'Retry-After': '30' } });
```

`parseFactoryArgs(first, second)`: `undefined` first means `second ?? {}`; a string first is the
`detail` and wins over `second.detail`; an object first is the options; anything else throws
`TypeError` (JavaScript callers).

### 5.2 Construction (`BanCore.build`)

`status`, `title`, `code` come from the resolved definition and cannot be changed per call: the
format's schema pins `status` and `code` with `const`, so a per-call value would make the body
contradict the documented response, and RFC 9457 lets a title change only for localization, which is
the handler's `transform` (6.2) (ADR 0011, ADR 0020). `type` comes from the definition, overridable
by options; `detail`, `instance`, `meta`, `headers`, `cause`, `id` come from options; `id` defaults
to the instance's generator; `definition` and `render` are set. Factories are pure and never throw
except for the argument `TypeError`.

### 5.3 `ban.error(key, options?)` and `ban.custom(init)`

`error` is the generic factory; an unknown key throws `RangeError`. `custom` builds an error with no
catalog definition: `title` defaults to the IANA phrase for `status` (else `'Error'`), `code`
defaults to `'CUSTOM'`, `definition` is `undefined`, so the OpenAPI helpers cannot document it.

### 5.4 `assert(value, error)` (standalone, `assert.ts`)

```ts
export function assert<T>(
  value: T,
  error: () => BanError,
): asserts value is Exclude<NonNullable<T>, false>;
```

Throws `error()` when `value` is `null`, `undefined`, or `false`; `0` and `''` pass. It is a
standalone export rather than `ban.assert()` because TypeScript applies assertion signatures only
when every name in the call target has an explicit type annotation (TS2775), and
`const ban = createBan()` has none. `assert.test-d.ts` proves `User | undefined` narrows to `User`
and `boolean | null` narrows to `true`.

### 5.5 `ban.from(value)` (`from.ts`)

1. `BanError` is returned unchanged.
2. The instance's `adopt` hook (5.7) runs; a `BanError` result is returned. A hook that throws or
   returns something else is treated as declining.
3. Anything else becomes `INTERNAL_SERVER_ERROR` with `detail = UNEXPECTED_DETAIL` and
   `cause = value`.

`from` never throws. `from.test.ts` covers each branch, including a throwing hook.

### 5.6 `ban.fromStatus(status, options?)`

The primary catalog entry for `status` (the one `indexByStatus` holds, so a custom entry sharing a
built-in status does not replace the built-in; override the key instead, section 2) built with
`options`; when no entry has that status, `custom({ ...options, status })`. The building block for
adopters that receive a status from somewhere else, such as `fromHttpException` (6.11).

### 5.7 `adopt` (`createBan({ adopt })`)

`adopt(value, ban)` recognizes thrown values that already describe an HTTP outcome and returns the
`BanError` for them, or `undefined`. It runs inside `from()` (5.5) and ahead of `map` in the handler
(6.3), and what it returns counts as handled: an adopted value is a deliberate error, not an
unexpected one. `map` remains the place for domain errors that are not HTTP-shaped. Adapters install
their own adopter and run the caller's after it (`@nizam-os/hono-ban`, 6.11); the core ships none.

## 6. The handler, and `onError` for Hono

File: `handler/handler.ts`. `ban.handler(options?)` returns a `BanHandler<TContext>`: a function
from the thrown value, the request facts, and a caller-chosen context to a `Response`. It is
framework-free; `@nizam-os/hono-ban` wraps it as `ban.onError()` (6.11), and any other host passes
`fromRequest(request)` from a fetch handler, a router's error hook, or a test.

```ts
export interface ErrorRequest {
  readonly method: string;
  readonly path: string; // the URL path without the query
  header(name: string): string | undefined; // case-insensitive
}
export function fromRequest(request: Request): ErrorRequest; // handler/request.ts

export type BanHandler<TContext = void> = (
  thrown: unknown,
  request: ErrorRequest,
  ctx: TContext,
) => Promise<Response>;

export interface HandlerOptions<TContext = void, TErrors extends Catalog = Catalog> {
  readonly includeStack?: boolean | undefined; // default false
  readonly requestIdHeader?: string | false | undefined; // default 'X-Request-Id'
  readonly requestId?: ((ctx: TContext) => string | undefined) | undefined; // replaces the header lookup
  readonly traceId?: ((ctx: TContext) => string | undefined) | undefined; // replaces traceparent parsing
  readonly onReport?: ((report: ErrorReport, ctx: TContext) => void | Promise<void>) | undefined;
  readonly headers?: HeadersInit | undefined;
  readonly errorIdHeader?: string | false | undefined; // default 'X-Error-Id'
  readonly maxBodyBytes?: number | undefined; // default 65536
  readonly transform?: ((body: unknown, error: BanError, ctx: TContext) => unknown) | undefined;
  readonly map?: ErrorMapper<TErrors> | undefined; // overrides the instance map
}
```

`TContext` defaults to `void`, so `handle(thrown, request)` is a complete call when the callbacks
need nothing from the host; `ban.handler<MyContext>()` makes the third argument required and types
it for every callback. The callbacks receive the context unchanged.

`ban.handler()` itself throws `TypeError` when `requestIdHeader` or `errorIdHeader` is not a valid
HTTP field name or when `headers` holds a name or value the `Headers` constructor rejects
(`headers.ts`). `Headers` throws the same `TypeError` from `set()` and from its constructor; checked
once at construction, the mistake fails at startup instead of inside the header merge (6.9) that
both fallback tiers share, where it would affect every response. @ref
https://fetch.spec.whatwg.org/#dom-headers-set @ref
https://fetch.spec.whatwg.org/#concept-headers-fill

### 6.1 Guarantees

- Resolves to a `Response` for every value, `Error` or not; never throws or rejects.
- Calls `onReport` exactly once per invocation and swallows anything `onReport` throws.
- Hono itself only routes `Error` instances to `onError`; a thrown string or plain object is
  rethrown by Hono before `@nizam-os/hono-ban`'s handler runs (`handleError` in `hono-base.ts`).
  Hosts that call `ban.handler()` themselves can pass anything.

### 6.2 Algorithm

```
(thrown, request, ctx):
  try {
    requestId = options.requestId ? options.requestId(ctx) : readRequestId(request.header(requestIdHeader))  // 6.5
    trace     = options.traceId ? { traceId: options.traceId(ctx) } : parseTraceparent(request.header('traceparent'))  // 6.6
    { error, handled } = resolveThrown(thrown, ban, core, map)                                          // 6.3
    renderOptions = { requestId, traceId, instance: request.path, method: request.method, includeStack }
    rendered = render(error, renderOptions)                                                             // 6.7
    apply = (body) => transform ? transform(body, error, ctx) : body
    text = capBody(apply(rendered.body), error, renderOptions, render, maxBodyBytes, apply)             // 6.8
    headers = mergeHeaders(options.headers, rendered.headers, errorIdHeader, error.id)                   // 6.9
    await report(onReport, buildReport({...}), ctx)                                                     // 10.1
    return new Response(text, { status: error.status, headers })
  } catch (failure) {
    return fallback(failure, thrown, request, ctx)                                                      // 6.4
  }
```

`transform` runs before the size cap and again on the minimal body when the cap re-renders (6.8).
`onReport` is awaited; fire-and-forget work belongs in the host's own mechanism inside the callback
(`c.executionCtx.waitUntil()` on Hono, where `ctx` is the `Context`).

`transform` is also the localization point. RFC 9457 allows `title` to change between occurrences
only for localization (section 3.1.3), and the catalog fixes `title` (ADR 0011), so a localized body
is produced by `transform` from the request's `Accept-Language`, and the application states the
language with `Content-Language` through `options.headers` or the error's headers; the library never
sets `Content-Language`. Every built-in schema documents `title` as a string with the catalog's
title as its example (7), so a localized body still matches the response its route documents (ADR
0020). @ref https://www.rfc-editor.org/rfc/rfc9457#section-3.1.3 @ref
https://www.rfc-editor.org/rfc/rfc9110#section-8.5

### 6.3 `resolveThrown` (`resolve.ts`)

A `BanError` is used as is with `handled: true`. Otherwise the `adopt` hook (5.7) runs: a `BanError`
result is used with `handled: true`; `undefined` falls through; any other value throws `TypeError`
(a handler failure), and so does a hook that throws. Then `map`, when set, runs under the same
rules. Without a mapping the value becomes the constant `INTERNAL_SERVER_ERROR` with
`cause = thrown` and `handled: false`.

### 6.4 `fallback`

1. Build `INTERNAL_SERVER_ERROR` with `UNEXPECTED_DETAIL` and `cause = thrown`, render it through
   the format with default options, apply the header merge, respond 500.
2. If that throws too (the format is broken), respond with a hand-built `application/json` body
   `{ status: 500, title: 'Internal Server Error', detail, id }`. The header merge (6.9) still
   applies, so `options.headers` and the error id header are present (10.2).
3. If the merge itself throws (`options.headers` changed or started throwing after the construction
   check), `lastResortHeaders` answers with `Content-Type`, `Cache-Control: no-store`, and the error
   id header only; the header name was validated at construction, so this tier cannot throw.

Then report once with `handled: false` and `handlerFailure` set. Tests: a throwing format, a
throwing `map`, a `map` returning a non-`BanError`, a throwing `onReport` (the resolved status is
kept, not turned into 500), a `headers` getter that throws after construction (tier 3 keeps the id
in the header), header options rejected at construction, a throwing or ill-typed `adopt` hook.

### 6.5 Request id (`request-id.ts`)

`readRequestId(value)` returns the value only when it matches `REQUEST_ID_PATTERN`. The library
never fabricates a request id; the error id is the correlation key. `requestIdHeader: false`
disables the lookup.

### 6.6 traceparent (`traceparent.ts`)

`parseTraceparent(value)` returns `{ traceId, parentId, sampled } | undefined`. It matches
`TRACEPARENT_PATTERN` (lowercase hex only), rejects version `ff`, requires exactly 55 characters for
version `00`, accepts other versions when the first 55 characters parse and are followed by `-` or
nothing, rejects all-zero trace or parent ids, and reads the sampled bit from the flags. @ref
https://www.w3.org/TR/trace-context/#traceparent-header

### 6.7 `render` (`render.ts`, shared with `getResponse()`)

1. `meta = sanitizeMeta(error.meta)`.
2. `stack` when `includeStack` and `status >= 500`: the cause's stack when the cause is an `Error`,
   else the error's own.
3. `ctx.instance = error.instance ?? options.instance` (an explicit instance on the error wins over
   the request path).
4. `body = error.errors ? format.renderErrors(error, error.errors, ctx) : format.render(error, ctx)`;
   an empty list still goes through `renderErrors`.
5. Returns `{ status, headers: error.headers plus Content-Type: format.contentType, body }`.

### 6.8 Body cap (`body-cap.ts`)

Serialize with `safeStringify` (bigint becomes a string; a cycle throws and becomes a handler
failure). If the UTF-8 length exceeds `maxBodyBytes`, rebuild the error from `toInit()` with
`meta: {}`, no `errors`, and `detail` cut to 1024 characters, render again with `truncated: true`
and `includeStack: false`, run the handler's `transform` on that body too (so a redaction applied to
the first body cannot reappear), and return it.

The cap bounds the members a request can inflate: `meta`, the `errors` list, `detail`, and the
stack. The members left in the minimal body (`type`, `status`, `title`, `code`, `id`, `instance`,
the request id, the trace id) come from the catalog, the id generator, the request line, and the
128-character request id pattern, so they are bounded by the operator, and the minimal body is
returned as is even when a very small `maxBodyBytes` sits below their size. Tests: an oversized
`meta` and an oversized `errors` list are dropped, the detail is cut, a stack is dropped, and a
redacting `transform` still applies.

### 6.9 Header merge order

`Cache-Control: no-store` unless `options.headers` carries a `Cache-Control`; then
`options.headers`; then every header of the rendered response (the error's headers plus
`Content-Type`), so an error's own `Cache-Control` wins too; then `errorIdHeader: error.id` unless
disabled. The default exists because 404, 405, 410, 414, and 501 are heuristically cacheable (RFC
9110 section 15.1), every body carries an occurrence id, so a shared cache could replay one client's
error to another, and a 429 MUST NOT be stored (RFC 6585 section 4); see ADR 0012. Both fallback
tiers (6.4) run the same merge. `BanError.getResponse()` outside the handler adds no
`Cache-Control`. @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.1 @ref
https://www.rfc-editor.org/rfc/rfc9111#section-5.2.2.5 @ref
https://www.rfc-editor.org/rfc/rfc6585#section-4

`Set-Cookie` is the exception to "later wins": its values never combine and iteration yields each
cookie separately, so the rendered response's cookies are appended after those from
`options.headers` instead of replacing them (@ref
https://fetch.spec.whatwg.org/#dom-headers-getsetcookie). The handler never sets `Vary`. The library
owns only the configured error id header name: renaming or disabling it does not reserve
`X-Error-Id`, so a header of that name supplied through `options.headers` or on the error passes
through unchanged.

### 6.10 Postgres mapper (`@nizam-os/ban-core/postgresql`, ADR 0015)

`postgresMapper(options?)` returns a `map` for `createBan` or `ban.handler` that turns a Postgres
driver error into a catalog entry by SQLSTATE with constant client-facing text. Files:
`postgresql/error.ts` (recognition), `postgresql/sqlstate.ts` (the built-in table),
`postgresql/options.ts` (option types and construction checks), `postgresql/index.ts` (the mapper).
No driver is imported (ADR 0009). @ref
https://www.postgresql.org/docs/current/errcodes-appendix.html @ref
https://www.postgresql.org/docs/current/protocol-error-fields.html

Recognition. `findPostgresError(value)` returns `value` itself or the first object reached through
`cause`, `original`, or `nativeError` (the first of those that is an object, at each level; at most
eight links) whose `code` or `errno` matches `^[0-9A-Z]{5}$` and whose `severity` or
`severity_local` is a string. That covers node-postgres, PGlite, and Neon (`code`, `severity`),
postgres.js (`code`; `severity` from field `V`, absent behind PgBouncer and before 9.6, hence
`severity_local` from field `S`), Bun (the SQLSTATE on `errno`, an `ERR_POSTGRES_*` constant on
`code`), and the wrappers of Drizzle and Slonik (`cause`), Sequelize 6 (`original`), and Objection's
`db-errors` (`nativeError`); Kysely rethrows the driver error, and TypeORM and MikroORM copy its
fields onto their own error. A severity field is required because Node system errors (`EPIPE`) and
Prisma (`P2002`) also use five-character codes. `readPostgresFields(error)` returns
`{ sqlstate, errorClass, constraint, table, schema, column, dataType }`, the SQLSTATE from `code`
else `errno`, each object field from the node-postgres name else the postgres.js name
(`constraint_name`, `table_name`, `schema_name`, `column_name`, and `data type_name`, with the space
of the protocol's "Data type name"), and a field that is not a string as undefined (Bun's `column`
is a number when the server sent no field `c`). `dataType` is field `d`, which PostgreSQL sets when
a domain's CHECK or NOT NULL fails: the domain's name, the only field that tells apart two domains'
constraints of the same name, since such a violation carries no table or column. `PostgresErrorLike`
declares every member optional; `postgres.test-d.ts` checks postgres.js's `PostgresError` against it
field by field. Prisma is out of scope: its client error carries no `cause` and its adapter converts
the pg error into its own payload.

Algorithm for a recognized error with fields `f` and the thrown value `thrown`:

1. `named` is `constraints[f.constraint]`, else `columns[f.table + '.' + f.column]`, else
   `columns[f.column]`, each only when the field is defined and the table has the key as an own
   property (a constraint named `constructor` must not reach the prototype).
2. When `named` has `issue`: return
   `ban.validation([{ path, message, code }], { location: issue.location ?? 'body', cause: driverError })`.
3. `sources` is, in order and skipping absent ones: `named` (a string is `{ detail }`),
   `codes[f.sqlstate]`, `codes[f.errorClass]`, the last two as own properties like step 1 (an
   inherited entry was never validated at construction, which reads own properties too); `fallback`
   is `sqlstateDefault(f.sqlstate, f.errorClass)` from the table below.
4. When `sources` is empty and `fallback` is undefined: return `undefined`, so 6.3 falls through to
   `from()` (the constant 500, `handled: false`).
5. `key`, `detail`, `meta`, and `headers` each come from the first source that sets them, then
   `fallback`, then `INTERNAL_SERVER_ERROR` and `UNEXPECTED_DETAIL`.
   `error = ban.error(key, { detail, meta, headers, cause: driverError })`. When `retryAfter` is
   set, `error.status` is 503, and the error carries no `Retry-After`, set
   `Retry-After: String(retryAfter)`. Return `error`.

The `cause` is the recognized driver error for every mapping kind, issue mappings included, never
the thrown wrapper: Drizzle's `DrizzleQueryError` message carries the query and its parameters, and
6.7 renders the cause's stack on a 5xx under `includeStack`. `ErrorReport.cause` stays the thrown
value (10.1) and `ErrorReport.error.cause` is the driver error. With `includeStack` on, a mapped 5xx
body's stack begins with the server's message (relation, column, and role names, or `RAISE` text);
with it off, nothing from the driver reaches a body.

Construction. `TypeError` for a `codes` key not matching `^(?:[0-9A-Z]{5}|[0-9A-Z]{2})$`, a `codes`
value that is a string or an issue mapping, a `constraints` or `columns` value that is neither a
string nor an object, an `issue` without an array `path` and a string `message`, or `headers` the
`Headers` constructor rejects (the message names the entry; same check as 6.4). `RangeError` for a
`retryAfter` that is not a non-negative safe integer (`String(1e21)` is `1e+21`, which is not RFC
9110 `delay-seconds`). A `key` the ban's catalog lacks throws the `RangeError` of `ban.error` at map
time, a handler failure (6.4).

Types.
`postgresMapper<TKeys extends string = never>(options?: PostgresMapOptions<TKeys>): PostgresMapper<TKeys>`;
`TKeys` is inferred from every `key` the options name. `PostgresMapper<TKeys>` is
`<TErrors extends CatalogWith<TKeys>>(thrown: unknown, ban: Ban<TErrors>) => BanError | undefined`
with `CatalogWith<TKeys> = Catalog & Readonly<Record<Exclude<TKeys, BuiltinKey>, ErrorDefinition>>`,
so a mapper is accepted by every ban whose catalog defines the custom keys it names, and a mapper
naming only built-in keys by every ban, without a type argument. `PostgresMapping` (`key?`,
`detail?`, `meta?`, `headers?`, `issue?: never`) and `PostgresIssueMapping` (`issue: PostgresIssue`)
are told apart by `issue`; `PostgresIssue` is `{ path, message, location?, code? }`.

Built-in table (`sqlstate.ts`). A code is looked up first, then its class; a SQLSTATE not listed and
outside a listed class has no row.

| SQLSTATE                                        | Condition                                                                                                    | Entry                   | Detail                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------- | ----------------------------------------------------- |
| 23505                                           | unique_violation                                                                                             | `CONFLICT`              | A record with the same value already exists           |
| 23P01                                           | exclusion_violation                                                                                          | `CONFLICT`              | A record overlaps an existing one                     |
| 23503                                           | foreign_key_violation, both directions (fields `n` and `t` name the FK-side constraint and table either way) | `CONFLICT`              | A referenced record does not exist or is still in use |
| 23001                                           | restrict_violation (PostgreSQL 18 for `ON DELETE RESTRICT`; earlier versions raise 23503)                    | `CONFLICT`              | A record is still in use                              |
| 23502                                           | not_null_violation (fields `t` and `c`, no `n`: reachable through `columns`, not `constraints`)              | `UNPROCESSABLE_CONTENT` | A required value is missing                           |
| 23514                                           | check_violation                                                                                              | `UNPROCESSABLE_CONTENT` | A value violates a constraint                         |
| 40002                                           | transaction_integrity_constraint_violation (not raised by PostgreSQL; wire-compatible servers)               | `CONFLICT`              | The change conflicts with existing records            |
| 40001, 40P01, 55P03, 25006                      | serialization_failure, deadlock_detected, lock_not_available, read_only_sql_transaction                      | `SERVICE_UNAVAILABLE`   | Temporarily unavailable, try again later              |
| class 22                                        | data_exception                                                                                               | `UNPROCESSABLE_CONTENT` | A value is invalid or out of range                    |
| class 23                                        | any other integrity_constraint_violation                                                                     | `UNPROCESSABLE_CONTENT` | A value violates a constraint                         |
| classes 08, 40, 53, 57                          | connection_exception, transaction_rollback, insufficient_resources, operator_intervention                    | `SERVICE_UNAVAILABLE`   | Temporarily unavailable, try again later              |
| 08007, 40003, 53400, 57014, 2200H, 22P04, 22012 | excluded from their class row (see below)                                                                    | none                    |                                                       |

503 is reserved for conditions where the same request is expected to succeed after a delay, and
`Retry-After` is attached only there. 08007 and 40003 mean the commit outcome is unknown, so a 503
would invite resubmitting a write that may have been applied (RFC 9110 section 9.2.2). 57014 is a
statement timeout, an operator cancel, or the client's own abort, which the SQLSTATE cannot tell
apart, so it maps to nothing rather than promising a retry; teams that use `statement_timeout` for
load shedding set `codes: { '57014': { key: 'SERVICE_UNAVAILABLE' } }` (or `GATEWAY_TIMEOUT`). 53400
(`temp_file_limit`) is per query and fails again. 2200H, 22P04, and 22012 come from the
application's SQL rather than a client value. 08P01 reads as transient because PgBouncer sends it as
the default SQLSTATE of every pooler error, although PostgreSQL raises it for a client protocol
mistake; `codes: { '08P01': { key: 'INTERNAL_SERVER_ERROR' } }` selects the other reading. 42501
(`insufficient_privilege`) and P0001 (`raise_exception`) have no row because in a single-role
deployment they are deployment or program errors;
`codes: { '42501': { key: 'FORBIDDEN' }, P0001: { key: 'BAD_REQUEST', detail: '...' } }` serves
row-level-security and `RAISE`-based deployments, and a custom `ERRCODE` maps the same way. 40001,
40P01, and 55P03 are 503 rather than 409 because the client retries the identical request and ADR
0007 rules out describing the conflict; with `googleApi()` they render `status: UNAVAILABLE`, and a
409 entry through `codes` renders `ABORTED` (7.6.1). @ref
https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2 @ref
https://www.rfc-editor.org/rfc/rfc9110#section-15.6.4 @ref
https://www.postgresql.org/docs/current/transaction-iso.html @ref
https://github.com/pgbouncer/pgbouncer/blob/master/src/proto.c

### 6.11 `onError` for Hono (`packages/hono-ban/src`)

`ban.onError(options?)` on a `@nizam-os/hono-ban` instance returns a Hono `ErrorHandler<E>`:

```
handle = core.handler<Context<E>>(options)
(thrown, c) => passthroughResponse(thrown) ?? handle(thrown, { method: c.req.method, path: c.req.path, header: (n) => c.req.header(n) }, c)
```

The Hono `Context` is the handler context, so `requestId`, `traceId`, `transform`, and `onReport`
receive `c`, typed by `ban.onError<E>()`. Everything in 6.1 to 6.10 applies unchanged; this section
adds what Hono needs.

`fromHttpException(value, ban)` is the adopter `createBan` installs (5.7), ahead of the caller's own
`adopt`. For an `HTTPException` whose `status` passes `isErrorStatus`: if `status === 400` and
`message === MALFORMED_JSON_MESSAGE` (Hono's validator, exact match) the entry is `MALFORMED_JSON`,
else `ban.fromStatus(status)` (5.6). `detail` is the message unless empty; the body of `value.res`
is discarded and every header is copied except those describing that body (`BODY_HEADERS`:
`Content-Type`, `Content-Length`, `Content-Encoding`, `Content-Location`, `Content-Range`,
`Transfer-Encoding`), because a kept `Content-Length` truncates the rendered body on the wire and a
kept `Content-Encoding` makes clients decompress plain text; `cause = value`. `Content-Range` is
kept when `status === 416`: there it states the selected representation's complete length
(`bytes */N`), not the body's range, and RFC 9110 says a 416 SHOULD carry it. Anything else,
including an `HTTPException` outside the error classes, is declined. @ref
https://github.com/honojs/hono/blob/main/src/validator/validator.ts @ref
https://www.rfc-editor.org/rfc/rfc9110#section-8.3 @ref
https://www.rfc-editor.org/rfc/rfc9110#section-14.4 @ref
https://www.rfc-editor.org/rfc/rfc9110#section-15.5.17

`passthroughResponse(thrown)`: an `HTTPException` outside the 4xx and 5xx classes is not an error
but a short-circuit (a redirect thrown from middleware). Hono's default handler answers it with
`getResponse()`, and so does `onError`, without rendering or reporting; `getResponse()` failing
yields `undefined` and the value falls into the pipeline as an unexpected error. Hono 1.x's
`BanError extends HTTPException` had the inverse problem, a 302 rendered as an error body. @ref
https://github.com/honojs/hono/blob/main/src/hono-base.ts

`MALFORMED_JSON_MESSAGE` (`'Malformed JSON in request body'`) and `BODY_HEADERS` live in
`packages/hono-ban/src/http-exception.ts`; the core has no use for them. Tests: `create-ban.test.ts`
drives a Hono app (bearer-auth 401 keeping `WWW-Authenticate`, the built-in validator's JSON
failure, body headers dropped and `Content-Range` kept, a thrown 302 passed through, the context
reaching every callback, request id and traceparent headers, the reserved key `onError`);
`http-exception.test.ts` covers both functions directly.

## 7. Formats

```ts
export type SchemaDialect = 'draft-2020-12' | 'openapi-3.0';

export interface RenderContext {
  readonly requestId: string | undefined;
  readonly traceId: string | undefined;
  readonly instance: string | undefined;
  readonly method: string | undefined;
  readonly includeStack: boolean;
  readonly docsBaseUrl: string | undefined;
  readonly meta: Readonly<Record<string, unknown>>; // sanitized
  readonly stack: string | undefined;
  readonly truncated: boolean;
}

export interface SchemaContext {
  readonly docsBaseUrl: string | undefined;
  readonly dialect: SchemaDialect;
  readonly objectRef?: ((key: string) => string) | undefined; // section 9
}

export interface ErrorFormat<TBody = unknown> {
  readonly name: string;
  readonly contentType: string;
  render(error: BanError, ctx: RenderContext): TBody;
  renderErrors(error: BanError, errors: ReadonlyArray<ErrorItem>, ctx: RenderContext): TBody;
  schema(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
  errorsSchema(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
  mixedSchema?(definitions: ReadonlyArray<ResolvedDefinition>, ctx: SchemaContext): JsonSchema;
  objectSchema?(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
}
```

`render` and `schema` describe an error that reports one problem; `renderErrors` and `errorsSchema`
describe one carrying a list (4.1), `ban.validation()` included. A format decides how items appear
(entries, separate objects, field violations) and whether per-item identity is honored (7.2.4); a
format that honors it defines `mixedSchema`, the schema of a list whose items each carry the
identity of one of `definitions`, which `errorResponses` reads (9), and `objectSchema`, the schema
of one entry's item in such a list, which `errorObjectSchemas` reads. When `ctx.objectRef` is set,
`mixedSchema` puts `{ $ref: ctx.objectRef(key) }` in place of each item's schema, so a document can
hold each entry's object once (9).

Constant members are spelled with `constant(value, dialect)` (`schema-helpers.ts`): `{ const }` for
JSON Schema 2020-12 and OpenAPI 3.1, `{ enum: [value] }` for OpenAPI 3.0, which predates `const`.
Problem Details schemas leave `additionalProperties: true` (extension members are allowed);
JSON:API, plain, Google API, and Stripe schemas are closed. @ref
https://spec.openapis.org/oas/v3.1.0#schema-object @ref
https://spec.openapis.org/oas/v3.0.3#schema-object

A `title` is spelled with `localizable(value, dialect)`: `{ type: 'string', examples: [value] }`, or
`{ type: 'string', example: value }` for OpenAPI 3.0, whose Schema Object has `example` and no
`examples`. The handler's `transform` may localize a title (6.2), so no schema pins one; `status`
and `code` identify the entry (ADR 0020). @ref
https://json-schema.org/draft/2020-12/json-schema-validation#section-9.5 @ref
https://spec.openapis.org/oas/v3.0.4.html#fixed-fields-20

### 7.1 Problem Details (`formats/problem-details`)

```ts
export interface ProblemDetailsOptions {
  readonly typeBaseUrl?: string | undefined; // base for derived `type`; wins over the instance docsBaseUrl
  readonly includeCode?: boolean | undefined; // default true
  readonly includeId?: boolean | undefined; // default true
  readonly traceIdMember?: string | false | undefined; // default 'traceId'
  readonly instance?: boolean | undefined; // default true
}
```

`contentType = 'application/problem+json'`, no `charset` parameter. @ref
https://www.rfc-editor.org/rfc/rfc9457#section-3

`problemDetails()` throws `TypeError` (`internal/member-name.ts`) when `traceIdMember` is a reserved
member name other than `traceId` (7.1.2), a `PROTO_KEYS` entry, or does not match
`EXTENSION_NAME_PATTERN`: `renderBase` writes the trace id after the library members and the
standard members are spread last, so `'status'` would replace the numeric status and `'id'` the
error id, and a name outside the grammar is not an extension member by the format's own rule.

#### 7.1.1 `render`

Emitted order: `type`, `status` (number), `title`, `detail` (when defined), `instance` (when enabled
and known), `code`, `id`, `[traceIdMember]` (when known), `stack` (when present), then each `meta`
extension member whose name is not reserved (7.1.2). `type` is `error.type` (an explicitly declared
URI, ADR 0010), else `${typeBaseUrl ?? ctx.docsBaseUrl}/${code}`, else `about:blank`. @ref
https://www.rfc-editor.org/rfc/rfc9457#section-4.2.1

#### 7.1.2 Extension members (`extension-members.ts`, ADR 0008)

`flattenMeta(meta)` copies each key matching `EXTENSION_NAME_PATTERN` to the top level and keeps the
others under one `meta` member (merged into an existing plain-object `meta` key, otherwise replacing
it). The renderer then drops every flattened key whose name is reserved: `type`, `status`, `title`,
`detail`, `instance`, `code`, `id`, `traceId`, `stack`, `errors`, and the configured
`traceIdMember`. Reserved names are dropped whether or not this error emits the member, so a
`meta.detail` of `42` can never become the `detail` of an error that has none and the body always
matches its own schema. Tests: a `meta` with `status: 'nope'` renders `status: 404`; `x` and `1st`
end up under `meta`; `retryAfter` is top level; `detail: 42` on an error without a detail is
dropped. @ref https://www.rfc-editor.org/rfc/rfc9457#section-3.2 @ref
https://www.rfc-editor.org/rfc/rfc9457#section-4 (extension member naming, the paragraph after the
definition requirements)

#### 7.1.3 `renderErrors`

Same body with the `location` extension member when `meta.location` is set (8.2) and `errors`, one
entry per item. `detail` is the error's own; `ban.validation()` supplies
`'Request validation failed'` when the caller gives none:

```json
"errors": [
  { "location": "body", "pointer": "/email", "detail": "Invalid email address", "code": "invalid_format" },
  { "location": "query", "name": "page", "detail": "Expected number", "code": "invalid_type" }
]
```

Entries (`ErrorEntry` in `error-entries.ts`, built by `toErrorEntries(errors, fallback)`) carry
`detail`, optional `location` (the item's, else the error's `meta.location`), optional `code` (the
item's `reason`), `expected`, `received`, plus `pointer` for `body`, `form`, and items with a path
but no location, or `name` (first path segment) for `query`, `param`, `header`, `cookie`. An item
without a path has neither. The item's own `status`, `code`, `title`, `type`, and `meta` are not
rendered: Problem Details describes one problem per document (ADR 0017).

#### 7.1.4 `schema`

```json
{
  "type": "object",
  "required": ["type", "status", "title"],
  "properties": {
    "type": { "type": "string", "format": "uri-reference" },
    "status": { "const": 404 },
    "title": { "type": "string", "examples": ["Not Found"] },
    "detail": { "type": "string" },
    "instance": { "type": "string", "format": "uri-reference" },
    "code": { "const": "NOT_FOUND" },
    "id": { "type": "string" },
    "traceId": { "type": "string", "pattern": "^[0-9a-f]{32}$" }
  },
  "additionalProperties": true
}
```

Optional members appear only when the matching option is on. `errorsSchema` adds `errors` (array of
the entry schema, `ERROR_ENTRIES_SCHEMA`, each entry requiring only `detail`) and requires it.

### 7.2 JSON:API (`formats/json-api`)

```ts
export interface JsonApiOptions {
  readonly typeLinkBaseUrl?: string | undefined; // base for derived `links.type`; wins over docsBaseUrl
  readonly aboutLink?: ((error: BanError, ctx: RenderContext) => string | undefined) | undefined;
  readonly includeId?: boolean | undefined; // default true
  readonly traceIdMetaKey?: string | false | undefined; // default 'traceId'
  readonly mixedEntries?: boolean | undefined; // default false (7.2.4)
  readonly document?: JsonApiDocumentMembers | undefined; // top-level jsonapi, links, meta (7.2.5)
}
```

`contentType = 'application/vnd.api+json'` without parameters. @ref
https://jsonapi.org/format/#content-negotiation-servers

`jsonApi()` throws `TypeError` when `traceIdMetaKey` is a `meta` key the format writes itself
(`stack`, `location`, `name`, `code`, `expected`, `received`), a `PROTO_KEYS` entry, or not a
JSON:API member name (at least one character; starts and ends with a letter, digit, or a code point
at U+0080 or above; `-`, `_`, and space allowed in between). @ref
https://jsonapi.org/format/#document-member-names

#### 7.2.1 `render`

`{ errors: [errorObject] }` with members in this order, omitting undefined ones: `id`, `links`
(`type` from `error.type` or `${base}/${code}` with `base = typeLinkBaseUrl ?? ctx.docsBaseUrl`,
`about` from `aboutLink`; omitted when both are missing), `status` as a string, `code`, `title`,
`detail`, `meta` (`ctx.meta` plus `[traceIdMetaKey]` and `stack`; omitted when empty). @ref
https://jsonapi.org/format/#error-objects

#### 7.2.2 `renderErrors` (`error-object.ts`)

One error object per item sharing `id` and, by default, the error's `status`, `code`, and `title`
(7.2.4), with `detail = item.detail`, `links.type` from `item.type` else as in 7.2.1, `source` =
`{ pointer }` for `body`, `form`, and a path with no location, `{ parameter }` for `query`,
`{ header }` for `header`, omitted for `param` and `cookie` (JSON:API defines no member for them)
and for items without a path, and `meta` = shared meta, then the item's own `meta` (sanitized), then
`location` (the item's, else `meta.location` of the error), `name` (param and cookie only), `code`
(the item's `reason`), `expected`, `received`. An empty list renders the error itself as the one
object (7.2.1 with `meta.location`), because `errors` must hold at least one object (7.2.3);
`ban.validation([])` therefore shows `'Request validation failed'` as that object's `detail`. @ref
https://jsonapi.org/format/#errors-processing

#### 7.2.3 `schema` (`schema.ts`)

Closed body `{ errors: [ErrorObject, ...] }`; error objects require `status`, `code`, `title`,
constrain `status` (as a string) and `code` to the definition's values, give the definition's
`title` as the example of a string (7), type `links` (`type` and `about` as `format: uri-reference`,
the class JSON:API assigns to link strings), `source`, and `meta`, and are closed too.
`errorsSchema` is the same document unless `mixedEntries` is on (7.2.4); both admit the configured
`document` members (7.2.5). @ref https://jsonapi.org/format/#document-links @ref
https://www.rfc-editor.org/rfc/rfc3986#section-4.1

#### 7.2.4 `mixedEntries` and `responseStatus` (`response-status.ts`)

JSON:API lets one document report problems from different sources, each error object with its own
`status`, `code`, and `title`. By default the format ignores an item's identity members and renders
the error's, so every object matches the pinned schema (ADR 0011). With `mixedEntries: true`,
`renderErrors` uses `item.status`, `item.code`, and `item.title` when present (the derived
`links.type` then follows the item's code; an item with no code keeps the error's `type`), and
`errorsSchema` types `status` as a string matching `^[45][0-9]{2}$`, and `code` and `title` as
strings, instead of pinning them. `schema` stays pinned either way: only lists may mix. The format
then also defines `mixedSchema(definitions, ctx)`: the closed document whose objects are each the
pinned object of one definition, under `anyOf` when there are several, so an object's `status` and
`code` always belong to one entry; an empty list throws `TypeError`, since no document matches it.
It also defines `objectSchema(definition, ctx)`, that pinned object of one definition; with
`ctx.objectRef` set, `mixedSchema` references each object at `ctx.objectRef(definition.key)` instead
of inlining it. Without `mixedEntries` the format has neither.

`responseStatus(errors)` returns the HTTP status for a mixed list the way the specification asks,
"the most generally applicable HTTP error code": the one status every item shares, else 400 when
every status is a client error, else 500; items without a status are skipped and `undefined` is
returned when none has one. Callers combine it with `ban.fromStatus()` (5.6). @ref
https://jsonapi.org/format/#errors-processing

#### 7.2.5 `document`

`document: { jsonapi?, links?, meta? }` adds those top-level members verbatim to every document the
format renders, in the order `jsonapi`, `errors`, `links`, `meta`; `schema` and `errorsSchema` admit
each configured member as an object. They are static per format instance (a version object, a
service link), not per error. @ref https://jsonapi.org/format/#document-top-level

### 7.3 Plain (`formats/plain`)

`contentType = 'application/json'`. Body order: `status`, `code`, `title`, `detail`, `id`,
`instance`, `traceId`, `meta` (nested, omitted when empty), `stack`, `errors` (`renderErrors` only;
Problem Details entry shape, 7.1.3). Schema is closed, pins `status` and `code`, and documents
`title` as in 7.

### 7.4 Conformance (`testing`)

```ts
assertFormatConformance(format, catalog, { compile, docsBaseUrl? })
```

`compile(schema)` returns a validator `(body) => problems[]`; the repository uses Ajv 2020 with
`ajv-formats` (`test-support/ajv.ts`). For every definition it renders a minimal error, one with
`detail`, colliding and short `meta` keys, nested meta, and headers, one with a stack, and per
location three lists: two validator items, none (`ban.validation([])` is legal, and a schema that
demands at least one entry must still be met), and two mixed items carrying their own `status`,
`code`, `title`, `type`, and `meta`, one with a path and no location (a format may render or ignore
those members, and its `errorsSchema` must accept the result either way). Each body is validated
against `schema` or `errorsSchema` (dialect `draft-2020-12`); the labels are `minimal`, `meta`,
`stack`, `errors/<location>`, `errors-empty/<location>`, `errors-mixed/<location>`, 21 cases per
definition. Failures are collected into one `AggregateError`.

### 7.5 `defineFormat` (`define-format.ts`)

```ts
export function defineFormat<TBody>(spec: FormatSpec<TBody>): ErrorFormat<TBody>;
export function defineFormat<TSchema extends StandardJsonSchema>(
  spec: StandardFormatSpec<TSchema>,
): ErrorFormat<InferStandardOutput<TSchema>>;
```

`FormatSpec` is `ErrorFormat` with `renderErrors` (defaults to `render`) and `errorsSchema`
(defaults to `schema`) optional. `StandardFormatSpec` takes a Standard JSON Schema object;
`schema()` calls `spec.schema['~standard'].jsonSchema.output({ target: ctx.dialect })` and the body
type is the schema's output type. The Standard Schema interfaces are vendored in
`internal/standard-schema-types.ts`. @ref https://standardschema.dev/json-schema

### 7.6 Google API (`formats/google-api`, ADR 0014)

```ts
export interface GoogleApiOptions {
  readonly domain: string; // ErrorInfo.domain; required, AIP-193 requires ErrorInfo
  readonly rpcCodes?: Readonly<Record<string, GoogleRpcCode>> | undefined; // `status` per catalog code
  readonly helpLinkBaseUrl?: string | undefined; // base for the Help link; wins over docsBaseUrl
  readonly traceIdMetadataKey?: string | false | undefined; // default 'traceId'
  readonly includeRequestInfo?: boolean | undefined; // default true
}
```

`contentType = 'application/json'`. The body is the AIP-193 HTTP/1.1+JSON representation of
`google.rpc.Status`: `{ error: { code, message, status, details } }`, where `code` is the HTTP
status (not `google.rpc.Status.code`), `status` is the `google.rpc.Code` name, and `details` holds
the standard payloads of `error_details.proto` in proto3 JSON form: each carries its type URL as
`@type`, field names are lowerCamelCase, and fields at their default value (empty string, empty
list, empty map) are omitted. @ref https://google.aip.dev/193#http11json-representation @ref
https://github.com/googleapis/googleapis/blob/master/google/rpc/error_details.proto @ref
https://protobuf.dev/programming-guides/json/

`googleApi()` throws `TypeError` when `traceIdMetadataKey` does not match `METADATA_KEY_PATTERN`
(7.6.2), is `location` (written from `ctx.meta` for validation errors, 8.2), or is a `PROTO_KEYS`
entry.

#### 7.6.1 `status` (`rpc-code.ts`)

Resolution order per entry: `rpcCodes[code]`; else the catalog `code` itself when it names a
`google.rpc.Code` (`NOT_FOUND`, `ALREADY_EXISTS`); else the HTTP status through the table gax-nodejs
uses to turn an HTTP error into a status code: 400 `INVALID_ARGUMENT`, 401 `UNAUTHENTICATED`, 403
`PERMISSION_DENIED`, 404 `NOT_FOUND`, 409 `ABORTED`, 416 `OUT_OF_RANGE`, 429 `RESOURCE_EXHAUSTED`,
499 `CANCELLED`, 501 `UNIMPLEMENTED`, 503 `UNAVAILABLE`, 504 `DEADLINE_EXCEEDED`; any other 2xx
`OK`, any other 4xx `FAILED_PRECONDITION`, any other 5xx `INTERNAL`, everything else `UNKNOWN`. The
result depends only on the definition, so the schema pins `status` with `constant()`. The 503 rows
of the Postgres mapper therefore render `UNAVAILABLE`; a 409 entry through its `codes` renders
`ABORTED` (6.10). @ref https://github.com/googleapis/googleapis/blob/master/google/rpc/code.proto
@ref https://github.com/googleapis/gax-nodejs/blob/main/gax/src/status.ts

#### 7.6.2 `render` and `renderErrors` (`details.ts`)

`error` members in order: `code` (number), `message` (`detail`, else `title`), `status`, `details`.
Payloads in order, each type at most once as AIP-193 requires:

| Payload       | When                                              | Members                                                                                                                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ErrorInfo`   | always                                            | `reason` = catalog `code`; `domain` = the option; `metadata` = `ctx.meta` with every value a string (strings verbatim, bigint decimal, everything else JSON; `undefined`, functions, and symbols dropped) and every key outside `METADATA_KEY_PATTERN` dropped, plus `[traceIdMetadataKey]` when known, omitted when empty  |
| `BadRequest`  | `renderErrors` with at least one item             | `fieldViolations`, one per item: `field` = the path in proto JSON path syntax (`items[0].sku`; omitted for an empty or missing path), `description` = `detail`, `reason` = the item's `reason` upper-cased, else its own `code` as given; proto3 JSON omits an empty repeated field, so an empty list means no `BadRequest` |
| `RetryInfo`   | the error's `Retry-After` header is delay-seconds | `retryDelay` = `${seconds}s`; the HTTP-date form needs the current time and formats are pure, so it is not converted                                                                                                                                                                                                        |
| `RequestInfo` | `includeRequestInfo`                              | `requestId` = the error id (10.2 coherence)                                                                                                                                                                                                                                                                                 |
| `DebugInfo`   | `ctx.stack` defined                               | `stackEntries` = the stack split on newlines                                                                                                                                                                                                                                                                                |
| `Help`        | a documentation URL exists and is absolute        | one link `{ description: 'Documentation for ${code} errors', url }` with `url` = `error.type`, else `${helpLinkBaseUrl ?? ctx.docsBaseUrl}/${code}`; AIP-193 requires an absolute URL with a scheme, so a relative one yields no `Help`                                                                                     |

Validation `meta.location` (8.2) reaches `ErrorInfo.metadata.location`. `LocalizedMessage` is not
emitted (the handler `transform` is the localization point, 6.2); `QuotaFailure`,
`PreconditionFailure`, and `ResourceInfo` have no source in `BanError`.

`METADATA_KEY_PATTERN` (`details.ts`) is `/^[a-z][a-zA-Z0-9_-]{1,63}$/u`: `error_details.proto` says
`ErrorInfo.metadata` keys "must match a regular expression of `[a-z][a-zA-Z0-9-_]+`" and "must be
limited to 64 characters in length". `toMetadata` drops a key outside it (`order.id`, `UserId`)
rather than throwing, because a throw at render time would turn the error being rendered into a 500;
the key set comes from application code, so a dropped key shows up in the application's own tests.
`reason` is not validated against its grammar (`[A-Z][A-Z0-9_]+[A-Z0-9]`); every built-in code
conforms. @ref https://google.aip.dev/193#errorinfo @ref https://google.aip.dev/193#help

#### 7.6.3 `schema` (`schema.ts`)

Closed at every level: `error` requires `code`, `message`, `status`, `details`; `code` and `status`
are `constant()`; `details` is an array with `minItems: 1` whose `items` is an `anyOf` over the
payload schemas, each a closed object pinning `@type` with `constant()`, `ErrorInfo` also pinning
`reason` and `domain` and typing `metadata` as `additionalProperties: { type: 'string' }` with
`propertyNames: { pattern: METADATA_KEY_PATTERN }` in the 2020-12 dialect only (the OpenAPI 3.0
schema object has neither `propertyNames` nor `patternProperties`), `Help.links[].url` as
`format: uri`. `schema` leaves `BadRequest` out of the `anyOf`; `validationSchema` includes it;
`RequestInfo` appears only when `includeRequestInfo`. `contains` and `prefixItems` would state
"ErrorInfo first" but OpenAPI 3.0 has neither, so both dialects share the `items` form. @ref
https://spec.openapis.org/oas/v3.0.3#schema-object

### 7.7 Stripe (`formats/stripe`, ADR 0014)

```ts
export type StripeErrorType =
  | 'api_error'
  | 'card_error'
  | 'idempotency_error'
  | 'invalid_request_error';

export interface StripeOptions {
  readonly docUrlBaseUrl?: string | undefined; // base for doc_url; wins over docsBaseUrl
  readonly types?: Readonly<Record<string, StripeErrorType>> | undefined; // `type` per catalog code
  readonly requestLogUrl?:
    | ((error: BanError, ctx: RenderContext) => string | undefined)
    | undefined;
}
```

`contentType = 'application/json'`. Body
`{ error: { code, doc_url?, message, param?, request_log_url?, type } }`: the members of Stripe's
`api_errors` object that a general API can fill, in alphabetical order, which is the order Stripe
serializes (an unauthenticated request to `api.stripe.com` answers
`{"error":{"message":"...","type":"invalid_request_error"}}`). Members Stripe reserves for card
payments (`advice_code`, `charge`, `decline_code`, `network_advice_code`, `network_decline_code`,
`payment_intent`, `payment_method`, `payment_method_type`, `setup_intent`, `source`) are never
emitted. @ref https://docs.stripe.com/api/errors @ref
https://github.com/stripe/openapi/blob/master/openapi/spec3.json (`components.schemas.api_errors`)

#### 7.7.1 `render` and `renderErrors`

- `code`: the catalog `code` lower-cased (`NOT_FOUND` becomes `not_found`), Stripe's spelling; a
  lower snake code declared in the catalog is unchanged.
- `doc_url`: `error.type`, else `${docUrlBaseUrl ?? ctx.docsBaseUrl}/${code}` with the code as
  spelled in the catalog (the same URL every format derives, ADR 0010); omitted when neither exists.
- `message`: `detail`, else `title`. With a list: the first item's `detail`, else the error's
  `detail`, else `title`.
- `param`: lists only, the first item's path in Stripe's bracket notation (`items[0][sku]`, `page`),
  the `deepObject` form encoding of its requests; omitted for an empty or missing path. Stripe
  reports one problem per response, so the remaining items are dropped. @ref
  https://spec.openapis.org/oas/v3.0.3#style-values
- `request_log_url`: `requestLogUrl(error, ctx)` when the option is set and returns a string.
- `type`: `types[code]`, else by status the way Stripe's SDKs classify errors: 402 `card_error`, any
  other 4xx `invalid_request_error`, everything else `api_error`. @ref
  https://github.com/stripe/stripe-node/blob/master/src/Error.ts (`generateV1Error`)

Nothing else is rendered: the shape has no member for `meta`, the trace id, the stack, or the error
id, which travels only in the `X-Error-Id` header (and in `request_log_url` when the application
builds one from `error.id`).

#### 7.7.2 `schema`

Closed: `error` requires `code`, `message`, `type`; `code` (lower-cased) and `type` are
`constant()`; `doc_url` and `request_log_url` are `format: uri-reference`, the latter present only
when `requestLogUrl` is set; `param` appears only in `errorsSchema`.

## 8. Validation

### 8.1 Types (`validation/issue.ts`)

```ts
export type IssueLocation = 'body' | 'form' | 'query' | 'param' | 'header' | 'cookie';
export type HookTarget = 'json' | 'form' | 'query' | 'param' | 'header' | 'cookie';
export interface ValidationIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code?: string | undefined;
  readonly expected?: string | undefined;
  readonly received?: string | undefined;
}
```

### 8.2 `ban.validation(issues, { location, detail?, meta?, cause? })`

Builds the `validationKey` entry (default `VALIDATION_FAILED`, 422) with
`errors = itemsFromIssues(issues, location)` (4.1), `detail = options.detail ?? VALIDATION_DETAIL`,
`meta.location = location`, and `cause` when given (the caught validator or driver failure, for
`ErrorReport.error.cause`; never rendered). Formats read the location back with
`readLocation(ctx.meta)` for items that carry none. It is sugar over
`ban.error(validationKey, { errors })`: every factory accepts `errors`, and a list that did not come
from a validator (a batch of domain checks, a JSON:API document with several problems) is built
directly.

### 8.3 Pointers and names

`pointerFromPath` follows RFC 6901 (`~` to `~0` before `/` to `~1`; `''` for an empty path);
`nameFromPath` is the first segment as a string; `normalizeSegment` turns symbols into their
description (or `'symbol'`). @ref https://www.rfc-editor.org/rfc/rfc6901#section-3

### 8.4 Hooks (`validation/hook.ts`)

Every Hono validator calls its hook as `hook(result & { target }, c)` and continues when the hook
returns nothing. `createHook(ban, extract)` returns `(result) => void` that does nothing on
`success` and otherwise throws
`ban.validation(extract(result), { location: locationFromTarget(target) })` (`json` maps to `body`).
The result types are structural supersets of what the validators pass, so the hooks live in the core
without a Hono import; `packages/hono-ban/src/hooks.test-d.ts` proves assignability to
`@hono/zod-validator`, `@hono/zod-openapi` (`defaultHook`), `@hono/valibot-validator`, and
`@hono/standard-validator` hook types, and `validators.test.ts` there runs each middleware through
`onError`. The core's own tests feed the hooks validator results directly. @ref
https://github.com/honojs/middleware/blob/main/packages/zod-validator/src/index.ts @ref
https://github.com/honojs/middleware/blob/main/packages/zod-openapi/src/index.ts @ref
https://github.com/honojs/middleware/blob/main/packages/valibot-validator/src/index.ts @ref
https://github.com/honojs/middleware/blob/main/packages/standard-validator/src/index.ts

### 8.5 Zod (`@nizam-os/ban-core/zod`)

Reads `error.issues[]` with `path` (PropertyKey[]), `message`, `code`, and scalar `expected` and
`received` when present, so Zod 3.25+ and Zod 4 both work (`zod.test.ts` covers both). @ref
https://zod.dev/error-formatting

### 8.6 Valibot (`@nizam-os/ban-core/valibot`)

Reads `issues[]` with `type` (as `code`), `message`, `expected` (omitted when `null`), `received`,
and `path[].key` (non-scalar keys render as `?`). @ref https://valibot.dev/api/BaseIssue/

### 8.7 Standard Schema (`@nizam-os/ban-core/standard-schema`)

Reads `issues[]` with `message` and `path` (raw keys or `{ key }` segments). The spec defines no
code, expected, or received. @ref https://standardschema.dev

## 9. OpenAPI (`@nizam-os/ban-core/openapi`)

```ts
export interface OpenApiOptions {
  readonly dialect?: SchemaDialect | undefined;
  readonly description?: string | undefined; // errorResponse, validationResponse
  readonly objectRef?: ((key: string) => string) | undefined; // errorResponses
  readonly responseRef?: ((key: string) => string) | undefined; // errorResponses
}
export function errorSchema(ban, ref: string | number, options?): JsonSchema;
export function errorResponse(ban, ref, options?): ResponseObject;
export function errorResponses(
  ban,
  refs: ReadonlyArray<string | number>,
  options?, // without responseRef
): Record<string, ResponseObject>;
export function errorResponses(
  ban,
  refs: ReadonlyArray<string | number>,
  options, // responseRef may be given
): Record<string, ResponseObject | ReferenceObject>; // ReferenceObject = { $ref }
export function errorResponseObjects(
  ban,
  refs: ReadonlyArray<string | number>,
  options?,
): Record<string, ResponseObject>; // each entry's response alone, by catalog key
export function errorObjectSchemas(
  ban,
  refs: ReadonlyArray<string | number>,
  options?,
): Record<string, JsonSchema>; // format.objectSchema of each entry, by catalog key
export function validationSchema(ban, options?): JsonSchema; // format.errorsSchema for validationKey
export function validationResponse(ban, options?): ResponseObject;
```

- A number resolves to the primary entry for that status; a string to the catalog key; unknown refs
  and `CUSTOM` throw `RangeError`.
- `ResponseObject` is `{ description, content: { [format.contentType]: { schema } } }` with
  `description` defaulting to the definition's.
- `errorResponses` groups by status; entries sharing a status merge into `{ anyOf: [...] }` with
  each distinct description once, joined by `' or '` (entries may share one), after structurally
  identical schemas are collapsed (a format that emits one shape for every entry yields that schema
  once, not an `anyOf`). `anyOf` rather than `oneOf`: a body must satisfy at least one entry's
  schema, and `oneOf` would reject a body that matches several branches (ADR 0011). @ref
  https://json-schema.org/draft/2020-12/json-schema-core#section-10.2.1.2
- When the format defines `mixedSchema` (7.2.4), one body may combine any of the refs, and it is
  sent with `responseStatus` of its items. So each status's response is `mixedSchema` of the entries
  a body of that status may carry: the entries of that status; for 400 also every 4xx entry once the
  4xx entries span two statuses or more; for 500 every entry once the entries span two statuses or
  more and one of them is 5xx. A status may thus appear that no single entry has (`[403, 409]` gives
  400, 403, and 409). Each distinct description appears once, joined with `' or '`, in the order of
  the refs. @ref https://jsonapi.org/format/1.1/#errors-processing
- Those responses repeat the object of every entry they may carry, so the 400 and 500 responses of
  each operation repeat most of its codes' objects, and a document of many operations repeats each
  object many times. `objectRef` names where the document holds each entry's object instead:
  `errorResponses(ban, refs, { objectRef })` puts `{ $ref: objectRef(key) }` in place of each
  object, and `errorObjectSchemas(ban, refs, options?)` returns the objects by catalog key, to be
  placed where `objectRef` points, typically `components.schemas`. Replacing each reference by its
  object gives exactly the inline responses (`object-refs.test.ts`). An object depends only on its
  entry and the dialect, so a document places the objects of every operation's refs once. Component
  names must match `^[a-zA-Z0-9.\-_]+$` while a catalog key may be any string: `objectRef` and the
  placement map keys to names the same way. Both functions throw `TypeError` for a format without
  `mixedSchema` and `objectSchema`, the only formats whose objects each belong to one entry.
  `e2e/ban/openapi-object-refs.e2e.test.ts` registers the objects with
  `app.openAPIRegistry.registerComponent('schemas', name, schema)` and validates every combination
  of the codes over HTTP against the served document. @ref
  https://spec.openapis.org/oas/v3.1.2#components-object @ref
  https://github.com/asteasolutions/zod-to-openapi/blob/master/src/openapi-registry.ts
- A status that carries one entry has the same response in every operation that lists that entry, so
  a document of many operations repeats it too. `responseRef` names where the document holds each
  entry's response alone: `errorResponses(ban, refs, { responseRef })` puts
  `{ $ref: responseRef(key) }` in place of such a status's response (a Responses Object entry may be
  a Reference Object), and `errorResponseObjects(ban, refs, options?)` returns the lone response of
  each ref by catalog key, to be placed where `responseRef` points, typically
  `components.responses`. A status that carries several entries stays inline: with a format that
  combines entries, 400 once the client errors span two statuses and 500 once a server error joins
  them. Replacing each reference by its response gives exactly the inline responses, under a format
  that combines entries and under one that does not, with `objectRef` or without
  (`response-refs.test.ts`). A lone response depends only on its entry, the format, the dialect, and
  `objectRef`, so a document places those of every operation's refs once; it works with any format.
  `errorResponses` is typed `Record<string, ResponseObject>` unless `responseRef` may be given.
  `ResponseObject` and `MediaTypeObject` are object types, not interfaces, so they are assignable to
  a generator's own objects, whose index signature for `x-` extensions an interface lacks:
  `e2e/ban/openapi-response-refs.e2e.test.ts` registers the lone responses with
  `app.openAPIRegistry.registerComponent('responses', name, response)` and validates every
  combination of the codes over HTTP through the references in the served document. @ref
  https://spec.openapis.org/oas/v3.1.2#responses-object @ref
  https://spec.openapis.org/oas/v3.1.2#specification-extensions
- `@hono/zod-openapi` accepts raw schema objects in `content[*].schema`
  (`ZodMediaTypeObject.schema: ZodType | SchemaObject | ReferenceObject`), so the objects drop
  straight into `createRoute({ responses })`. `packages/hono-ban/src/openapi.test.ts` generates an
  OpenAPI 3.1 document and asserts the emitted schemas deep-equal `errorSchema()`. Pass
  `{ dialect: 'openapi-3.0' }` for 3.0 documents. @ref
  https://github.com/asteasolutions/zod-to-openapi/blob/master/src/openapi-registry.ts
- `OpenAPIHono.doc()` always generates a 3.0.x document (it uses `OpenApiGeneratorV3` whatever the
  `openapi` string says); `doc31()` generates 3.1. Pair `doc()` with `{ dialect: 'openapi-3.0' }`
  and `doc31()` with the default dialect. Verified in `e2e/ban/openapi-document.e2e.test.ts`. @ref
  https://github.com/honojs/middleware/blob/main/packages/zod-openapi/src/index.ts

## 10. Observability

### 10.1 `ErrorReport` (`handler/report.ts`)

```ts
export interface ErrorReport {
  readonly id: string;
  readonly status: ErrorStatusCode;
  readonly code: string;
  readonly error: BanError;
  readonly cause: unknown; // the thrown value, or error.cause when the BanError itself was thrown
  readonly handled: boolean;
  readonly handlerFailure: unknown; // set only on the fallback path
  readonly context: { requestId; traceId; spanId; method; path };
}
```

### 10.2 Coherence

The same `id` appears in the body, in the error id header, and in the report (`handler.test.ts`).
Stripe is the exception (7.7): its shape has no member for the id, which travels in the header and
the report only.

### 10.3 `@nizam-os/ban-core/otel`

`traceIdFromOtel(source)` accepts the `trace` API or the whole `@opentelemetry/api` namespace
(structurally: `getActiveSpan()` returning a span with `spanContext().traceId`) and returns a
zero-argument function that yields the active span's trace id when it is 32 lowercase hex characters
and not all zeros. Usage: `ban.handler({ traceId: traceIdFromOtel(trace) })` or, on Hono,
`ban.onError({ traceId: traceIdFromOtel(trace) })`. @ref
https://open-telemetry.github.io/opentelemetry-js/interfaces/_opentelemetry_api.SpanContext.html

## 11. Testing utilities (`@nizam-os/ban-core/testing`)

- `renderError(ban, error, options?)`: `ban.render`.
- `expectBanError(value, expected?)`: asserts `value is BanError`, comparing `status`, `code`,
  `detail` when given, with readable messages.
- `assertFormatConformance(format, catalog, { compile })`: section 7.4.

## 12. Packaging

Each package has its own `tsdown.config.ts`; entry keys become `exports` subpaths, and
`exports: { devExports: 'source' }` rewrites `package.json` with a `source` condition pointing at
`src/` next to the `default` condition pointing at `dist/` (`publishConfig.exports` strips the
`source` condition from what npm sees). CI diffs both `package.json` files after a build.

```
index, formats/problem-details, formats/json-api, formats/plain, formats/google-api, formats/stripe,
zod, valibot, standard-schema, openapi, otel, postgresql, testing
```

`@nizam-os/ban-core` has no `dependencies` and no `peerDependencies`. `@nizam-os/hono-ban` has
`dependencies: { "@nizam-os/ban-core": "workspace:^" }` (a caret range on the published version) and
`peerDependencies: { "hono": ">=4.13.7" }`, the upstream security floor (the first release no
published Hono advisory affects), which CI runs its tests on. Validators, `@hono/*` packages,
`@opentelemetry/api`, `postgres` (postgres.js, for one type-level test), Ajv, and `ajv-formats` are
devDependencies used only by tests; `@electric-sql/pglite`, `@electric-sql/pglite-socket`,
`drizzle-orm`, `pg`, and `postgres` are devDependencies of `e2e/ban/` only. Both packages set
`sideEffects: false`. publint and attw run as part of each build.

The family's packages are `packages/ban-core`, `packages/hono-ban`, and `e2e/ban/` (private,
`@nizam-os/ban-e2e`) in the kit repository's pnpm workspace. `e2e/ban/` depends on both published
packages through `workspace:*`, so its imports resolve through the `exports` map above into each
`dist/`, and its own `tsconfig.json` checks the emitted declarations. `pnpm test:e2e` builds first,
then type-checks and runs it. `e2e/ban/smoke/` holds the runtime smoke test and its Bun, Deno, and
workerd entry points (14.2); `pnpm test:runtimes` builds and runs the three. Section 14 lists the
suites. Changesets version the two packages independently; `updateInternalDependencies: patch` bumps
`@nizam-os/hono-ban` whenever `@nizam-os/ban-core` releases.

## 13. Constants (`internal/constants.ts`)

| Name                        | Value                                                           |
| --------------------------- | --------------------------------------------------------------- |
| `UNEXPECTED_DETAIL`         | `'An unexpected error occurred'`                                |
| `VALIDATION_DETAIL`         | `'Request validation failed'`                                   |
| `DEFAULT_REQUEST_ID_HEADER` | `'X-Request-Id'`                                                |
| `DEFAULT_ERROR_ID_HEADER`   | `'X-Error-Id'`                                                  |
| `DEFAULT_CACHE_CONTROL`     | `'no-store'`                                                    |
| `DEFAULT_MAX_BODY_BYTES`    | `65536`                                                         |
| `TRUNCATED_DETAIL_LENGTH`   | `1024`                                                          |
| `REQUEST_ID_PATTERN`        | `/^[A-Za-z0-9._-]{1,128}$/u`                                    |
| `TRACEPARENT_PATTERN`       | `/^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})/u` |
| `TRACEPARENT_LENGTH`        | `55`                                                            |
| `EXTENSION_NAME_PATTERN`    | `/^[A-Za-z][A-Za-z0-9_]{2,}$/u`                                 |
| `PROTO_KEYS`                | `Set { '__proto__', 'constructor', 'prototype' }`               |

`MALFORMED_JSON_MESSAGE` (`'Malformed JSON in request body'`) and `BODY_HEADERS` (`content-type`,
`content-length`, `content-encoding`, `content-location`, `content-range`, `transfer-encoding`)
belong to `@nizam-os/hono-ban` (`packages/hono-ban/src/http-exception.ts`, 6.11);
`MALFORMED_JSON_MESSAGE` is exported from the `@nizam-os/hono-ban` root.

## 14. Test plan

Coverage thresholds (90 percent) are enforced by Vitest across both packages. Rows name
`packages/ban-core/src` modules unless prefixed.

| Module                    | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/catalog`            | IANA completeness, title equality, alias targets, factory coverage, type mapping                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `core/status`             | class-based acceptance, other classes and non-integers rejected, `ErrorStatusCode` excludes 2xx and 3xx (types)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `core/definition`         | defaults, derived `type`, explicit values, unknown status title                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `core/ban-error`          | extends `Error` only, message fallback, id, headers/meta/cause/errors, `getResponse` both branches, `toInit` round trip, status union (types); an error of a second module instance recognized both ways and rendered and capped by the handler, the brand's version and placement, subclasses unaffected (`ban-error-copies`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `core/error-item`         | issue to item mapping with and without optional members                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `core/factories`          | call forms, detail precedence, `TypeError`, `type`/`instance`/`id` options, `code` and `title` rejected at the type level, aliases, purity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `core/assert`             | throws for `null`, `undefined`, `false`; passes `0`, `''`; producer laziness; narrowing types                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `core/from`               | passthrough, the `adopt` hook (recognized, declined, throwing), unknown values as the constant 500                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `core/create-ban`         | every built-in factory, custom factories, overriding a built-in, reserved keys (runtime and types), `validationKey`, format and id generator, `custom`, `fromStatus` (primary entry, custom entry, `CUSTOM`), `render`, typed `handler` context and `adopt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `core/render`             | meta sanitization, stack rules, explicit instance, `renderErrors` branch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `headers/*`               | `bearerChallenge` attribute order, empty-realm fallback, scope string and list, realm quoted-pairs, `TypeError` per grammar, round trip through `Headers` and a factory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `handler/*`               | request id validation, traceparent grammar, body cap (transform re-applied, stack dropped), `fakeRequest` dispatch and `fromRequest`, non-Error values, the context reaching every callback, constant 500, `adopt` before `map`, map precedence and failures, format failure fallback, header-merge failure (tier 3), header options rejected at construction, `onReport` failure, transform, header merge including `Set-Cookie`, `Cache-Control` default and overrides, error id header options, request id options, traceparent into body and report, trace override, Hono rethrowing non-Errors                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `formats/*`               | extension flattening and precedence, Problem Details members and toggles, `traceIdMember` rejected, error entries with and without a fallback location, plain shape, JSON:API objects and sources, per-item identity ignored by default, `mixedEntries` rendering and loosened schema, `document` members, `responseStatus`, `traceIdMetaKey` rejected, empty and mixed lists, closed schemas, OpenAPI 3.0 `enum`, titles documented as strings with the catalog's title as the example in both dialects and a body whose titles `transform` localized conforming in every format that writes one while `status` and `code` stay pinned, `defineFormat` both forms and types, Google API `status` resolution, metadata stringification and key filtering, `traceIdMetadataKey` rejected, empty issue list without `BadRequest`, `propertyNames` per dialect, field paths, `RetryInfo`, absolute-only `Help`, closed detail schemas, Stripe member order, `type` classification, first-issue `param`, Ajv conformance for all five formats                       |
| `validation/*`            | pointer escaping, symbols, target mapping, `ban.validation` with and without `cause`, the default `detail`, the `errors` items, Zod 4 and Zod 3 issues, Valibot issues, Standard Schema issues, every hook fed real validator results for each target and declining on success                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `openapi`                 | key and status resolution, descriptions, `RangeError`s, dialect, `anyOf` grouping and identical-schema collapse, content type, validation response from `errorsSchema`; for a format that mixes entries, every combination of every sub-catalog of six entries rendered as `responseStatus` sends it and held to exactly its status's schema and codes, foreign codes and identities refused, `mixedSchema` present only with `mixedEntries`; with `objectRef`, the inline responses of every sub-catalog recovered by replacing each reference by its object, every object referenced, every body validated with the references resolved, `TypeError` for a format without `objectSchema`; with `responseRef`, under a format that combines entries and under one that does not, the inline responses of every sub-catalog recovered by replacing each reference by its lone response, only a status carrying one entry referenced, with `objectRef` too; the result's type with and without `responseRef`; a description shared by several entries named once |
| `postgresql/*`            | recognition of the node-postgres, postgres.js (with and without field V), Bun (`errno`), and copied-field shapes; Node errno, Prisma, and connection-error shapes rejected; `cause`, `original`, `nativeError` traversal with the depth cap and cycles; field normalization in both spellings; every table row and exclusion; constraint, column, code, class, and table precedence member by member; issue mappings with the driver error as `cause`; own-property lookups for constraints and inherited `codes` entries ignored; `retryAfter` placement and the safe-integer bound; construction errors; unknown key as a handler failure; driver stack under `includeStack`; postgres.js error type and mapper assignability matrix                                                                                                                                                                                                                                                                                                                          |
| `observability/otel`      | fake and real trace APIs, invalid ids                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `testing`                 | `expectBanError` messages, `renderError`, `assertFormatConformance` on a broken format (21 cases per definition, 3 when only `schema` is broken)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `packages/hono-ban/src/*` | `onError` over a Hono app: `HTTPException` by status and message, bearer-auth, the built-in validator's JSON failure, body headers dropped and `Content-Range` kept on 416, a thrown 302 passed through, non-Error throws rethrown by Hono, the `Context` in every callback, request id and traceparent headers, reserved key `onError`, `from()` adopting `HTTPException` ahead of the user hook; `fromHttpException` and `passthroughResponse` directly; `zValidator`, `vValidator`, `sValidator`, and `OpenAPIHono` through `onError`; hook type assignability; the generated OpenAPI 3.1 document; typed `onError<E>`                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### 14.1 End-to-end suite (`e2e/ban/`)

The `e2e/ban/` workspace package (section 12) consumes both built packages and runs every file
against a real `@hono/node-server` HTTP server on an ephemeral port (`e2e/ban/support/server.ts`).
Files import `@nizam-os/hono-ban` unless they prove the core alone. Bodies are read with `fetch`
and, wherever the package publishes a schema, validated with Ajv (`e2e/ban/support/ajv.ts`).
`pnpm test:e2e` runs it; CI runs it on Node 22 and 24.

| File(s)                                                                                                                       | Proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package-surface`                                                                                                             | every subpath in section 1 resolves through `exports` and exports exactly the listed values for both packages; `@nizam-os/hono-ban` subpaths are the `@nizam-os/ban-core` module objects; first HTTP round trip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `node-types`                                                                                                                  | every subpath of both packages compiled by `tsc` as a Node consumer without the DOM library compiles it (`lib: ["es2023"]`, `types: ["node"]`, `skipLibCheck` off, `node-types/tsconfig.json`): no diagnostics in the packages' declarations or in those they import                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `core-handler`                                                                                                                | `@nizam-os/ban-core` alone: `ban.handler()` with a typed context and `fromRequest` behind a plain `fetch` function served by `@hono/node-server`; instance, trace id, request id from the context, error headers, `adopt`, and the constant 500                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `catalog-builtins`, `catalog-custom`                                                                                          | every `FACTORY_NAMES` entry over HTTP (status, title, code, `about:blank`, `X-Error-Id`), aliases, call forms, custom entries and overrides, `custom()`, `assert()` narrowing, reserved-key and `validationKey` constructor errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `handler-identity-ids`, `-reports`, `-correlation`                                                                            | id coherence across body, header, report; `errorIdHeader`; header merge matrix including `Set-Cookie` and the `Cache-Control` default and override; deterministic ids; 20 concurrent requests; `ErrorReport` shape and `handled`; `includeStack` rules; request id and traceparent tables; `traceId` override                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `handler-not-found`                                                                                                           | `app.notFound` throwing `ban.notFound()` reaches `onError` on both Hono dispatch paths (no handler matched; one middleware matched) with body, header, and report; matched routes untouched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `handler-resolution-from`, `-headers`, `-pipeline`, `-body`                                                                   | `onError` resolution (plain `Error`, `HTTPException`, bearer-auth, malformed JSON, unknown status); an adopted response losing `Content-Length` and `Content-Encoding` but keeping `Retry-After`, a 416 keeping `Content-Range`, and a `bearerChallenge` value arriving verbatim; instance and handler `map` precedence; tier-1 and tier-2 fallback with headers; `transform` before and after the cap; `maxBodyBytes`; `onReport` once and swallowed; non-Error throws                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `format-problem-details-members`, `-extensions`, `-schema`                                                                    | member order, `type` derivation for four instance shapes, toggles, ADR 0008 flattening and reserved names, proto keys, bigint, validation bodies for all locations, schema equality and Ajv conformance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `format-json-api`, `format-json-api-validation`                                                                               | exact media type, error object members, `links`, nested `meta`, `traceIdMetaKey`, per-issue `source` for every location, RFC 6901 pointers, Ajv conformance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `format-custom-oauth`                                                                                                         | the README's OAuth 2.0 token endpoint `defineFormat` example (RFC 6749 5.2): `error`, `error_description`, `error_uri` from `code`, `detail`, `type`; `invalid_client` with the app's challenge; `bearerChallenge` pairing; conformance in both dialects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `format-google-api`, `-validation`, `-options`                                                                                | AIP-193 member order, `status` derivation for built-in and custom codes, `ErrorInfo.metadata` strings and trace id, `RetryInfo` from `Retry-After`, `DebugInfo` under `includeStack`, absolute-only `Help`, `BadRequest` per location and item, `errorsSchema` versus `schema`, every option over HTTP, Ajv conformance, 3.0 `enum`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `format-validation-empty-issues`                                                                                              | `ban.validation([])` over HTTP for all five formats validates against `errorsSchema`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `format-stripe`                                                                                                               | exact serialized text in alphabetical order, `type` by status and per-code override, an unknown `Error` as `api_error` with the constant detail, first-issue `param` per location, `request_log_url`, closed schemas, Ajv conformance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `format-plain-custom-plain`, `-define`, `-testing`                                                                            | `plain()` body and schema, `defineFormat` hand-written and Standard JSON Schema (Zod 4) forms over HTTP, `renderError`, `expectBanError`, `assertFormatConformance` failures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `validation-zod`, `validation-zod-direct`, `validation-zod-openapi`                                                           | `zValidator` hook for every target, pointer escaping, typed passthrough, `validationKey`, `fromZodError`, `toIssues`, `OpenAPIHono` `defaultHook` parity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `validation-valibot-standard-valibot`, `-standard-schema`                                                                     | `vValidator` and `sValidator` hooks (Zod and Valibot schemas), `expected`/`received` mapping, direct converters, `ban.validation()`, JSON:API `source` for Valibot issues                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `openapi-document`, `openapi-responses`, `openapi-mixed`, `openapi-object-refs`, `openapi-response-refs`, `openapi-localized` | served 3.1 (`doc31`) and 3.0 (`doc`) documents, `const` versus `enum`, `anyOf` grouping, real error bodies validated against the served schemas, `RangeError`s, every combination of a JSON:API route's five codes thrown as `responseStatus` sends it and validated against the served schema of its status; with `objectRef`, each object served once in `components.schemas` and every combination on two routes validated with the references resolved in the served document; with `responseRef` too, each lone response served once in `components.responses`, registered with `registerComponent`, referenced by both routes for the statuses that carry one code, and every combination validated through the references; German titles written by `transform` validated against the served schemas of Problem Details and JSON:API routes, a 422 included, and a foreign `code` still refused |
| `postgresql-pglite`, `postgresql-pglite-options`                                                                              | PGlite (PostgreSQL 18) raising every table row it can and the fallthrough codes over HTTP, directly and through Drizzle (wrapper on the report, driver error on the error); `constraints`, `columns`, and `codes`; a domain CHECK's fields (`dataType`, no table or column); `includeStack` rendering the driver stack and not the ORM wrapper's; no server text in any body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `postgresql-node-postgres`, `postgresql-postgres-js`                                                                          | the real `pg` and `postgres` drivers connected over the wire protocol to the file's PGlite (`e2e/ban/support/pglite-socket.ts`): every built-in row and fallthrough again, the driver's own error class and field spelling (`constraint`/`table`/`column`/`dataType`; `severity_local`, `constraint_name`/`table_name`/`column_name`/`data type_name`) normalized by `readPostgresFields`, and issue mappings with the driver error as `report.error.cause`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `postgresql-options`                                                                                                          | hand-built errors in the node-postgres, Neon, postgres.js (with and without field V), Bun, and Sequelize shapes; Prisma and Node errno shapes left unhandled; `retryAfter` on 503 only; an issue mapping rendered by JSON:API with `source.pointer` and validated against `errorsSchema`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `otel-correlation`, `otel-sources`                                                                                            | real `NodeTracerProvider` spans: body and report trace id equal the exported span, option wins over `traceparent`, no span outside the middleware, `{ trace }` form, invalid span contexts ignored, JSON:API `meta.traceId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### 14.2 Runtime smoke test (`e2e/ban/smoke/`)

The README promises Bun, Deno, and Cloudflare Workers. `e2e/ban/smoke/app.ts` is one Hono app that
imports every published subpath and throws one error per feature family (catalog and custom entries
through an explicit `problemDetails()`, `ban.validation` through the Zod, Valibot, and Standard
Schema hooks, `HTTPException` from `hono/bearer-auth`, an unknown `Error`, JSON:API, plain, Google
API, and Stripe sub-apps, the OpenAPI helpers, `renderError` from `@nizam-os/hono-ban/testing`, a
`bearerChallenge` header, the OpenTelemetry adapter, a unique violation through `postgresMapper` in
the node-postgres and Bun shapes, and a route answered by a `@nizam-os/ban-core` instance's own
`handler` with `fromRequest`, so the core package is loaded by every runtime too). `app.ts` imports
no database driver: the workerd bundle inlines every import of it, so the Postgres routes throw
driver-shaped fixtures. `checks.ts` asserts the responses through a runtime-neutral `dispatch`
function, checks `Cache-Control: no-store` and a matching `X-Error-Id` on every Problem Details
response, and `report()` throws on any failure, so the process exits non-zero. A new subpath is not
covered until `app.ts` imports it and `checks.ts` exercises it. Entry points:

| Script                  | Runtime                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke:bun` (`run.ts`)  | Bun runs `run.ts`, which drives `app.request()` in-process; both packages resolve through `node_modules` like on Node                        |
| `smoke:deno` (`run.ts`) | Deno 2 runs the same file with `--allow-read --allow-env`; a `package.json` puts it in manual `node_modules` mode, so pnpm's install is used |
| `smoke:workerd`         | Node bundles `worker.ts` with tsdown (`platform: 'neutral'`) and runs the checks against Miniflare's workerd through `dispatchFetch`         |

CI runs the three in one job after `pnpm build`; `pnpm test:runtimes` does the same locally.
