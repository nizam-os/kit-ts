/**
 * The operations endpoint of `@nizam-os/hono-resource` answers as the
 * document it serves says (resource SPEC 13.1, 19.4, 19.5), over the
 * runtime `createResourceRuntime` boots for the contacts application, on
 * PGlite and on the server `RESOURCE_PG_URL` names, each request through
 * `app.request`: each operations document the endpoint runs passes the
 * request body's schema, and each answer conforms to the document's
 * responses: 200 with results, 204 without, and a refusal of each status
 * the processor and the runtime raise. A document the schema refuses, the
 * endpoint refuses too.
 * @ref https://jsonapi.org/ext/atomic/
 * @ref https://spec.openapis.org/oas/v3.1.2.html#request-body-object
 */
import type { Context } from 'hono';

import type { JsonApiVariables } from '@nizam-os/hono-jsonapi';
import type { OpenApiDocument } from '@nizam-os/resource-core/openapi';

import type { RuntimeDatabase } from './runtime/database.ts';
import type { AppActor } from './runtime/domain.ts';
import type { Request, Sent } from './support/http.ts';
import type { Contract } from './support/openapi-contract.ts';

import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ATOMIC_OPERATIONS_EXTENSION,
  errorHandler,
  jsonApi,
  jsonApiError,
  notFoundHandler,
} from '@nizam-os/hono-jsonapi';
import { jsonApiRoutes } from '@nizam-os/hono-resource';
import { createResourceRuntime } from '@nizam-os/kysely-resource';

import { runtimeDatabases } from './runtime/database.ts';
import { editor, runtimeOptions } from './runtime/fixture.ts';
import { ADA, ARCHIVED } from './runtime/seed.ts';
import { APP_DOCUMENT_OPTIONS } from './support/app-document.ts';
import { send } from './support/http.ts';
import { contractOf } from './support/openapi-contract.ts';

const ATOMIC = `application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"`;
const JSON_API = 'application/vnd.api+json';
const PATH = '/api/operations';
const CALL = '00000000-0000-4000-8000-0000000000c1';
const MISSING = '00000000-0000-4000-8000-0000000000ff';
const ELEVEN = 11;

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

/** The operations document of `operations`. */
function ops(...operations: ReadonlyArray<unknown>) {
  return { 'atomic:operations': operations };
}

/** An `update` of contact `id`'s attributes. */
function updateContact(id: string, attributes: Record<string, unknown>) {
  return {
    op: 'update',
    ref: { type: 'contacts', id },
    data: { type: 'contacts', id, attributes },
  };
}

/** The status and each error object's code and pointer. */
function refusal(sent: Sent): ReadonlyArray<unknown> {
  const { errors } = sent.body as {
    readonly errors: ReadonlyArray<{
      readonly code: string;
      readonly source?: { readonly pointer?: string };
    }>;
  };
  return [
    sent.status,
    errors.map((error) => [error.code, error.source?.pointer]),
  ];
}

describe.each(runtimeDatabases())(
  'on %s, the operations endpoint answers as its document says',
  (_name, open) => {
    let database: RuntimeDatabase;
    let app: Hono<Env>;
    let contract: Contract;

    /** Posts `body`, holds the answer to the document, and returns it. */
    async function exchange(
      body: unknown,
      request: Request = {},
    ): Promise<Sent> {
      const sent = await send(app, 'post', PATH, {
        actor: 'editor',
        accept: ATOMIC,
        contentType: ATOMIC,
        body,
        ...request,
      });
      expect(
        contract.response('post', PATH, sent),
        `${String(sent.status)}: ${JSON.stringify(sent.body)}`,
      ).toEqual([]);
      return sent;
    }

    beforeAll(async () => {
      database = await open();
      const runtime = await createResourceRuntime(runtimeOptions(database.db));
      app = new Hono<Env>();
      app.use(jsonApi({ extensions: [ATOMIC_OPERATIONS_EXTENSION] }));
      app.onError(errorHandler());
      app.notFound(notFoundHandler());
      app.route(
        '/',
        jsonApiRoutes({
          runtime,
          actor: actorOf,
          openapi: APP_DOCUMENT_OPTIONS,
        }),
      );
      const served = await app.request('/api/openapi.json');
      contract = contractOf((await served.json()) as OpenApiDocument);
    });
    beforeEach(async () => {
      await database.reset();
    });
    afterAll(async () => {
      await database.close();
    });

    it('answers 200 with the results of a create, an update by lid, and a create linking it', async () => {
      const body = ops(
        {
          op: 'add',
          data: { type: 'contacts', lid: 'lin', attributes: { name: 'Lin' } },
        },
        {
          op: 'update',
          ref: { type: 'contacts', lid: 'lin' },
          data: { type: 'contacts', lid: 'lin', attributes: { nickname: 'L' } },
        },
        {
          op: 'add',
          data: {
            type: 'calls',
            id: CALL,
            attributes: { minutes: 5, note: 'Called back' },
            relationships: {
              contact: { data: { type: 'contacts', lid: 'lin' } },
            },
          },
        },
      );
      expect(contract.request('post', PATH, body)).toEqual([]);
      const sent = await exchange(body);
      expect(sent.status).toBe(200);
      expect(sent.headers.get('Content-Type')).toBe(ATOMIC);
      expect(await database.contacts(1)).toBe(3);
    });

    it('answers 204 when no operation has a result', async () => {
      const body = ops({
        op: 'remove',
        ref: { type: 'contacts', id: ARCHIVED },
      });
      expect(contract.request('post', PATH, body)).toEqual([]);
      const sent = await exchange(body);
      expect(sent.status).toBe(204);
      expect(await database.contacts(1)).toBe(1);
    });

    it('answers a refusal the schema cannot foresee as the document lists it, at its operation', async () => {
      const refused = [
        ops(updateContact(ARCHIVED, { email: 'ada@example.com' })),
        ops(updateContact(MISSING, { name: 'Nobody' })),
      ];
      const answers = [];
      for (const body of refused) {
        expect(contract.request('post', PATH, body)).toEqual([]);
        answers.push(refusal(await exchange(body)));
      }
      expect(answers).toEqual([
        [
          409,
          [
            [
              'CONTACT_EMAIL_TAKEN',
              '/atomic:operations/0/data/attributes/email',
            ],
          ],
        ],
        [404, [['NOT_FOUND', '/atomic:operations/0']]],
      ]);
    });

    it('answers a request without an actor, or of another media type, as the document lists it', async () => {
      const body = ops(updateContact(ADA, { name: 'Ada' }));
      expect(refusal(await exchange(body, { actor: undefined }))).toEqual([
        401,
        [['UNAUTHORIZED', undefined]],
      ]);
      const plain = await exchange(body, { contentType: JSON_API });
      expect(plain.status).toBe(415);
    });

    it('refuses what the schema refuses, as the document lists it', async () => {
      const refused = [
        ops(
          {
            op: 'add',
            data: { type: 'contacts', attributes: { name: 'Lin' } },
          },
          {
            op: 'add',
            data: { type: 'contacts', attributes: { name: 'Max', email: 5 } },
          },
        ),
        ops({ op: 'remove', ref: { type: 'calls', id: CALL } }),
        ops(
          ...Array.from({ length: ELEVEN }, () => ({
            op: 'remove',
            ref: { type: 'contacts', id: ADA },
          })),
        ),
      ];
      const answers = [];
      for (const body of refused) {
        expect(contract.request('post', PATH, body)).not.toEqual([]);
        answers.push(refusal(await exchange(body)));
      }
      expect(answers).toEqual([
        [
          422,
          [['VALIDATION_FAILED', '/atomic:operations/1/data/attributes/email']],
        ],
        [403, [['FORBIDDEN', '/atomic:operations/0']]],
        [400, [['INVALID_DOCUMENT', '/atomic:operations']]],
      ]);
      expect(await database.contacts(1)).toBe(2);
    });
  },
);
