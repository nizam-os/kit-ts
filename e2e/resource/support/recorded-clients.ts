/**
 * The contacts application's clients, as the built `@nizam-os/jsonapi-client`
 * makes them, over a transport to a contacts server that records each
 * request as it leaves: the method, the path, the query, and the request
 * document. Each request acts as the editor and sends the language
 * `language` returns when it leaves, as an application's transport sends
 * Paraglide's locale. Meetings answer where the server serves them
 * (`runtime/meetings.ts`). A screen that also sends Atomic Operations makes
 * its clients over the same transport.
 */
import type {
  Clients,
  ResponseError,
  Transport,
} from '@nizam-os/jsonapi-client';

import {
  createClients,
  createTransport,
  isResponseError,
} from '@nizam-os/jsonapi-client';

import { Contacts } from '../resources/contacts.ts';
import { Meetings } from '../resources/meetings.ts';
import { Organizations } from '../resources/organizations.ts';

const DEFINITIONS = {
  contacts: Contacts.resource,
  organizations: Organizations.resource,
  meetings: Meetings.resource,
};

/** The definitions the application's clients are made from. */
export type ContactDefinitions = typeof DEFINITIONS;

export type ContactClients = Clients<ContactDefinitions>;

/** A request as the transport sent it. */
export interface Departure {
  readonly method: string;
  readonly path: string;
  /** The query string as sent, without its `?`. */
  readonly query: string;
  /** The request document, `undefined` without a body. */
  readonly body: unknown;
}

/** A transport to `origin` that pushes each request onto `departures` as it leaves. */
export function recordedTransport(
  origin: string,
  departures: Array<Departure>,
  language: () => string,
): Transport {
  return createTransport({
    origin,
    headers: { 'X-Actor': 'editor' },
    language,
    fetch: async (request) => {
      const text = await request.clone().text();
      const url = new URL(request.url);
      departures.push({
        method: request.method,
        path: url.pathname,
        query: url.search.slice(1),
        body: text === '' ? undefined : JSON.parse(text),
      });
      return fetch(request);
    },
  });
}

/** The application's clients over `transport`. */
export function contactClients(transport: Transport): ContactClients {
  return createClients(DEFINITIONS, transport);
}

/** Clients to `origin` whose requests are pushed onto `departures`. */
export function recordedClients(
  origin: string,
  departures: Array<Departure>,
  language: () => string,
): ContactClients {
  return contactClients(recordedTransport(origin, departures, language));
}

/** The requests of `departures` from the `from`th on, each as its method, path, and decoded query. */
export function sentFrom(
  departures: ReadonlyArray<Departure>,
  from: number,
): Array<string> {
  return departures
    .slice(from)
    .map(({ method, path, query }) =>
      [method, path, decodeURIComponent(query)].join(' ').trim(),
    );
}

/** The `ResponseError` a write the server refuses rejects with. */
export async function refusal(
  write: () => Promise<unknown>,
): Promise<ResponseError> {
  try {
    await write();
  } catch (error) {
    if (isResponseError(error)) {
      return error;
    }
    throw error;
  }
  throw new Error('the server accepted the write');
}
