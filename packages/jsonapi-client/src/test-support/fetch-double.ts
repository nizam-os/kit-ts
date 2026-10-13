/**
 * A `fetch` double for the client's runtime tests: it answers requests in
 * order from the responses given and records what each request sent, its
 * body read once as text. Never published.
 */
import { JSON_API_MEDIA_TYPE } from '@nizam-os/jsonapi-core';

/** What one request sent. */
interface Sent {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  readonly body: string;
  readonly signal: AbortSignal;
}

export interface FetchDouble {
  readonly fetch: (request: Request) => Promise<Response>;
  /** The requests sent so far, in order. */
  readonly sent: ReadonlyArray<Sent>;
  /** The last request sent; throws when there is none. */
  readonly last: () => Sent;
}

/** A response, or a function that builds one from the request. */
export type Answer = Response | ((request: Request) => Response);

/** Answers the n-th request with the n-th answer. */
export function fetchDouble(...responses: ReadonlyArray<Answer>): FetchDouble {
  const sent: Array<Sent> = [];
  return {
    sent,
    last: (): Sent => {
      const request = sent.at(-1);
      if (request === undefined) {
        throw new Error('no request was sent');
      }
      return request;
    },
    fetch: async (request: Request): Promise<Response> => {
      sent.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: await request.text(),
        signal: request.signal,
      });
      const response = responses[sent.length - 1];
      if (response === undefined) {
        throw new Error(`no response for request ${String(sent.length)}`);
      }
      return typeof response === 'function' ? response(request) : response;
    },
  };
}

/** A JSON:API response holding `document`. */
export function jsonApi(
  document: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(document), {
    status,
    headers: { 'content-type': JSON_API_MEDIA_TYPE, ...headers },
  });
}

/** A response with no body: a 204, or a 202 without a document. */
export function empty(status = 204): Response {
  return new Response(null, { status });
}
