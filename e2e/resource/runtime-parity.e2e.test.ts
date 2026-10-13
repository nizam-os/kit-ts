/**
 * A worker's call and a request take one path (resource SPEC 18.4): for
 * each failure, the error the runtime throws through the domain alone,
 * rendered by the API's error handler, is the error document the API
 * answers the same request with: the status, and every error but its
 * occurrence's `id`. The API is the one
 * `@nizam-os/hono-resource` will mount (`runtime/api.ts`); it adds no
 * database of its own, so the suite runs on PGlite.
 * @ref https://jsonapi.org/format/1.1/#errors
 */
import type { AppEnv } from './runtime/api.ts';
import type { RuntimeDatabase } from './runtime/database.ts';
import type { AppRuntime } from './runtime/fixture.ts';
import type { Request, Sent } from './support/http.ts';

import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { errorHandler } from '@nizam-os/hono-jsonapi';

import { createApi } from './runtime/api.ts';
import { openPgliteDatabase } from './runtime/database.ts';
import { contact, editor, openRuntime, viewer } from './runtime/fixture.ts';
import { ARCHIVED, GRACE } from './runtime/seed.ts';
import { send } from './support/http.ts';

const CALL = '00000000-0000-4000-8000-0000000000c1';

/** The members a failure acts as, by the name the API's `X-Actor` header takes. */
const MEMBERS = { editor, viewer } as const;

/** Each resource's operations, as one member runs them. */
type Operations = ReturnType<AppRuntime['as']>;

/** A failure, as the domain runs it and as a request asks for it. */
interface Failure {
  readonly member: keyof typeof MEMBERS;
  readonly domain: (operations: Operations) => Promise<unknown>;
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
}

/** A create of `attributes` as a request document. */
function contactDocument(attributes: Record<string, unknown>): unknown {
  return { data: { type: 'contacts', attributes } };
}

const FAILURES: ReadonlyArray<readonly [string, Failure]> = [
  [
    'an input the declaration refuses',
    {
      member: 'editor',
      domain: async (operations) =>
        operations.contacts.create(contact({ name: '' })),
      method: 'post',
      url: '/api/contacts',
      body: contactDocument({ name: '' }),
    },
  ],
  [
    'a create the policy denies',
    {
      member: 'viewer',
      domain: async (operations) =>
        operations.contacts.create(contact({ name: 'Bea' })),
      method: 'post',
      url: '/api/contacts',
      body: contactDocument({ name: 'Bea' }),
    },
  ],
  [
    "a rule's rejection",
    {
      member: 'editor',
      domain: async (operations) =>
        operations.contacts.create(
          contact({ name: 'Initech', kind: 'company' }),
        ),
      method: 'post',
      url: '/api/contacts',
      body: contactDocument({ name: 'Initech', kind: 'company' }),
    },
  ],
  [
    'a unique key the database enforces',
    {
      member: 'editor',
      domain: async (operations) =>
        operations.contacts.create(
          contact({ name: 'Bea', email: 'ADA@example.com' }),
        ),
      method: 'post',
      url: '/api/contacts',
      body: contactDocument({ name: 'Bea', email: 'ADA@example.com' }),
    },
  ],
  [
    "a rule's rejection of an update",
    {
      member: 'editor',
      domain: async (operations) =>
        operations.contacts.update(ARCHIVED, contact({ name: 'New' })),
      method: 'patch',
      url: `/api/contacts/${ARCHIVED}`,
      body: {
        data: { type: 'contacts', id: ARCHIVED, attributes: { name: 'New' } },
      },
    },
  ],
  [
    'a row of another organization',
    {
      member: 'editor',
      domain: async (operations) => operations.contacts.get(GRACE),
      method: 'get',
      url: `/api/contacts/${GRACE}`,
    },
  ],
  [
    'a relationship target of another organization',
    {
      member: 'editor',
      domain: async (operations) =>
        operations.calls.create({
          id: CALL,
          attributes: { minutes: 5, note: 'Called back' },
          relationships: { contact: { type: 'contacts', id: GRACE } },
        }),
      method: 'post',
      url: '/api/calls',
      body: {
        data: {
          type: 'calls',
          id: CALL,
          attributes: { minutes: 5, note: 'Called back' },
          relationships: {
            contact: { data: { type: 'contacts', id: GRACE } },
          },
        },
      },
    },
  ],
  [
    'a cursor the keyset cannot read',
    {
      member: 'editor',
      domain: async (operations) =>
        operations.contacts.list({ page: { after: 'not-a-cursor' } }),
      method: 'get',
      url: '/api/contacts?page[after]=not-a-cursor',
    },
  ],
];

/**
 * The document's errors without their `id`, which the handler draws for
 * each occurrence (JSON:API: "a unique identifier for this particular
 * occurrence of the problem").
 */
function occurrenceFree(body: unknown): unknown {
  const errors: unknown =
    typeof body === 'object' && body !== null
      ? Reflect.get(body, 'errors')
      : undefined;
  if (!Array.isArray(errors)) {
    throw new TypeError('the answer is not an error document');
  }
  return errors.map((error: unknown) => {
    if (typeof error !== 'object' || error === null) {
      throw new TypeError('an error document holds a non-object error');
    }
    return Object.fromEntries(
      Object.entries(error).filter(([member]) => member !== 'id'),
    );
  });
}

/** `error` as the API's error handler renders it. */
async function rendered(error: unknown): Promise<Sent> {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler());
  app.get('/', () => {
    throw error;
  });
  return send(app, 'get', '/');
}

describe('the runtime answers a failure alike through the domain and the API', () => {
  let database: RuntimeDatabase;
  let runtime: AppRuntime;
  let api: ReturnType<typeof createApi>;

  beforeAll(async () => {
    database = await openPgliteDatabase();
    runtime = await openRuntime(database.db);
    api = createApi(runtime);
  });
  beforeEach(async () => {
    await database.reset();
  });
  afterAll(async () => {
    await database.close();
  });

  it.each(FAILURES)('for %s', async (_case, failure) => {
    const thrown = await failure
      .domain(runtime.as(MEMBERS[failure.member]))
      .then(
        () => {
          throw new Error('the operation succeeded');
        },
        (error: unknown) => error,
      );
    const request: Request = {
      actor: failure.member,
      ...(failure.body === undefined ? {} : { body: failure.body }),
    };
    const answered = await send(api, failure.method, failure.url, request);
    const expected = await rendered(thrown);
    expect({
      status: answered.status,
      errors: occurrenceFree(answered.body),
    }).toEqual({
      status: expected.status,
      errors: occurrenceFree(expected.body),
    });
    expect(answered.status).toBeGreaterThanOrEqual(400);
  });
});
