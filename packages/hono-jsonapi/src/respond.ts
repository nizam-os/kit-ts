/**
 * Response helpers (SPEC 10.2). `respond` sends a document with the
 * `Content-Type` the specification requires, deriving `ext` and `profile`
 * from the document's own `jsonapi` object so the header and the body
 * cannot disagree. `respondError` does the same for a `BanError`.
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-all
 * @packageDocumentation
 */
import type { Context, Env, TypedResponse } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { JSONParsed } from 'hono/utils/types';

import type { BanError, Document, DocumentBase } from '@nizam-os/jsonapi-core';

import {
  JSON_API_MEDIA_TYPE,
  errorDocument,
  formatJsonApiMediaType,
  isJsonApiMediaType,
  parseMediaType,
} from '@nizam-os/jsonapi-core';

import { isRecord, ownMember } from './internal/object';

const HTTP_OK = 200;
const HTTP_CREATED = 201;

/** Response headers by name; names are case-insensitive. */
export type ResponseHeaders = Readonly<Record<string, string>>;

/** The response type `c.json()` produces, for Hono's RPC client inference. */
export type JsonApiResponse<
  TDocument,
  TStatus extends ContentfulStatusCode,
> = Response & TypedResponse<JSONParsed<TDocument>, TStatus, 'json'>;

/** The URI of a link: the string itself, or a link object's `href`. */
function linkHref(link: unknown): string | undefined {
  if (typeof link === 'string') {
    return link;
  }
  if (!isRecord(link)) {
    return undefined;
  }
  const href = ownMember(link, 'href');
  return typeof href === 'string' ? href : undefined;
}

/**
 * The created resource's `links.self`, which a `201` response's `Location`
 * header MUST match when both are present. Only a single resource object
 * qualifies.
 * @ref https://jsonapi.org/format/1.1/#crud-creating-responses-201
 */
function createdLocation(document: Document): string | undefined {
  if (!('data' in document) || !isRecord(document.data)) {
    return undefined;
  }
  const links = ownMember(document.data, 'links');
  return isRecord(links) ? linkHref(ownMember(links, 'self')) : undefined;
}

function hasHeader(headers: ResponseHeaders, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name);
}

/**
 * `headers` plus `fixed`, with the fixed names winning whatever their case
 * in `headers`: Hono applies header records in key order, so a lowercase
 * `content-type` from the caller would otherwise override ours.
 */
function withFixedHeaders(
  headers: ResponseHeaders,
  fixed: ResponseHeaders,
): Record<string, string> {
  const fixedNames = new Set(
    Object.keys(fixed).map((name) => name.toLowerCase()),
  );
  const merged: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!fixedNames.has(name.toLowerCase())) {
      merged[name] = value;
    }
  }
  return { ...merged, ...fixed };
}

/**
 * Sends `document` as `application/vnd.api+json`, with `ext` and `profile`
 * parameters when `document.jsonapi` lists extensions or profiles. A `201`
 * gets a `Location` header from the resource's `self` link unless one is
 * given. Extension documents (such as `atomic:results`) take the same path.
 */
export function respond<E extends Env, TDocument extends Document>(
  c: Context<E>,
  document: TDocument,
): JsonApiResponse<TDocument, 200>;
export function respond<
  E extends Env,
  TDocument extends Document,
  TStatus extends ContentfulStatusCode,
>(
  c: Context<E>,
  document: TDocument,
  status: TStatus,
  headers?: ResponseHeaders,
): JsonApiResponse<TDocument, TStatus>;
export function respond<E extends Env>(
  c: Context<E>,
  document: Document,
  status: ContentfulStatusCode = HTTP_OK,
  headers: ResponseHeaders = {},
): Response {
  const location =
    status === HTTP_CREATED && !hasHeader(headers, 'location')
      ? createdLocation(document)
      : undefined;
  return c.json(
    document,
    status,
    withFixedHeaders(headers, {
      ...(location === undefined ? {} : { Location: location }),
      'Content-Type': formatJsonApiMediaType({
        ext: document.jsonapi?.ext,
        profile: document.jsonapi?.profile,
      }),
    }),
  );
}

/**
 * Sends `errorDocument(error, base)` with the error's status and its own
 * headers (`Allow`, `Vary`, ...), which win over `headers`. Error documents
 * carry no extension or profile parameters: none are applied to them. A
 * bare rendering: no request facts, no id header, no report; `errorHandler`
 * does those for errors that are thrown.
 */
export function respondError<E extends Env>(
  c: Context<E>,
  error: BanError,
  base: DocumentBase = {},
  headers: ResponseHeaders = {},
): Response {
  return c.json(
    errorDocument(error, base),
    error.status,
    withFixedHeaders(headers, {
      ...Object.fromEntries(error.headers),
      'Content-Type': JSON_API_MEDIA_TYPE,
    }),
  );
}

/** Whether a response body is declared as the JSON:API media type. */
export function isJsonApiResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type');
  if (contentType === null) {
    return false;
  }
  const mediaType = parseMediaType(contentType);
  return mediaType !== undefined && isJsonApiMediaType(mediaType);
}

/**
 * Adds `Accept` to a `Vary` field value without duplicating it; `*` already
 * covers it. The specification asks servers that support `ext` or `profile`
 * to send it on every JSON:API response, with or without parameters applied.
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-servers
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-12.5.5
 */
export function varyAccept(current: string | null): string {
  if (current === null || current.trim() === '') {
    return 'Accept';
  }
  const names = new Set(
    current.split(',').map((name) => name.trim().toLowerCase()),
  );
  if (names.has('*') || names.has('accept')) {
    return current;
  }
  return `${current}, Accept`;
}
