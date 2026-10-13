/**
 * `app.onError` and `app.notFound` handlers (SPEC 10.5). `errorHandler` is a
 * `@nizam-os/hono-ban` handler over an instance that carries this package's catalog and
 * renders in @nizam-os/ban-core's JSON:API format with `mixedEntries` on, so every
 * failure reaching `app.onError` becomes an error document: a `BanError`
 * from `@nizam-os/jsonapi-core`, from the application's own @nizam-os/ban-core instance, or from
 * any other library on @nizam-os/ban-core, as it is; Hono's `HTTPException` adopted by
 * status; anything else as a constant 500 that reveals nothing.
 * @ref https://jsonapi.org/format/1.1/#errors
 * @ref https://hono.dev/docs/api/hono#error-handling
 * @ref https://github.com/nizam-os/kit/blob/main/docs/jsonapi/SPEC.md (section 6: the handler; section 7.2: the JSON:API format)
 * @packageDocumentation
 */
import type { Env, ErrorHandler, NotFoundHandler } from 'hono';

import type { HandlerOptions } from '@nizam-os/hono-ban';
import type {
  JsonApiDocumentMembers,
  JsonApiOptions,
} from '@nizam-os/hono-ban/formats/json-api';
import type { DocumentBase, JsonApiCatalog } from '@nizam-os/jsonapi-core';

import type { ResponseHeaders } from './respond';

import { createBan } from '@nizam-os/hono-ban';
import { jsonApi } from '@nizam-os/hono-ban/formats/json-api';
import { ERROR_CATALOG, jsonApiError } from '@nizam-os/jsonapi-core';

import { respondError } from './respond';

/**
 * `@nizam-os/hono-ban`'s handler options (`onReport`, `headers`, `map`, `includeStack`,
 * the id headers, ...) plus the JSON:API document's own. `map` receives the
 * handler's instance, whose catalog is `ERROR_CATALOG` over the built-ins.
 */
export interface ErrorHandlerOptions<
  E extends Env = Env,
> extends HandlerOptions<E, JsonApiCatalog> {
  /** Top-level members (`jsonapi`, `links`, `meta`) for every error document. */
  readonly document?: DocumentBase | undefined;
  /**
   * The JSON:API format's options: `typeLinkBaseUrl` for `links.type`,
   * `aboutLink`, `includeId`, `traceIdMetaKey`. `mixedEntries` is always on,
   * since the errors of this package combine catalog entries.
   */
  readonly format?:
    | Omit<JsonApiOptions, 'mixedEntries' | 'document'>
    | undefined;
}

export interface NotFoundHandlerOptions {
  /** Top-level members (`jsonapi`, `links`, `meta`) for the error document. */
  readonly document?: DocumentBase | undefined;
  /** Headers added to the response, such as `Cache-Control`. */
  readonly headers?: ResponseHeaders | undefined;
}

/** `DocumentBase` in the format's shape; a `JsonApiObject` is spread into a plain record. */
function documentMembers(base: DocumentBase): JsonApiDocumentMembers {
  return {
    ...(base.jsonapi === undefined ? {} : { jsonapi: { ...base.jsonapi } }),
    ...(base.links === undefined ? {} : { links: base.links }),
    ...(base.meta === undefined ? {} : { meta: base.meta }),
  };
}

/**
 * For `app.onError`: renders anything thrown as a JSON:API error document.
 * Equivalent to `createBan({ errors: ERROR_CATALOG, format: jsonApi({
 * mixedEntries: true }) }).onError(options)` from `@nizam-os/hono-ban`; an application
 * with entries of its own builds that instance itself and installs its
 * `onError`, which renders this package's errors the same way.
 */
export function errorHandler<E extends Env = Env>(
  options: ErrorHandlerOptions<E> = {},
): ErrorHandler<E> {
  const { document, format, ...handlerOptions } = options;
  const ban = createBan({
    errors: ERROR_CATALOG,
    format: jsonApi({
      ...format,
      mixedEntries: true,
      ...(document === undefined
        ? {}
        : { document: documentMembers(document) }),
    }),
  });
  return ban.onError<E>(handlerOptions);
}

/** For `app.notFound`: a 404 error document instead of Hono's plain text. */
export function notFoundHandler<E extends Env = Env>(
  options: NotFoundHandlerOptions = {},
): NotFoundHandler<E> {
  return (c) =>
    respondError(
      c,
      jsonApiError('NOT_FOUND', {
        detail: 'No resource exists at the requested URL',
      }),
      options.document,
      options.headers,
    );
}
