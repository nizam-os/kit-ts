/**
 * Two layers keep a tenant to itself (resource SPEC 18.3, 18.7): the row
 * security policy, which boot checks reads the scope's parameter, and the
 * storage's own scope predicate on every statement. Boot reads a policy's
 * text, so a policy that reads the parameter but lets every row through
 * with `OR true` passes it, in the catalog extracted after the migration
 * that makes it. On PGlite and on the server `RESOURCE_PG_URL` names, the
 * application's role then reads every tenant's contacts, and the runtime
 * still reads, changes, and links only the actor's.
 * @ref https://www.postgresql.org/docs/18/sql-alterpolicy.html
 */
import type { ResourceInput } from '@nizam-os/kysely-resource';

import type { RuntimeDatabase } from './runtime/database.ts';
import type { AppRuntime } from './runtime/fixture.ts';

import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { catalogAfter } from './runtime/catalog-variant.ts';
import { runtimeDatabases } from './runtime/database.ts';
import { contact, editor, openRuntime } from './runtime/fixture.ts';
import { ADA, GRACE } from './runtime/seed.ts';

const READS_SCOPE =
  "organization_id = current_setting('app.organization_id')::bigint";
/** The policy of `V6__row_security.sql`, still reading the parameter, letting every row through. */
const OR_TRUE = `alter policy contacts_tenant_isolation on contacts
  using (${READS_SCOPE} or true)
  with check (${READS_SCOPE} or true)`;
const CALL = '00000000-0000-4000-8000-0000000000c1';

/** A call to `contact` as `@nizam-os/jsonapi-core` parses its resource object. */
function call(contactId: string): ResourceInput {
  return {
    id: CALL,
    attributes: { minutes: 5, note: 'Called back' },
    relationships: { contact: { type: 'contacts', id: contactId } },
  };
}

describe.each(runtimeDatabases())(
  'on %s, under a policy that lets every row through',
  (_name, open) => {
    let database: RuntimeDatabase;
    let runtime: AppRuntime;

    beforeAll(async () => {
      database = await open();
      await database.exec(OR_TRUE);
      runtime = await openRuntime(database.db, {
        catalog: await catalogAfter(OR_TRUE),
      });
    });
    beforeEach(async () => {
      await database.reset();
    });
    afterAll(async () => {
      await database.close();
    });

    it("the runtime boots, and the application's role reads every tenant's contacts", async () => {
      const names = await database.db.transaction().execute(async (tx) => {
        await sql`select set_config('app.organization_id', '1', true)`.execute(
          tx,
        );
        const { rows } = await sql<{
          name: string;
        }>`select name from contacts order by name`.execute(tx);
        return rows.map((row) => row.name);
      });
      expect(names).toEqual(['Ada', 'Grace', 'Old Name']);
    });

    it("still lists and reads only the actor's contacts", async () => {
      const page = await runtime.as(editor).contacts.list();
      expect(page.rows.map((row) => row.name)).toEqual(['Ada', 'Old Name']);
      await expect(
        runtime.as(editor).contacts.get(GRACE),
      ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it("still changes only the actor's contacts", async () => {
      await expect(
        runtime.as(editor).contacts.update(GRACE, contact({ name: 'Taken' })),
      ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      await expect(
        runtime.as(editor).contacts.remove(GRACE),
      ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      expect(await database.contacts(2)).toBe(1);
    });

    it("still links a call only to a contact of the actor's organization", async () => {
      await expect(
        runtime.as(editor).calls.create(call(GRACE)),
      ).rejects.toMatchObject({
        status: 404,
        code: 'CALLS_CONTACT_ID_FKEY',
      });
      await expect(
        runtime.as(editor).calls.create(call(ADA)),
      ).resolves.toMatchObject({ id: CALL, contact: ADA });
    });
  },
);
