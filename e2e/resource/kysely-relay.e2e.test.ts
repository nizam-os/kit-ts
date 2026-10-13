/**
 * Concurrent relays of the built `@nizam-os/kysely-resource` (resource SPEC
 * 18.6): a run claims its rows with `FOR UPDATE SKIP LOCKED`, so a second
 * run neither waits for the first nor delivers what the first holds, and
 * both commit though the server's sessions default to SERIALIZABLE, since
 * a run sets READ COMMITTED as the storage's transactions do. PGlite runs
 * one transaction at a time, so only the server `RESOURCE_PG_URL` names
 * can run the cases.
 * @ref https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE
 * @ref https://www.postgresql.org/docs/18/transaction-iso.html#XACT-SERIALIZABLE
 */
import type { OutboxEvent } from '@nizam-os/kysely-resource';

import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';

import { relayOutbox } from '@nizam-os/kysely-resource';

import { OUTBOX, RESET } from './support/contract-database.ts';
import { kyselyDatabases } from './support/kysely-database.ts';

/** How long the second run may take before it counts as waiting. */
const WAIT_MS = 2000;
/** Events in the outbox, and how many one run claims. */
const EVENTS = 10;
const LIMIT = 5;
const FILL = `insert into ${OUTBOX} (name, version, payload) select 'task.created', 1, jsonb_build_object('n', n) from generate_series(1, ${String(EVENTS)}) as n`;
const POSITIONS = Array.from({ length: EVENTS }, (_, index) =>
  String(index + 1),
);

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

/** Resolves to `'waited'` after `WAIT_MS`. */
async function timeout(): Promise<'waited'> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve('waited');
    }, WAIT_MS);
  });
}

const positionsOf = (events: ReadonlyArray<OutboxEvent>) =>
  events.map((event) => event.position);

describe.each(kyselyDatabases())('outbox relays on %s', (name, open) => {
  const database = open();
  const remaining = async () => {
    const { rows } = await sql<{
      readonly at: string;
    }>`select position::text as at from ${sql.table(OUTBOX)} order by position`.execute(
      database.db,
    );
    return rows.map((row) => row.at);
  };

  afterAll(async () => {
    await database.close();
  });

  it.skipIf(name === 'PGlite')(
    'a run delivers the rows no other run holds, without waiting for it',
    async () => {
      await database.exec(`${RESET}${FILL}`);
      const holding = signal();
      const released = signal();
      const delivered: Array<ReadonlyArray<OutboxEvent>> = [];
      const first = relayOutbox({
        db: database.db,
        outbox: { table: OUTBOX },
        limit: LIMIT,
        deliver: async (events) => {
          delivered.push(events);
          holding.send();
          await released.promise;
        },
      });
      await holding.promise;
      const second = relayOutbox({
        db: database.db,
        outbox: { table: OUTBOX },
        limit: LIMIT,
        deliver: (events) => {
          delivered.push(events);
        },
      });
      const raced = await Promise.race([second, timeout()]);
      released.send();
      expect(await Promise.all([first, second])).toEqual([LIMIT, LIMIT]);
      expect(raced).toBe(LIMIT);
      expect(delivered.map((events) => positionsOf(events))).toEqual([
        POSITIONS.slice(0, LIMIT),
        POSITIONS.slice(LIMIT),
      ]);
      expect(await remaining()).toEqual([]);
    },
  );

  it.skipIf(name === 'PGlite')(
    'a run whose delivery rejects leaves its rows to a run after it',
    async () => {
      await database.exec(`${RESET}${FILL}`);
      const holding = signal();
      const released = signal();
      const failure = new Error('the broker is down');
      const first = relayOutbox({
        db: database.db,
        outbox: { table: OUTBOX },
        limit: LIMIT,
        deliver: async () => {
          holding.send();
          await released.promise;
          throw failure;
        },
      });
      await holding.promise;
      const during: Array<string> = [];
      await relayOutbox({
        db: database.db,
        outbox: { table: OUTBOX },
        deliver: (events) => {
          during.push(...positionsOf(events));
        },
      });
      released.send();
      await expect(first).rejects.toBe(failure);
      expect(await remaining()).toEqual(POSITIONS.slice(0, LIMIT));
      const after: Array<string> = [];
      await relayOutbox({
        db: database.db,
        outbox: { table: OUTBOX },
        deliver: (events) => {
          after.push(...positionsOf(events));
        },
      });
      expect(during).toEqual(POSITIONS.slice(LIMIT));
      expect(after).toEqual(POSITIONS.slice(0, LIMIT));
      expect(await remaining()).toEqual([]);
    },
  );
});
