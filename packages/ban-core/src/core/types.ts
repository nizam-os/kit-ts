/**
 * Public contract types (SPEC 2, 6, 10). Nothing here has runtime code.
 * @packageDocumentation
 */
import type { RenderOptions } from '../formats/context';
import type { ErrorFormat } from '../formats/types';
import type { HeadersInit } from '../internal/headers-init';
import type { IssueLocation, ValidationIssue } from '../validation/issue';
import type { BanError, BanErrorOptions, RenderedError } from './ban-error';
import type { BuiltinCatalog, FactoryName } from './catalog';
import type { ErrorDefinition, ResolvedDefinition } from './definition';
import type { ErrorStatusCode } from './status';

export interface Factory {
  (detail?: string, options?: BanErrorOptions): BanError;
  (options: BanErrorOptions): BanError;
}

export type Catalog = Readonly<Record<string, ErrorDefinition>>;
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- reason: the default catalog must have no keys at all, so `ErrorKey` adds nothing to the built-ins; a `Record<string, never>` would admit every string
export type EmptyCatalog = Record<never, never>;

/** Every key a `Ban` instance knows: built-ins plus the custom catalog. */
export type ErrorKey<TErrors extends Catalog> =
  | keyof BuiltinCatalog
  | (keyof TErrors & string);

export type BuiltinFactories = { readonly [K in FactoryName]: Factory };
export type CustomFactories<TErrors extends Catalog> = {
  readonly [K in keyof TErrors]: Factory;
};

export type ErrorMapper<TErrors extends Catalog> = (
  error: unknown,
  ban: Ban<TErrors>,
) => BanError | undefined;

/**
 * Adapter hook (SPEC 5.6): recognizes a framework's own exception and
 * returns the `BanError` standing for it, `undefined` for anything else.
 * Runs before `map`, in `from()` and in the handler, and what it returns
 * counts as handled. `@nizam-os/hono-ban` installs one for Hono's `HTTPException`.
 */
export type ErrorAdopter<TErrors extends Catalog> = (
  value: unknown,
  ban: Ban<TErrors>,
) => BanError | undefined;

export interface BanOptions<TErrors extends Catalog> {
  /** Wire format. Default: `problemDetails()`. */
  readonly format?: ErrorFormat | undefined;
  readonly errors?: TErrors | undefined;
  /** Base for derived `type` URIs, joined as `${docsBaseUrl}/${code}`; no trailing slash. */
  readonly docsBaseUrl?: string | undefined;
  /**
   * Catalog key used by `ban.validation()`. Default `'VALIDATION_FAILED'`.
   * `NoInfer` keeps a typo here from widening `TErrors` to its constraint.
   */
  readonly validationKey?: NoInfer<ErrorKey<TErrors>> | undefined;
  /** Turns domain errors into `BanError`s inside the handler. */
  readonly map?: NoInfer<ErrorMapper<TErrors>> | undefined;
  /** Adopts a framework's own exceptions; set by adapters, before `map`. */
  readonly adopt?: NoInfer<ErrorAdopter<TErrors>> | undefined;
  /** Error id generator. Default: `crypto.randomUUID()`. */
  readonly id?: (() => string) | undefined;
}

/** `ban.custom()` input. No catalog entry, so `code` and `title` are free. */
export interface CustomErrorInit extends BanErrorOptions {
  readonly status: ErrorStatusCode;
  /** Default `'CUSTOM'`. */
  readonly code?: string | undefined;
  /** Default: the IANA reason phrase for `status`, else `'Error'`. */
  readonly title?: string | undefined;
}

export interface ValidationOptions {
  readonly location: IssueLocation;
  /** Default `'Request validation failed'` (SPEC 13). */
  readonly detail?: string | undefined;
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
  /** The underlying failure, for `ErrorReport.error.cause`; never rendered (ADR 0007). */
  readonly cause?: unknown;
}

export interface ErrorReport {
  readonly id: string;
  readonly status: ErrorStatusCode;
  readonly code: string;
  readonly error: BanError;
  /** The thrown value when it is not `error` itself, else `error.cause`. */
  readonly cause: unknown;
  /** False when the thrown value was neither a `BanError`, adopted, nor mapped. */
  readonly handled: boolean;
  /** Set when the handler itself failed and the fallback response was sent. */
  readonly handlerFailure: unknown;
  readonly context: {
    readonly requestId: string | undefined;
    readonly traceId: string | undefined;
    readonly spanId: string | undefined;
    readonly method: string;
    readonly path: string;
  };
}

/**
 * The request facts the handler reads (SPEC 6.1). An adapter builds one
 * from its framework's request object; `fromRequest()` builds one from a
 * Fetch `Request`.
 */
export interface ErrorRequest {
  readonly method: string;
  /** The path component without the query; rendered as `instance` and reported. */
  readonly path: string;
  /** Case-insensitive header lookup; `undefined` when the header is absent. */
  header(name: string): string | undefined;
}

/**
 * `ban.handler()` options (SPEC 6.2). `TContext` is whatever the caller
 * passes as the handler's third argument (@nizam-os/hono-ban passes the Hono
 * `Context`); the callbacks receive it unchanged. It defaults to `void`, so
 * a handler called straight from `fetch` takes two arguments.
 */
export interface HandlerOptions<
  TContext = void,
  TErrors extends Catalog = Catalog,
> {
  /** Add the stack to 5xx bodies. Default false. */
  readonly includeStack?: boolean | undefined;
  /** Header echoed as the request id after validation. Default `X-Request-Id`; `false` disables. */
  readonly requestIdHeader?: string | false | undefined;
  /** Replaces the header lookup. */
  readonly requestId?: ((ctx: TContext) => string | undefined) | undefined;
  /** Replaces W3C `traceparent` parsing. */
  readonly traceId?: ((ctx: TContext) => string | undefined) | undefined;
  /** Called exactly once per handled error, after rendering. */
  readonly onReport?:
    | ((report: ErrorReport, ctx: TContext) => void | Promise<void>)
    | undefined;
  /** Added to every error response; error headers and `Content-Type` win. */
  readonly headers?: HeadersInit | undefined;
  /** Header carrying the error id. Default `X-Error-Id`; `false` disables. */
  readonly errorIdHeader?: string | false | undefined;
  /** Rendered bodies above this are re-rendered minimal. Default 65536. */
  readonly maxBodyBytes?: number | undefined;
  /** Post-process the rendered body (localization, redaction). */
  readonly transform?:
    | ((body: unknown, error: BanError, ctx: TContext) => unknown)
    | undefined;
  /** Overrides the instance-level `map`. */
  readonly map?: ErrorMapper<TErrors> | undefined;
}

/**
 * What `ban.handler()` returns (SPEC 6): resolves to a `Response` for every
 * input and never rejects (ADR 0002).
 */
export type BanHandler<TContext = void> = (
  thrown: unknown,
  request: ErrorRequest,
  ctx: TContext,
) => Promise<Response>;

export interface BanInstance<TErrors extends Catalog> {
  readonly format: ErrorFormat;
  readonly catalog: Readonly<Record<ErrorKey<TErrors>, ResolvedDefinition>>;
  readonly docsBaseUrl: string | undefined;
  /** The catalog key `validation()` uses. */
  readonly validationKey: ErrorKey<TErrors>;
  /** Generic factory: `ban.error('NOT_FOUND', { detail })`. */
  readonly error: (
    key: ErrorKey<TErrors>,
    options?: BanErrorOptions,
  ) => BanError;
  /** One-off error with no catalog entry. Cannot be documented by the OpenAPI helpers. */
  readonly custom: (init: CustomErrorInit) => BanError;
  /** The primary entry for a status (SPEC 3), else a `custom()` error with that status. */
  readonly fromStatus: (
    status: ErrorStatusCode,
    options?: BanErrorOptions,
  ) => BanError;
  readonly validation: (
    issues: ReadonlyArray<ValidationIssue>,
    options: ValidationOptions,
  ) => BanError;
  /** Converts any thrown value; never throws. Safe to pass around unbound. */
  readonly from: (value: unknown) => BanError;
  /** Builds the framework-free error handler (SPEC 6). */
  readonly handler: <TContext = void>(
    options?: HandlerOptions<TContext, TErrors>,
  ) => BanHandler<TContext>;
  readonly render: (error: BanError, options?: RenderOptions) => RenderedError;
}

export type Ban<TErrors extends Catalog> = BuiltinFactories &
  CustomFactories<TErrors> &
  BanInstance<TErrors>;

export type ReservedKey = keyof BanInstance<Catalog> | FactoryName;

/**
 * Rejects custom catalog keys that would shadow an instance member. An
 * adapter that adds members widens `TReserved` with their names.
 */
export type NoReserved<
  T extends Catalog,
  TReserved extends string = ReservedKey,
> = {
  readonly [K in keyof T]: K extends TReserved ? never : T[K];
};
