/**
 * The OpenAPI document and the localized errors of `@nizam-os/hono-resource`
 * (resource SPEC 19.5, 19.6) over the runtime `createResourceRuntime` boots
 * for the contacts application, on PGlite and on the server
 * `RESOURCE_PG_URL` names, each request through `app.request`: `GET
 * /api/openapi.json` answers, without an actor, the document `openapi`
 * makes of the runtime's resources, which an independent validator
 * accepts. The host's ban localizes with the application's Paraglide
 * messages and `resourceTypeOf`, so a refusal on a route and one inside an
 * operation, a violation the runtime maps once the transaction ended among
 * them, read in the request's language, each member labeled as its
 * resource names it.
 * @ref https://spec.openapis.org/oas/v3.1.2.html
 * @ref https://paraglidejs.com/getting-started/standalone-servers
 * @ref https://github.com/seriousme/openapi-schema-validator
 */
import type { Context } from 'hono';

import type { JsonApiVariables } from '@nizam-os/hono-jsonapi';

import type { RuntimeDatabase } from './runtime/database.ts';
import type { AppActor } from './runtime/domain.ts';

import { Validator } from '@seriousme/openapi-schema-validator';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

import { contactMessages } from './localization/contact-messages.ts';
import { paraglideMiddleware } from './localization/paraglide/server.js';
import { runtimeDatabases } from './runtime/database.ts';
import { APP_ERRORS } from './runtime/domain.ts';
import { editor, runtimeOptions } from './runtime/fixture.ts';
import { ARCHIVED } from './runtime/seed.ts';
import { APP_DOCUMENT_OPTIONS } from './support/app-document.ts';

const ATOMIC = `application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"`;
const JSON_API = 'application/vnd.api+json';

interface Env {
  readonly Variables: JsonApiVariables;
}

function actorOf(c: Context<Env>): AppActor {
  if (c.req.header('X-Actor') !== 'editor') {
    throw jsonApiError('UNAUTHORIZED', {
      detail: 'The request names no actor',
    });
  }
  return editor;
}

/** An `add` of a contact with `attributes`. */
function addContact(attributes: Record<string, unknown>) {
  return { op: 'add', data: { type: 'contacts', attributes } };
}

/** Each error object's status, code, pointer, title, and detail. */
async function errorsOf(
  response: Response,
): Promise<ReadonlyArray<ReadonlyArray<unknown>>> {
  const { errors } = (await response.json()) as {
    readonly errors: ReadonlyArray<{
      readonly status: string;
      readonly code: string;
      readonly title: string;
      readonly detail: string;
      readonly source?: { readonly pointer?: string };
    }>;
  };
  return errors.map((error) => [
    error.status,
    error.code,
    error.source?.pointer,
    error.title,
    error.detail,
  ]);
}

describe.each(runtimeDatabases())(
  'on %s, the routes of the runtime',
  (_name, open) => {
    let database: RuntimeDatabase;
    let app: Hono<Env>;
    let document: unknown;

    async function create(
      attributes: Record<string, unknown>,
      language: string,
    ): Promise<Response> {
      return app.request('/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': JSON_API,
          'Accept-Language': language,
          'X-Actor': 'editor',
        },
        body: JSON.stringify({ data: { type: 'contacts', attributes } }),
      });
    }

    async function operate(
      operations: ReadonlyArray<unknown>,
      language: string,
    ): Promise<Response> {
      return app.request('/api/operations', {
        method: 'POST',
        headers: {
          'Content-Type': ATOMIC,
          Accept: ATOMIC,
          'Accept-Language': language,
          'X-Actor': 'editor',
        },
        body: JSON.stringify({ 'atomic:operations': operations }),
      });
    }

    beforeAll(async () => {
      database = await open();
      const runtime = await createResourceRuntime(runtimeOptions(database.db));
      document = JSON.parse(
        JSON.stringify(openapi(runtime.resources, APP_DOCUMENT_OPTIONS)),
      );
      const ban = createBan({
        errors: {
          ...ERROR_CATALOG,
          ...errorCatalog(runtime.resources, APP_ERRORS),
        },
        format: jsonApiFormat({ mixedEntries: true }),
      });
      app = new Hono<Env>();
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
          transform: localizeErrors(contactMessages, {
            resource: resourceTypeOf,
          }),
        }),
      );
      app.notFound(notFoundHandler());
      app.route(
        '/',
        jsonApiRoutes({
          runtime,
          actor: actorOf,
          openapi: APP_DOCUMENT_OPTIONS,
        }),
      );
    });
    beforeEach(async () => {
      await database.reset();
    });
    afterAll(async () => {
      await database.close();
    });

    it("serves the document of the runtime's resources without an actor, which a validator accepts", async () => {
      const response = await app.request('/api/openapi.json');
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      const served = (await response.json()) as Record<string, unknown>;
      expect(served).toStrictEqual(document);
      const validator = new Validator();
      const result = await validator.validate(served);
      expect(result.errors).toBeUndefined();
      expect(result.valid).toBe(true);
    });

    it("labels a route's refusal as its resource names the member, in the request's language", async () => {
      const attributes = { name: 'Lin', email: 5 };
      expect(await errorsOf(await create(attributes, 'de'))).toEqual([
        [
          '422',
          'VALIDATION_FAILED',
          '/data/attributes/email',
          'Validierung fehlgeschlagen',
          'E-Mail muss vom Typ string sein.',
        ],
      ]);
      expect(await errorsOf(await create(attributes, 'en'))).toEqual([
        [
          '422',
          'VALIDATION_FAILED',
          '/data/attributes/email',
          'Validation Failed',
          'Email must be of type string.',
        ],
      ]);
    });

    it("labels a refusal inside an operation as the operation's resource names the member", async () => {
      const response = await operate(
        [addContact({ name: 'Lin' }), addContact({ name: 'Max', email: 5 })],
        'de',
      );
      expect(await errorsOf(response)).toEqual([
        [
          '422',
          'VALIDATION_FAILED',
          '/atomic:operations/1/data/attributes/email',
          'Validierung fehlgeschlagen',
          'E-Mail muss vom Typ string sein.',
        ],
      ]);
      expect(await database.contacts(1)).toBe(2);
    });

    it('localizes a violation mapped once the transaction ended, at its operation', async () => {
      const response = await operate(
        [
          addContact({ name: 'Lin' }),
          {
            op: 'update',
            ref: { type: 'contacts', id: ARCHIVED },
            data: {
              type: 'contacts',
              id: ARCHIVED,
              attributes: { email: 'ada@example.com' },
            },
          },
        ],
        'de',
      );
      expect(await errorsOf(response)).toEqual([
        [
          '409',
          'CONTACT_EMAIL_TAKEN',
          '/atomic:operations/1/data/attributes/email',
          'E-Mail vergeben',
          'E-Mail gehört bereits einem anderen Kontakt.',
        ],
      ]);
      expect(await database.contacts(1)).toBe(2);
    });
  },
);
