/**
 * The blog API called through the built client (SPEC 15.9, 17.5). Each
 * describe block serves a blog of its own over a socket and builds clients,
 * and sends operations, on a transport at the server's origin. The
 * definitions link resources under the blog's public origin, `BASE_URL`,
 * which the client ignores: it reads only their paths (SPEC 5.4). The
 * pagination links name the origin a request reached (SPEC 8.2), so the
 * client follows them. The server records each request as it arrived,
 * headers and body included.
 */
import type {
  Clients,
  Transport,
  TransportOptions,
} from '@nizam-os/jsonapi-client';

import type { RunningServer } from './server.ts';
import type { Store } from './store.ts';

import { afterAll, beforeAll, expect } from 'vitest';

import {
  createClients,
  createTransport,
  ResponseError,
} from '@nizam-os/jsonapi-client';

import { createBlog } from './blog.ts';
import { Articles, People, Tags } from './resources.ts';
import { startServer } from './server.ts';

/** Every definition a blog document can hold, so each related type resolves. */
const DEFINITIONS = { articles: Articles, people: People, tags: Tags };

type BlogClients = Clients<typeof DEFINITIONS>;

/** A request as the server received it. */
interface Arrival {
  readonly method: string;
  /** The path and the query, as sent. */
  readonly target: string;
  readonly headers: Headers;
  /** The body as text; `''` for none. */
  readonly body: string;
}

export interface ClientBlog {
  /** A transport with `options`, at the server's origin unless they name one. */
  readonly transport: (options?: Partial<TransportOptions>) => Transport;
  /** Clients over `transport(options)`. */
  readonly clients: (options?: Partial<TransportOptions>) => BlogClients;
  /** The origin the server listens on, such as `http://127.0.0.1:53211`. */
  readonly origin: () => string;
  /** The requests the server received, in order. */
  readonly arrivals: () => ReadonlyArray<Arrival>;
  readonly store: () => Store;
}

/** Serves a fresh blog for the enclosing describe block. */
export function useClientBlog(): ClientBlog {
  const arrivals: Array<Arrival> = [];
  let server: RunningServer | undefined;
  let blog: ReturnType<typeof createBlog> | undefined;
  beforeAll(async () => {
    const started = createBlog();
    blog = started;
    server = await startServer({
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        arrivals.push({
          method: request.method,
          target: `${url.pathname}${url.search}`,
          headers: request.headers,
          body: await request.clone().text(),
        });
        return started.app.fetch(request);
      },
    });
  });
  afterAll(async () => {
    await server?.close();
  });
  const running = (): RunningServer => {
    if (server === undefined) {
      throw new Error('server not started');
    }
    return server;
  };
  const transport = (options: Partial<TransportOptions> = {}): Transport =>
    createTransport({ origin: running().url, ...options });
  return {
    transport,
    clients: (options) => createClients(DEFINITIONS, transport(options)),
    origin: () => running().url,
    arrivals: () => arrivals,
    store: () => {
      if (blog === undefined) {
        throw new Error('server not started');
      }
      return blog.store;
    },
  };
}

/** What `call` rejects with; fails the test when it resolves. */
export async function rejection(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => expect.unreachable('the call resolved'),
    (caught: unknown) => caught,
  );
}

/** The `ResponseError` `call` rejects with; fails the test on anything else. */
export async function refusal(call: Promise<unknown>): Promise<ResponseError> {
  const error = await rejection(call);
  expect(error).toBeInstanceOf(ResponseError);
  if (!(error instanceof ResponseError)) {
    throw new TypeError('the call rejected with another error', {
      cause: error,
    });
  }
  return error;
}
