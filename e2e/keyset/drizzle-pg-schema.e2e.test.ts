/**
 * A table of another PostgreSQL schema through the Drizzle binding (keyset
 * SPEC 14.4): a relation to an `audit.events` table declared with
 * `pgSchema` filters, and an aggregate over it sorts, qualified as in the
 * application's own queries. Expectations come from the seed, never from
 * the SQL under test.
 * @ref https://orm.drizzle.team/docs/schemas
 */
import { pgSchema, serial, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDefineKeyset } from '@nizam-os/drizzle-keyset';

import { openPglite } from './support/db.ts';
import { contacts, schema } from './support/drizzle-schema.ts';
import { SECRET } from './support/keysets.ts';
import { CONTACTS } from './support/schema.ts';

const audit = pgSchema('audit');
const events = audit.table('events', {
  id: serial('id').primaryKey(),
  contactId: uuid('contact_id').notNull(),
  kind: text('kind').notNull(),
});

const EVENTS = [
  ['Ada', 'login'],
  ['Ada', 'login'],
  ['Ada', 'logout'],
  ['Carol', 'login'],
  ['Ivan', 'login'],
  ['Ivan', 'login'],
  ['Ivan', 'login'],
] as const;

const idOf = (name: string): string =>
  CONTACTS.find((row) => row.first_name === name)?.id ?? '';
const nameOf = (id: string): string =>
  CONTACTS.find((row) => row.id === id)?.first_name ?? '';

function eventsOf(id: string): number {
  return EVENTS.filter(([name]) => idOf(name) === id).length;
}

/** The `-eventCount` order of contact ids: most events first, then the key ascending. */
function byEventCount(a: string, b: string): number {
  const difference = eventsOf(b) - eventsOf(a);
  if (difference !== 0) {
    return difference;
  }
  return a < b ? -1 : 1;
}

const keyset = createDefineKeyset(
  { ...schema, events },
  { cursor: { secret: SECRET } },
)({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    eventCount: {
      aggregate: { relation: 'events', fn: 'count' },
      type: 'bigint',
    },
  },
  relations: {
    events: {
      table: 'events',
      on: { contactId: 'id' },
      fields: { kind: { column: 'kind', type: 'text' } },
    },
  },
});
const select = { id: contacts.id };

describe('PGlite: a Drizzle table of another PostgreSQL schema', () => {
  let harness: Awaited<ReturnType<typeof openPglite>>;
  beforeAll(async () => {
    harness = await openPglite();
    await sql`create schema audit`.execute(harness.db);
    await sql`create table audit.events (
      id serial primary key, contact_id uuid not null, kind text not null
    )`.execute(harness.db);
    for (const [name, kind] of EVENTS) {
      await sql`insert into audit.events (contact_id, kind)
        values (${idOf(name)}, ${kind})`.execute(harness.db);
    }
  });
  afterAll(async () => {
    await harness.close();
  });

  it('filters on a relation to it', async () => {
    const logins = await keyset.paginate(
      harness.drizzle,
      {
        filter: { field: 'events.kind', op: 'eq', value: 'login' },
        page: { size: 50 },
      },
      { select },
    );
    expect(logins.rows.map((row) => nameOf(row.id)).toSorted()).toEqual([
      'Ada',
      'Carol',
      'Ivan',
    ]);
  });

  it('sorts by an aggregate over it, ties by the key', async () => {
    const busiest = await keyset.paginate(
      harness.drizzle,
      { sort: ['-eventCount'], page: { size: 3 } },
      { select },
    );
    const expected = CONTACTS.map((row) => row.id)
      .toSorted(byEventCount)
      .slice(0, 3);
    expect(busiest.rows.map((row) => row.id)).toEqual(expected);
  });
});
