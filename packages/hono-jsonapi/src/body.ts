/**
 * Request body reading (SPEC 10.3): the JSON of a request document, or a
 * 415 when the body is not declared as JSON:API, or a 400 when it is not
 * JSON. The media type parameters were already checked by `jsonApi()`.
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-all
 * @packageDocumentation
 */
import type { Context, Env } from 'hono';

import {
  isJsonApiMediaType,
  jsonApiError,
  parseMediaType,
} from '@nizam-os/jsonapi-core';

/** The parsed JSON body of a request declared as `application/vnd.api+json`. */
export async function readDocument<E extends Env>(
  c: Context<E>,
): Promise<unknown> {
  const contentType = c.req.header('content-type');
  const mediaType =
    contentType === undefined ? undefined : parseMediaType(contentType);
  if (mediaType === undefined || !isJsonApiMediaType(mediaType)) {
    throw jsonApiError('UNSUPPORTED_MEDIA_TYPE', {
      detail:
        'Request documents must be sent with Content-Type application/vnd.api+json',
      source: { header: 'Content-Type' },
    });
  }
  const text = await c.req.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw jsonApiError('MALFORMED_JSON', {
      detail: 'The request body is not valid JSON',
    });
  }
}
