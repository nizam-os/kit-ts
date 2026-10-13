/**
 * Hono's `HTTPException` as a `BanError` (SPEC 6.11). The core's `adopt`
 * hook for Hono: middleware such as `hono/bearer-auth` and the built-in
 * validator throw `HTTPException`, and every error the handler renders is a
 * `BanError`.
 * @ref https://hono.dev/docs/api/exception
 * @packageDocumentation
 */
import type { Ban, BanError, Catalog } from '@nizam-os/ban-core';

import { HTTPException } from 'hono/http-exception';

import { isErrorStatus } from '@nizam-os/ban-core';

const BAD_REQUEST = 400;
const RANGE_NOT_SATISFIABLE = 416;
const CONTENT_RANGE = 'content-range';

/**
 * The exact message Hono's built-in validator uses when JSON parsing fails.
 * @ref https://github.com/honojs/hono/blob/main/src/validator/validator.ts
 */
export const MALFORMED_JSON_MESSAGE = 'Malformed JSON in request body';

/**
 * Headers that describe a response body. Dropped when the headers of an
 * `HTTPException` response are adopted and its body discarded: a stale
 * `Content-Length` truncates the rendered JSON on the wire and a stale
 * `Content-Encoding` makes clients decompress plain text.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-8.3 (Content-Type, then 8.4, 8.6, 8.7)
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-14.4 (Content-Range)
 * @ref https://www.rfc-editor.org/rfc/rfc9112#section-6.1 (Transfer-Encoding)
 */
const BODY_HEADERS: ReadonlyArray<string> = [
  'content-type',
  'content-length',
  'content-encoding',
  'content-location',
  CONTENT_RANGE,
  'transfer-encoding',
];

/**
 * The exception's body is discarded, so the headers describing it go with it
 * (SPEC 6.11): kept, a `Content-Length` sized for the old body truncates the
 * rendered JSON and a `Content-Encoding` makes clients decompress plain text.
 * `Content-Range` is the one that changes meaning with the status: on a 416
 * it carries the selected representation's complete length (an asterisk, a
 * slash, and the length), not a description of the body, so it stays.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-14.4
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15.5.17
 */
function withoutBodyHeaders(
  source: Headers | undefined,
  status: number,
): Headers | undefined {
  if (source === undefined) {
    return undefined;
  }
  const headers = new Headers(source);
  const keepContentRange = status === RANGE_NOT_SATISFIABLE;
  for (const name of BODY_HEADERS) {
    if (!(keepContentRange && name === CONTENT_RANGE)) {
      headers.delete(name);
    }
  }
  return headers;
}

/**
 * `createBan({ adopt })` for Hono, installed by this package's `createBan`.
 * An `HTTPException` with an error status becomes the primary entry for
 * that status (`MALFORMED_JSON` for the built-in validator's JSON failure),
 * keeping its message as `detail` and the headers of its `res`, except
 * those describing the discarded body. Anything else, including an
 * `HTTPException` outside the error classes, is declined.
 * @ref https://hono.dev/docs/api/exception
 */
export function fromHttpException<TErrors extends Catalog>(
  value: unknown,
  ban: Ban<TErrors>,
): BanError | undefined {
  if (!(value instanceof HTTPException)) {
    return undefined;
  }
  const status: number = value.status;
  if (!isErrorStatus(status)) {
    return undefined;
  }
  const options = {
    detail: value.message === '' ? undefined : value.message,
    headers: withoutBodyHeaders(value.res?.headers, status),
    cause: value,
  };
  return status === BAD_REQUEST && value.message === MALFORMED_JSON_MESSAGE
    ? ban.malformedJson(options)
    : ban.fromStatus(status, options);
}

/**
 * An `HTTPException` outside the 4xx and 5xx classes is not an error but a
 * short-circuit (a redirect thrown from middleware, for instance). Hono's
 * default handler answers it with `getResponse()`, and so does `onError`.
 * `undefined` for everything else, and for a response that cannot be built.
 * @ref https://github.com/honojs/hono/blob/main/src/hono-base.ts (errorHandler)
 */
export function passthroughResponse(thrown: unknown): Response | undefined {
  if (!(thrown instanceof HTTPException) || isErrorStatus(thrown.status)) {
    return undefined;
  }
  try {
    return thrown.getResponse();
  } catch {
    return undefined;
  }
}
