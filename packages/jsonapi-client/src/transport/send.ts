import type { HeadersInit } from '../internal/headers-init';
import type { JsonRecord } from '../internal/object';
import type { TransportState } from './transport';

/**
 * `send(state, outgoing, options)` (SPEC 15.3): one request and its
 * response. Every request accepts the JSON:API media type, and one with a
 * document says so in `Content-Type`; one without carries none, which would
 * make a cross-origin `GET` preflighted. The media type is bare, but on a
 * request that applies an extension, which names it in both, and whose
 * response document may then hold the extension's members alone. The
 * response is read once, as text, through `status`, `headers`, and `text()`
 * alone, so a `fetch` that returns another realm's or library's response
 * works. A 2xx holds a JSON:API document, except that a 202 or a 204 may
 * hold none; any other 2xx breaks the protocol and throws `TypeError`; every
 * other status rejects with `ResponseError`. A rejected `fetch` reaches the
 * caller as it is.
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-all ("MUST specify the ext media type parameter in the Content-Type header when they have applied one or more extensions")
 * @ref https://jsonapi.org/format/1.1/#content-negotiation-clients ("A client MAY use the ext media type parameter in an Accept header to require that a server apply all the specified extensions")
 * @ref https://jsonapi.org/format/1.1/#document-top-level ("A document MUST contain at least one of the following top-level members: data, errors, meta, a member defined by an applied extension")
 * @ref https://fetch.spec.whatwg.org/#cors-safelisted-request-header
 * @packageDocumentation
 */
import {
  formatJsonApiMediaType,
  isJsonApiMediaType,
  JSON_API_MEDIA_TYPE,
  parseMediaType,
} from '@nizam-os/jsonapi-core';

import { ResponseError } from '../errors/response-error';
import { isRecord } from '../internal/object';

/** What one call adds to a request. */
export interface CallOptions {
  /** Aborts the request, such as `AbortSignal.timeout(ms)` for a timeout. */
  readonly signal?: AbortSignal | undefined;
  /** Applied after the transport's headers and language, before the client's own. */
  readonly headers?: HeadersInit | undefined;
}

/** An extension a request applies: its URI, and the top-level members it defines. */
export interface AppliedExtension {
  readonly uri: string;
  readonly members: ReadonlyArray<string>;
}

/** A request a client makes: the call it serves, the method, the URL, and the document it sends. */
export interface Outgoing {
  /** The resource type the call is for. */
  readonly type: string;
  /** The call, such as `list` or `create`. */
  readonly call: string;
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly url: string;
  readonly document?: object | undefined;
  /** The extension the request applies, if any. */
  readonly extension?: AppliedExtension | undefined;
}

/** A 2xx response: its status and its document, `undefined` for a 202 or a 204 without one. */
export interface Incoming {
  readonly status: number;
  readonly document: JsonRecord | undefined;
}

/** The members of which a JSON:API document holds at least one, besides an applied extension's. */
const DOCUMENT_MEMBERS: ReadonlyArray<string> = ['data', 'errors', 'meta'];
const NO_CONTENT = 204;
const ACCEPTED = 202;
const SUCCESS_MIN = 200;
const SUCCESS_MAX = 299;

/** The `TypeError` for a 2xx that holds no JSON:API document where the call needs one. */
export function noDocument(
  type: string,
  call: string,
  status: number,
): TypeError {
  return new TypeError(
    `${type} ${call} answered ${String(status)} without a JSON:API document`,
  );
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A document: a JSON object with `data`, `errors`, `meta`, or one of the applied extension's `members`. */
function documentIn(
  headers: { readonly get: (name: string) => string | null },
  text: string,
  members: ReadonlyArray<string>,
): JsonRecord | undefined {
  const contentType = headers.get('content-type');
  const mediaType =
    contentType === null ? undefined : parseMediaType(contentType);
  if (mediaType === undefined || !isJsonApiMediaType(mediaType)) {
    return undefined;
  }
  const body = parsedJson(text);
  return isRecord(body) &&
    [...DOCUMENT_MEMBERS, ...members].some((member) =>
      Object.hasOwn(body, member),
    )
    ? body
    : undefined;
}

async function headersOf(
  state: TransportState,
  outgoing: Outgoing,
  options: CallOptions,
): Promise<Headers> {
  const headers = new Headers(
    typeof state.headers === 'function' ? await state.headers() : state.headers,
  );
  const language = state.language?.();
  if (language !== undefined && language !== '') {
    headers.set('accept-language', language);
  }
  for (const [name, value] of new Headers(options.headers)) {
    headers.set(name, value);
  }
  const mediaType =
    outgoing.extension === undefined
      ? JSON_API_MEDIA_TYPE
      : formatJsonApiMediaType({ ext: [outgoing.extension.uri] });
  headers.set('accept', mediaType);
  if (outgoing.document === undefined) {
    headers.delete('content-type');
  } else {
    headers.set('content-type', mediaType);
  }
  return headers;
}

/**
 * Sends `outgoing` through the transport. Resolves to the status and the
 * document of a 2xx; throws `TypeError` for a 2xx without a document a 202
 * or a 204 may lack, and rejects with `ResponseError` for any other status.
 */
export async function send(
  state: TransportState,
  outgoing: Outgoing,
  options: CallOptions = {},
): Promise<Incoming> {
  const request = new Request(outgoing.url, {
    method: outgoing.method,
    headers: await headersOf(state, outgoing, options),
    ...(outgoing.document === undefined
      ? {}
      : { body: JSON.stringify(outgoing.document) }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  // Called as a plain function: a `fetch` called as a method of another object throws "Illegal invocation" in browsers.
  const fetcher = state.fetch ?? globalThis.fetch;
  const response = await fetcher(request);
  const { status } = response;
  const text = await response.text();
  if (status < SUCCESS_MIN || status > SUCCESS_MAX) {
    throw new ResponseError({
      type: outgoing.type,
      call: outgoing.call,
      status,
      body: parsedJson(text),
      headers: response.headers,
    });
  }
  const document =
    status === NO_CONTENT
      ? undefined
      : documentIn(response.headers, text, outgoing.extension?.members ?? []);
  if (document === undefined && status !== NO_CONTENT && status !== ACCEPTED) {
    throw noDocument(outgoing.type, outgoing.call, status);
  }
  return { status, document };
}
