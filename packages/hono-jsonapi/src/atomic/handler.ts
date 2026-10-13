/**
 * `atomicOperations()` (SPEC 11.1): a Hono handler for an operations
 * endpoint. It accepts `POST` with the extension declared, reads the
 * document, runs it through `operationsProcessor` from `@nizam-os/jsonapi-core`, and
 * answers with `atomic:results` or, when no operation produced data,
 * `204 No Content`.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 * @packageDocumentation
 */
import type { Context, Env, Handler } from 'hono';

import type { AtomicOptions } from '@nizam-os/jsonapi-core/atomic';

import { jsonApiError } from '@nizam-os/jsonapi-core';
import {
  assertOperationsContentType,
  operationsProcessor,
} from '@nizam-os/jsonapi-core/atomic';

import { readDocument } from '../body';
import { respond } from '../respond';

const HTTP_NO_CONTENT = 204;

/**
 * A handler for the operations endpoint, for `app.post('/operations', ...)`.
 * Handlers receive the Hono `Context` as `ctx`, and `transaction` as its
 * first argument. Every failure is thrown (the extension's 405 with `Allow`,
 * the 415, the document's 400s, a handler's error after the transaction has
 * rolled back) for `app.onError` to render.
 */
export function atomicOperations<TTransaction, E extends Env = Env>(
  options: AtomicOptions<TTransaction, Context<E>>,
): Handler<E> {
  const process = operationsProcessor(options);
  return async (c) => {
    // The extension: operations requests "MUST be sent via POST".
    if (c.req.method !== 'POST') {
      throw jsonApiError('METHOD_NOT_ALLOWED', {
        detail: 'Operations requests must use POST',
        headers: { Allow: 'POST' },
      });
    }
    assertOperationsContentType(c.req.header('content-type'));
    const { document } = await process(await readDocument(c), c);
    return document === undefined
      ? c.body(null, HTTP_NO_CONTENT)
      : respond(c, document);
  };
}
