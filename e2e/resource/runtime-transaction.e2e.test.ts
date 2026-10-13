/**
 * `runtime.transaction(actor, work)` (resource SPEC 12.10, 18.4) through
 * the built `@nizam-os/kysely-resource`, booted over the application's
 * role, on PGlite and on the server `RESOURCE_PG_URL` names: a contact and
 * a call that links it commit together with one event, or roll back
 * together on the first failure, which answers its declared code mapped
 * once the transaction ended, a partition's by the partitioned table's.
 * The first failure ends the transaction at once, so its row locks are
 * released while `work` goes on: a transaction of its own then updates the
 * locked row (on PGlite, whose one connection the open transaction would
 * hold, it could not run at all). On the server, whose pool runs
 * transactions side by side, a reader sees nothing before the commit, a
 * transaction inside `work` commits on its own, and the contacts quota
 * serializes two transactions of one organization.
 * @ref https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED
 */
import type { ResourceInput } from '@nizam-os/kysely-resource';

import type { RuntimeDatabase } from './runtime/database.ts';
import type { AppRuntime } from './runtime/fixture.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runtimeDatabases } from './runtime/database.ts';
import {
  contact,
  editor,
  openRuntime,
  visibleError,
} from './runtime/fixture.ts';
import { ADA, ARCHIVED } from './runtime/seed.ts';

/** A call `calls_even` stores (`runtime-partitions.e2e.test.ts`). */
const CALL = '00000000-0000-4000-8000-0000000000c1';

/** A call as `@nizam-os/jsonapi-core` parses its resource object. */
function call(id: string, contactId: string): ResourceInput {
  return {
    id,
    attributes: { minutes: 5, note: 'Called back' },
    relationships: { contact: { type: 'contacts', id: contactId } },
  };
}

describe.each(runtimeDatabases())(
  'on %s, a transaction of the runtime',
  (name, open) => {
    let database: RuntimeDatabase;
    let runtime: AppRuntime;

    beforeAll(async () => {
      database = await open();
      runtime = await openRuntime(database.db);
    });
    beforeEach(async () => {
      await database.reset();
    });
    afterAll(async () => {
      await database.close();
    });

    it('commits a contact and the call that links it together, with one event', async () => {
      const linked = await runtime.transaction(editor, async (domain) => {
        const created = await domain.contacts.create(contact({ name: 'Lin' }));
        return domain.calls.create(call(CALL, created.id));
      });
      expect(linked).toMatchObject({ id: CALL, minutes: 5 });
      expect(await database.contacts(1)).toBe(3);
      expect((await database.events()).map((event) => event.name)).toEqual([
        'contact.created',
      ]);
    });

    it('rolls both back on the first failure, answering its declared code', async () => {
      const refused = await visibleError(
        runtime.transaction(editor, async (domain) => {
          await domain.contacts.create(contact({ name: 'Lin' }));
          await domain.contacts.update(
            ARCHIVED,
            contact({ email: 'ada@example.com' }),
          );
        }),
      );
      expect(refused).toMatchObject({
        status: 409,
        code: 'CONTACT_EMAIL_TAKEN',
        errors: [{ path: ['data', 'attributes', 'email'] }],
      });
      expect(await database.contacts(1)).toBe(2);
      expect(await database.events()).toEqual([]);
    });

    it("answers a partition's violation by the code of calls, once the transaction ended", async () => {
      await runtime.as(editor).calls.create(call(CALL, ADA));
      await expect(
        runtime.transaction(editor, async (domain) => {
          await domain.contacts.update(ADA, contact({ priority: 2 }));
          await domain.calls.create(call(CALL, ADA));
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'CALLS_PKEY',
        errors: [{ path: ['data', 'id'] }],
      });
      expect(await runtime.as(editor).contacts.get(ADA)).toMatchObject({
        priority: null,
      });
    });

    it('ends at the first failure, releasing its row locks while work goes on', async () => {
      const renamed: Array<unknown> = [];
      await visibleError(
        runtime.transaction(editor, async (domain) => {
          await domain.contacts.update(ADA, contact({ name: 'Locked' }));
          const failure = await domain.contacts
            .create(contact({ name: 'Copy', email: 'ada@example.com' }))
            .catch((error: unknown) => error);
          renamed.push(
            await runtime
              .as(editor)
              .contacts.update(ADA, contact({ name: 'Free' })),
          );
          throw failure;
        }),
      );
      expect(renamed).toMatchObject([{ name: 'Free' }]);
    });

    it.skipIf(name === 'PGlite')(
      'shows a reader on another connection nothing before the commit',
      async () => {
        const seen: Array<unknown> = [];
        const created = await runtime.transaction(editor, async (domain) => {
          const row = await domain.contacts.create(contact({ name: 'Lin' }));
          seen.push(
            await visibleError(runtime.as(editor).contacts.get(row.id)),
          );
          return row;
        });
        expect(seen).toMatchObject([{ status: 404, code: 'NOT_FOUND' }]);
        expect(await runtime.as(editor).contacts.get(created.id)).toEqual(
          created,
        );
      },
    );

    it.skipIf(name === 'PGlite')(
      'opens a transaction of its own inside work, which commits though the outer one rolls back',
      async () => {
        // The inner one touches no row and no lock the outer one holds: a
        // create would wait for the quota's lock the outer create took.
        const rolledBack = new Error('the outer work gave up');
        await expect(
          runtime.transaction(editor, async (domain) => {
            await domain.contacts.create(contact({ name: 'Outer' }));
            await runtime.transaction(editor, async (inner) =>
              inner.contacts.update(ARCHIVED, contact({ priority: 3 })),
            );
            throw rolledBack;
          }),
        ).rejects.toBe(rolledBack);
        expect(await database.contacts(1)).toBe(2);
        expect(await runtime.as(editor).contacts.get(ARCHIVED)).toMatchObject({
          priority: 3,
        });
      },
    );

    it.skipIf(name === 'PGlite')(
      'serializes two transactions of one organization under its contacts quota',
      async () => {
        const outcomes = await Promise.allSettled(
          ['Lin', 'Kay'].map(async (contactName) =>
            runtime.transaction(editor, async (domain) =>
              domain.contacts.create(contact({ name: contactName })),
            ),
          ),
        );
        expect(outcomes.map((outcome) => outcome.status).toSorted()).toEqual([
          'fulfilled',
          'rejected',
        ]);
        expect(
          outcomes.find((outcome) => outcome.status === 'rejected'),
        ).toMatchObject({ reason: { status: 403, code: 'QUOTA_EXCEEDED' } });
        expect(await database.contacts(1)).toBe(3);
      },
    );
  },
);
