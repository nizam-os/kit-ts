import type { RenderOptions } from '../formats/context';
import type { HeadersInit } from '../internal/headers-init';
import type { ResolvedDefinition } from './definition';
import type { ErrorItem } from './error-item';
import type { ErrorStatusCode } from './status';

import { generateErrorId } from '../internal/id';
import { safeStringify } from '../internal/json';

/**
 * The brand every `BanError` carries on its prototype (ADR 0019): a key
 * from the global symbol registry, the same in every copy of the package,
 * whose value is the version of the shape SPEC 4 lists. It changes when a
 * member listed there changes its name, type, or meaning.
 * @ref https://tc39.es/ecma262/#sec-symbol.for
 */
const BRAND: unique symbol = Symbol.for('@nizam-os/ban-core/BanError');
const BRAND_VERSION = 1;

/** Whether `value` carries the brand at the version this copy reads. */
function carriesBrand(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, BRAND) === BRAND_VERSION
  );
}

/**
 * Per-error options accepted by every factory (SPEC 2). `status`, `code`, and
 * `title` are absent on purpose: the catalog fixes them and the generated
 * schemas pin them with `const`, so a per-call value would make the response
 * contradict its own schema (ADR 0011). `ban.custom()` takes them through
 * `CustomErrorInit` because it has no schema.
 */
export interface BanErrorOptions {
  readonly detail?: string | undefined;
  /** RFC 9457 `type`: a URI reference (section 3.1.1). Not validated. */
  readonly type?: string | undefined;
  /**
   * RFC 9457 `instance`: a URI reference (section 3.1.5). Defaults to the
   * request path at render time.
   */
  readonly instance?: string | undefined;
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
  readonly headers?: HeadersInit | undefined;
  /**
   * The error's list (SPEC 4.2). `ban.validation()` fills it with one item
   * per issue; any factory accepts one. A format renders an error that has
   * a list, even an empty one, through `renderErrors` (SPEC 7).
   */
  readonly errors?: ReadonlyArray<ErrorItem> | undefined;
  readonly cause?: unknown;
  readonly id?: string | undefined;
}

export interface RenderedError {
  readonly status: ErrorStatusCode;
  /** Includes `Content-Type` for the format that rendered `body`. */
  readonly headers: Headers;
  readonly body: unknown;
}

export type Renderer = (
  error: BanError,
  options?: RenderOptions,
) => RenderedError;

export interface BanErrorInit extends BanErrorOptions {
  readonly status: ErrorStatusCode;
  readonly code: string;
  readonly title: string;
  readonly definition?: ResolvedDefinition | undefined;
  /** Injected by factories so `getResponse()` renders in the instance's format. */
  readonly render?: Renderer | undefined;
}

/**
 * The single error class (SPEC 4): a plain `Error` carrying the fields the
 * formats render. It depends on no framework, so the same errors are thrown
 * by domain code, built by libraries, adopted by adapters, and rendered by
 * any handler from `ban.handler()`. `message` is `detail`, else `title`.
 * @ref https://tc39.es/ecma262/#sec-error-objects
 */
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
  readonly #render: Renderer | undefined;

  constructor(init: BanErrorInit) {
    super(init.detail ?? init.title, { cause: init.cause });
    this.status = init.status;
    this.id = init.id ?? generateErrorId();
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.type = init.type;
    this.instance = init.instance;
    this.meta = init.meta ?? {};
    this.headers = new Headers(init.headers);
    this.definition = init.definition;
    this.errors = init.errors;
    this.#render = init.render;
  }

  /**
   * `instanceof BanError` holds for this copy's errors and for those
   * another copy of the package built, recognized by the brand at this
   * copy's version (ADR 0019); a subclass keeps the ordinary prototype
   * check. It returns `boolean`, not a type predicate, so TypeScript
   * narrows to the class `instanceof` names.
   * @ref https://tc39.es/ecma262/#sec-instanceofoperator
   */
  static override [Symbol.hasInstance](value: unknown): boolean {
    return (
      Function.prototype[Symbol.hasInstance].call(this, value) ||
      (this === BanError && carriesBrand(value))
    );
  }

  /** The fields needed to rebuild an equivalent error (used by the body cap). */
  toInit(): BanErrorInit {
    return {
      status: this.status,
      code: this.code,
      title: this.title,
      detail: this.detail,
      type: this.type,
      instance: this.instance,
      meta: this.meta,
      headers: this.headers,
      errors: this.errors,
      cause: this.cause,
      id: this.id,
      definition: this.definition,
      render: this.#render,
    };
  }

  /**
   * The error as a `Response` outside a handler: no request facts, no id
   * header, no report. Rendered in the format of the instance that built
   * the error; a `BanError` constructed directly renders a minimal JSON
   * body.
   */
  getResponse(): Response {
    if (this.#render === undefined) {
      const headers = new Headers(this.headers);
      headers.set('Content-Type', 'application/json');
      return new Response(
        safeStringify({
          status: this.status,
          code: this.code,
          title: this.title,
          detail: this.detail,
          id: this.id,
        }),
        { status: this.status, headers },
      );
    }
    const rendered = this.#render(this);
    return new Response(safeStringify(rendered.body), {
      status: rendered.status,
      headers: rendered.headers,
    });
  }
}

Object.defineProperty(BanError.prototype, BRAND, { value: BRAND_VERSION });

/**
 * Whether `value` is a `BanError`, built by this copy of the package or by
 * another whose brand version it reads (ADR 0019).
 */
export function isBanError(value: unknown): value is BanError {
  return value instanceof BanError;
}
