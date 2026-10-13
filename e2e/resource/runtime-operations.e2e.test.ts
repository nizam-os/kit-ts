/**
 * The operations endpoint of `@nizam-os/hono-resource` (resource SPEC 19.4)
 * over the runtime `createResourceRuntime` boots for the contacts
 * application, on PGlite and on the server `RESOURCE_PG_URL` names, each
 * request through `app.request`: the operations of a request commit
 * together, a call linking the contact an earlier operation created by
 * its `lid`, and hand their events to the hook after commit once; the
 * first failure rolls every one back and points at its operation, a
 * constraint violation the runtime maps once the transaction ended by the
 * index of the call that raised it, a partition's by the partitioned
 * table's code.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 */
import type { Context } from 'hono';

import type { JsonApiVariables } from '@nizam-os/hono-jsonapi';
import type { DomainEvent } from '@nizam-os/resource-core/server';

import type { RuntimeDatabase } from './runtime/database.ts';
import type { AppActor } from './runtime/domain.ts';

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
import { editor, globex, runtimeOptions } from './runtime/fixture.ts';
import { ADA, ARCHIVED } from './runtime/seed.ts';

const ATOMIC = `application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"`;
/** A call `calls_even` stores (`runtime-partitions.e2e.test.ts`). */
const CALL = '00000000-0000-4000-8000-0000000000c1';
const MISSING = '00000000-0000-4000-8000-0000000000ff';
const ACTORS: ReadonlyMap<string, AppActor> = new Map([
  ['editor', editor],
  ['globex', globex],
]);

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

/** An `update` of contact `id`'s attributes. */
function updateContact(id: string, attributes: Record<string, unknown>) {
  return {
    op: 'update',
    ref: { type: 'contacts', id },
    data: { type: 'contacts', id, attributes },
  };
}

/** An `add` of call `id`, linking `contact`. */
function addCall(id: string, contact: Record<string, string>) {
  return {
    op: 'add',
    data: {
      type: 'calls',
      id,
      attributes: { minutes: 5, note: 'Called back' },
      relationships: { contact: { data: { type: 'contacts', ...contact } } },
    },
  };
}

/** The status of `response`, and each error object's code and pointer. */
async function refusal(response: Response): Promise<ReadonlyArray<unknown>> {
  const { errors } = (await response.json()) as {
    readonly errors: ReadonlyArray<{
      readonly code: string;
      readonly source?: { readonly pointer?: string };
    }>;
  };
  return [
    response.status,
    errors.map((error) => [error.code, error.source?.pointer]),
  ];
}

describe.each(runtimeDatabases())(
  'on %s, the operations endpoint',
  (_name, open) => {
    let database: RuntimeDatabase;
    let app: Hono<Env>;
    const batches: Array<ReadonlyArray<DomainEvent>> = [];

    async function post(
      operations: ReadonlyArray<unknown>,
      actor = 'editor',
    ): Promise<Response> {
      return app.request('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': ATOMIC, Accept: ATOMIC, 'X-Actor': actor },
        body: JSON.stringify({ 'atomic:operations': operations }),
      });
    }

    beforeAll(async () => {
      database = await open();
      const runtime = await createResourceRuntime({
        ...runtimeOptions(database.db),
        afterCommit: (events) => {
          batches.push(events);
        },
      });
      app = new Hono<Env>();
      app.use(jsonApi({ extensions: [ATOMIC_OPERATIONS_EXTENSION] }));
      app.onError(errorHandler());
      app.notFound(notFoundHandler());
      app.route('/', jsonApiRoutes({ runtime, actor: actorOf }));
    });
    beforeEach(async () => {
      await database.reset();
      batches.length = 0;
    });
    afterAll(async () => {
      await database.close();
    });

    it('commits a contact and the call that links it by lid, handing their events over once', async () => {
      const response = await post([
        {
          op: 'add',
          data: { type: 'contacts', lid: 'lin', attributes: { name: 'Lin' } },
        },
        addCall(CALL, { lid: 'lin' }),
      ]);
      expect(response.status).toBe(200);
      const [created, called] = (await response.json())['atomic:results'];
      expect(called.data).toMatchObject({
        type: 'calls',
        id: CALL,
        relationships: {
          contact: { data: { type: 'contacts', id: created.data.id } },
        },
      });
      expect(await database.contacts(1)).toBe(3);
      expect(
        batches.map((events) => events.map((event) => event.name)),
      ).toEqual([['contact.created']]);
    });

    it('rolls both back on a violation mapped once the transaction ended, pointing into the operation that raised it', async () => {
      const response = await post([
        { op: 'add', data: { type: 'contacts', attributes: { name: 'Lin' } } },
        updateContact(ARCHIVED, { email: 'ada@example.com' }),
      ]);
      expect(await refusal(response)).toEqual([
        409,
        [['CONTACT_EMAIL_TAKEN', '/atomic:operations/1/data/attributes/email']],
      ]);
      expect(await database.contacts(1)).toBe(2);
      expect(await database.events()).toEqual([]);
      expect(batches).toEqual([]);
    });

    it("answers a partition's violation by the code of calls, at its operation", async () => {
      expect((await post([addCall(CALL, { id: ADA })])).status).toBe(200);
      const response = await post([
        updateContact(ADA, { priority: 2 }),
        addCall(CALL, { id: ADA }),
      ]);
      expect(await refusal(response)).toEqual([
        409,
        [['CALLS_PKEY', '/atomic:operations/1/data/id']],
      ]);
      const ada = await app.request(`/api/contacts/${ADA}`, {
        headers: { 'X-Actor': 'editor' },
      });
      expect((await ada.json()).data.attributes.priority).toBeNull();
    });

    it('points a refusal raised inside the transaction at its operation', async () => {
      const quota = await post([
        { op: 'add', data: { type: 'contacts', attributes: { name: 'Lin' } } },
        { op: 'add', data: { type: 'contacts', attributes: { name: 'Max' } } },
      ]);
      expect(await refusal(quota)).toEqual([
        403,
        [['QUOTA_EXCEEDED', '/atomic:operations/1']],
      ]);
      expect(await database.contacts(1)).toBe(2);
      const missing = await post([updateContact(MISSING, { priority: 1 })]);
      expect(await refusal(missing)).toEqual([
        404,
        [['NOT_FOUND', '/atomic:operations/0']],
      ]);
    });

    it("runs the operations as the request's actor, under row security", async () => {
      const response = await post(
        [updateContact(ADA, { priority: 3 })],
        'globex',
      );
      expect(await refusal(response)).toEqual([
        404,
        [['NOT_FOUND', '/atomic:operations/0']],
      ]);
    });

    it('targets what an href names, and refuses a relationship update calls do not declare', async () => {
      const response = await post([
        {
          op: 'update',
          href: `/api/contacts/${ADA}`,
          data: { type: 'contacts', id: ADA, attributes: { priority: 1 } },
        },
        { op: 'remove', href: `/api/contacts/${ARCHIVED}` },
      ]);
      expect(response.status).toBe(200);
      expect(await database.contacts(1)).toBe(1);
      const relinked = await post([
        {
          op: 'update',
          href: `/api/calls/${CALL}/relationships/contact`,
          data: { type: 'contacts', id: ADA },
        },
      ]);
      expect(await refusal(relinked)).toEqual([
        403,
        [['FORBIDDEN', '/atomic:operations/0']],
      ]);
    });
  },
);
