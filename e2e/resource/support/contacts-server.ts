/**
 * The contacts application served over a socket (resource SPEC 19, epic
 * #32's acceptance): the runtime `createResourceRuntime` boots over the
 * application's role, and the routes of `@nizam-os/hono-resource` run
 * behind Paraglide's middleware, the JSON:API middleware, and a ban that
 * localizes with the application's messages and `resourceTypeOf`, as the
 * package's README composes a host; `@hono/node-server` serves them on a
 * free port of the loopback interface. `send` fetches over that socket,
 * nothing mocked between a request and the database, and `exchange`
 * also holds the answer to the document the server serves, the one
 * `openapi` makes of the runtime's resources. The document
 * carries the contacts' business examples, which `openapi` checks when
 * the routes are made.
 * @ref https://github.com/honojs/node-server
 * @ref https://paraglidejs.com/getting-started/standalone-servers
 */
import type { ServerType } from '@hono/node-server';
import type { Context } from 'hono';

import type { JsonApiVariables } from '@nizam-os/hono-jsonapi';
import type { ResourceRuntime } from '@nizam-os/kysely-resource';
import type {
  OpenApiDocument,
  OpenApiOptions,
} from '@nizam-os/resource-core/openapi';

import type { RuntimeDatabase } from '../runtime/database.ts';
import type { AppActor, AppDomain } from '../runtime/domain.ts';
import type { Request, Sent } from './http.ts';
import type { Contract, Method } from './openapi-contract.ts';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { expect } from 'vitest';

import { createBan } from '@nizam-os/hono-ban';
import { jsonApi as jsonApiFormat } from '@nizam-os/hono-ban/formats/json-api';
import {
  ATOMIC_OPERATIONS_EXTENSION,
  CURSOR_PAGINATION_PROFILE,
  jsonApi,
  jsonApiError,
  notFoundHandler,
} from '@nizam-os/hono-jsonapi';
import { jsonApiRoutes, resourceTypeOf } from '@nizam-os/hono-resource';
import { ERROR_CATALOG } from '@nizam-os/jsonapi-core';
import { createResourceRuntime } from '@nizam-os/kysely-resource';
import { errorCatalog, localizeErrors } from '@nizam-os/resource-core';
import { openapi } from '@nizam-os/resource-core/openapi';

import { contactMessages } from '../localization/contact-messages.ts';
import { paraglideMiddleware } from '../localization/paraglide/server.js';
import { APP_ERRORS } from '../runtime/domain.ts';
import {
  editor,
  globex,
  manager,
  runtimeOptions,
  stranger,
  viewer,
} from '../runtime/fixture.ts';
import { ADA } from '../runtime/seed.ts';
import { APP_DOCUMENT_OPTIONS } from './app-document.ts';
import { send } from './http.ts';
import { contractOf } from './openapi-contract.ts';

import type { AddressInfo } from 'node:net';

const LOOPBACK = '127.0.0.1';
const ACTORS: ReadonlyMap<string, AppActor> = new Map([
  ['editor', editor],
  ['viewer', viewer],
  ['stranger', stranger],
  ['manager', manager],
  ['globex', globex],
]);

/** The application's document options with the contacts' business examples. */
const SLICE_DOCUMENT_OPTIONS: OpenApiOptions = {
  ...APP_DOCUMENT_OPTIONS,
  examples: {
    contacts: {
      create: {
        person: {
          summary: 'A person',
          attributes: {
            name: 'Lin Chen',
            email: 'lin@example.com',
            tags: ['vip'],
          },
        },
        company: {
          summary: 'A company, on a plan that includes them',
          attributes: {
            kind: 'company',
            name: 'Analytical Engines',
            website: 'https://engines.example',
          },
        },
      },
      update: {
        nickname: {
          summary: 'A nickname, every other member kept',
          id: ADA,
          attributes: { nickname: 'Countess' },
        },
      },
      get: {
        ada: {
          summary: 'A person of the first organization',
          id: ADA,
          attributes: {
            kind: 'person',
            name: 'Ada',
            nickname: null,
            email: 'ada@example.com',
            website: null,
            status: 'active',
            priority: null,
            discount: '0.00',
            tags: [],
            createdAt: '2026-01-05T09:00:00.000Z',
          },
          relationships: { organization: { type: 'organizations', id: '1' } },
        },
      },
    },
  },
};

interface Env {
  readonly Variables: JsonApiVariables;
}

function actorOf(c: Context<Env>): AppActor {
  const actor = ACTORS.get(c.req.header('X-Actor') ?? '');
  if (actor === undefined) {
    throw jsonApiError('UNAUTHORIZED', {
      detail: 'The request names no actor',
    });
  }
  return actor;
}

export interface ContactsServer {
  /** Where the server listens, such as `http://127.0.0.1:53211`, for a client's transport. */
  readonly origin: string;
  /** The document of the runtime's resources, which `GET /api/openapi.json` serves. */
  readonly document: OpenApiDocument;
  readonly contract: Contract;
  /** Sends `request` to `url` over the socket. */
  readonly send: (
    method: Method,
    url: string,
    request?: Request,
  ) => Promise<Sent>;
  /** Sends `request` to `url`, an instance of the document's `path`, and holds the answer to the document. */
  readonly exchange: (
    method: Method,
    path: string,
    url: string,
    request?: Request,
  ) => Promise<Sent>;
  readonly close: () => Promise<void>;
}

/** Serves the application on a socket: `booted`, or the runtime it boots over `database`. */
export async function openContactsServer(
  database: RuntimeDatabase,
  booted?: ResourceRuntime<AppDomain>,
): Promise<ContactsServer> {
  const runtime =
    booted ?? (await createResourceRuntime(runtimeOptions(database.db)));
  const ban = createBan({
    errors: {
      ...ERROR_CATALOG,
      ...errorCatalog(runtime.resources, APP_ERRORS),
    },
    format: jsonApiFormat({ mixedEntries: true }),
  });
  const app = new Hono<Env>();
  app.use('*', async (c, next) =>
    paraglideMiddleware(c.req.raw, async () => {
      await next();
      return c.res;
    }),
  );
  app.use(
    jsonApi({
      extensions: [ATOMIC_OPERATIONS_EXTENSION],
      profiles: [CURSOR_PAGINATION_PROFILE],
    }),
  );
  app.onError(
    ban.onError<Env>({
      transform: localizeErrors(contactMessages, { resource: resourceTypeOf }),
    }),
  );
  app.notFound(notFoundHandler());
  app.route(
    '/',
    jsonApiRoutes({ runtime, actor: actorOf, openapi: SLICE_DOCUMENT_OPTIONS }),
  );
  const { server, info } = await new Promise<{
    server: ServerType;
    info: AddressInfo;
  }>((resolve) => {
    const started: ServerType = serve(
      { fetch: app.fetch, port: 0, hostname: LOOPBACK },
      (address) => {
        resolve({ server: started, info: address });
      },
    );
  });
  const origin = `http://${LOOPBACK}:${String(info.port)}`;
  // A link the server answered is absolute, a test's own path is not: each
  // resolves against the origin as a client resolves a reference.
  // @ref https://www.rfc-editor.org/rfc/rfc3986#section-5.2
  const socket = {
    request: async (url: string, init: RequestInit) =>
      fetch(new URL(url, origin), init),
  };
  const document = openapi(runtime.resources, SLICE_DOCUMENT_OPTIONS);
  const contract = contractOf(document);
  return {
    origin,
    document,
    contract,
    send: async (method, url, request = {}) =>
      send(socket, method, url, request),
    exchange: async (method, path, url, request = {}) => {
      const sent = await send(socket, method, url, request);
      expect(
        contract.response(method, path, sent),
        `${method} ${url} answered ${String(sent.status)}: ${JSON.stringify(sent.body)}`,
      ).toEqual([]);
      return sent;
    },
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      }),
  };
}
