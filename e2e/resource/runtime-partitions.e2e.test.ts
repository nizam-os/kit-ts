/**
 * The runtime over a partitioned table (resource SPEC 9.5 and 12.3): what
 * PostgreSQL raises for a call names the partition that stores it, one of
 * them in another schema and two levels down, and the runtime still
 * answers with the declared code of `calls`, because its failure path has
 * the adapter resolve the partitioned table's names first. A contact no
 * row is never reaches the foreign key: the runtime's lookup answers it
 * with the same code (`runtime-targets.e2e.test.ts`), and
 * `errors-partitions.e2e.test.ts` raises the foreign key through each
 * partition. On PGlite and on the server `RESOURCE_PG_URL` names, through
 * the domain alone.
 */
import type { ResourceInput } from '@nizam-os/kysely-resource';

import type { RuntimeDatabase } from './runtime/database.ts';
import type { AppRuntime } from './runtime/fixture.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runtimeDatabases } from './runtime/database.ts';
import { editor, openRuntime } from './runtime/fixture.ts';
import { ADA } from './runtime/seed.ts';

/** An id each partition of `calls` stores (`errors-partitions.e2e.test.ts`). */
const PARTITIONS = [
  ['calls_even', '00000000-0000-4000-8000-0000000000c1'],
  ['archive.calls_odd_1', '00000000-0000-4000-8000-0000000000c8'],
  ['archive.calls_odd_3', '00000000-0000-4000-8000-0000000000c2'],
] as const;

/** A call as `@nizam-os/jsonapi-core` parses its resource object. */
function call(id: string, contact: string): ResourceInput {
  return {
    id,
    attributes: { minutes: 5, note: 'Called back' },
    relationships: { contact: { type: 'contacts', id: contact } },
  };
}

describe.each(runtimeDatabases())(
  'on %s, the runtime over the partitions of calls',
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

    it.each(PARTITIONS)(
      'answers a client id %s already stores with the code of the primary key of calls',
      async (_partition, id) => {
        await runtime.as(editor).calls.create(call(id, ADA));
        await expect(
          runtime.as(editor).calls.create(call(id, ADA)),
        ).rejects.toMatchObject({
          status: 409,
          code: 'CALLS_PKEY',
          errors: [{ path: ['data', 'id'] }],
        });
      },
    );

    it('creates and reads a call through the partitioned table', async () => {
      const [, id] = PARTITIONS[1];
      const created = await runtime.as(editor).calls.create(call(id, ADA));
      expect(created).toEqual({
        id,
        minutes: 5,
        note: 'Called back',
        contact: ADA,
      });
      expect(await runtime.as(editor).calls.get(id)).toEqual(created);
    });
  },
);
