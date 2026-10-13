/**
 * The reach of the quota lock in the built `@nizam-os/kysely-resource`
 * (resource SPEC 18.2): `count` locks per quota and scope value, so a
 * count waits for another transaction's count of the same scope value and
 * for no other. The storage contract proves the wait (obligation 8); this
 * proves a tenant's count holds back no other tenant. PGlite runs one
 * transaction at a time, so only the server `RESOURCE_PG_URL` names can
 * run the case.
 * @ref https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS
 */
import { afterAll, describe, expect, it } from 'vitest';

import { createKyselyStorage } from '@nizam-os/kysely-resource';
import { scopeValues } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { OUTBOX, RESET } from './support/contract-database.ts';
import { DEFINE_KEYSET } from './support/keyset-definer.ts';
import { kyselyDatabases } from './support/kysely-database.ts';

/** How long the second count may take before it counts as waiting. */
const WAIT_MS = 2000;
const { tasks } = contractFixture.resources;
const inWorkspace = (workspace: string) =>
  scopeValues(contractFixture.scopes, { workspace });

/** The placeholder of a signal's `send`, which the promise's executor replaces at once. */
function nothing(): void {
  // Never runs: `new Promise` calls its executor synchronously.
}

/** A promise and the function that fulfills it. */
function signal(): {
  readonly promise: Promise<void>;
  readonly send: () => void;
} {
  let send: () => void = nothing;
  const promise = new Promise<void>((resolve) => {
    send = resolve;
  });
  return { promise, send };
}

describe.each(kyselyDatabases())('quota locks on %s', (name, open) => {
  const database = open();
  const storage = createKyselyStorage({
    db: database.db,
    catalog: contractFixture.catalog,
    defineKeyset: DEFINE_KEYSET,
    outbox: { table: OUTBOX },
  });
  const countIn = async (workspace: string) =>
    storage.transaction(inWorkspace(workspace), async (tx) =>
      storage.count(tx, tasks, 'tasks'),
    );

  afterAll(async () => {
    await database.close();
  });

  it.skipIf(name === 'PGlite')(
    'a count waits for no transaction counting the quota of another scope value',
    async () => {
      await database.exec(RESET);
      const expected = await countIn('2');
      const holding = signal();
      const released = signal();
      const first = storage.transaction(inWorkspace('1'), async (tx) => {
        await storage.count(tx, tasks, 'tasks');
        holding.send();
        await released.promise;
      });
      await holding.promise;
      const second = countIn('2');
      const waited = new Promise<'waited'>((resolve) => {
        setTimeout(() => {
          resolve('waited');
        }, WAIT_MS);
      });
      const counted = await Promise.race([second, waited]);
      released.send();
      await Promise.all([first, second]);
      expect(counted).toBe(expected);
    },
  );
});
