/**
 * Relationship targets in the actor's scope (resource SPEC 9.5 and 12.3):
 * PostgreSQL checks the foreign key of `calls` without row security, so a
 * write alone would let an Acme call name Globex's Grace, while a contact
 * no row is fails it. The runtime looks the contact up as the actor,
 * under the scope predicate and the policy of `contacts`, and answers
 * Grace exactly as a missing contact, before anything is written, so the
 * answer tells Acme nothing of Globex's ids. On PGlite and on the server
 * `RESOURCE_PG_URL` names, through the domain alone.
 */
import type { ResourceInput } from '@nizam-os/kysely-resource';

import type { RuntimeDatabase } from './runtime/database.ts';
import type { AppRuntime } from './runtime/fixture.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runtimeDatabases } from './runtime/database.ts';
import {
  editor,
  globex,
  openRuntime,
  visibleError,
} from './runtime/fixture.ts';
import { ADA, GRACE } from './runtime/seed.ts';

const NO_CONTACT = '00000000-0000-4000-8000-00000000dead';
const CALL = '00000000-0000-4000-8000-0000000000c1';
const OTHER_CALL = '00000000-0000-4000-8000-0000000000c2';

/** A call as `@nizam-os/jsonapi-core` parses its resource object. */
function call(contact: string, id = CALL): ResourceInput {
  return {
    id,
    attributes: { minutes: 5, note: 'Called back' },
    relationships: { contact: { type: 'contacts', id: contact } },
  };
}

describe.each(runtimeDatabases())(
  "on %s, the runtime looks relationship targets up in the actor's scope",
  (_name, open) => {
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

    it("answers another organization's contact exactly as a missing one, and writes nothing", async () => {
      const foreign = await visibleError(
        runtime.as(editor).calls.create(call(GRACE)),
      );
      expect(foreign).toEqual(
        await visibleError(runtime.as(editor).calls.create(call(NO_CONTACT))),
      );
      expect(foreign).toMatchObject({
        status: 404,
        code: 'CALLS_CONTACT_ID_FKEY',
        errors: [{ path: ['data', 'relationships', 'contact'] }],
      });
      await expect(runtime.as(editor).calls.get(CALL)).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it("writes a call naming a contact of the actor's organization", async () => {
      await expect(
        runtime.as(globex).calls.create(call(GRACE)),
      ).resolves.toMatchObject({ id: CALL, contact: GRACE });
      await expect(
        runtime.as(editor).calls.create(call(ADA, OTHER_CALL)),
      ).resolves.toMatchObject({ id: OTHER_CALL, contact: ADA });
    });
  },
);
