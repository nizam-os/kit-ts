/**
 * Events (SPEC 18.2, obligation 9 of resource SPEC 12.8): `record` writes
 * each event to the outbox table in the operation's transaction, in the
 * order given, so an event exists exactly when its write committed. A
 * storage created without `outbox` refuses to record any.
 * @ref https://microservices.io/patterns/data/transactional-outbox.html
 * @packageDocumentation
 */
import type { DomainEvent } from '@nizam-os/resource-core/server';

import type { KyselyTransaction } from './transaction';
import type { KyselyStorage } from './types';

import { sql } from 'kysely';

/** Inserts each of `events` into `outbox` in the transaction, in order. */
export async function recordEvents(
  outbox: KyselyStorage['outbox'],
  tx: KyselyTransaction,
  events: ReadonlyArray<DomainEvent>,
): Promise<void> {
  if (events.length === 0) {
    return;
  }
  if (outbox === undefined) {
    throw new Error(
      'record: the storage has no outbox table; pass options.outbox to createKyselyStorage',
    );
  }
  const table = sql.id(outbox.schema, outbox.table);
  for (const event of events) {
    await tx.execute((db) =>
      sql`insert into ${table} ("name", "version", "payload") values (${event.name}::text, ${String(event.version)}::text::int4, ${JSON.stringify(event.payload)}::text::jsonb)`.compile(
        db,
      ),
    );
  }
}
