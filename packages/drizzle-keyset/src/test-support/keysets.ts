/**
 * The keyset of the adapter's unit tests, defined with the core over the
 * test schema's names: table keys and column properties, as a Drizzle
 * application writes them.
 */
import type { Keyset, Relation } from '@nizam-os/keyset-core';

import { defineKeyset } from '@nizam-os/keyset-core';

export const CONTACTS = {
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    firstName: { column: 'firstName', type: 'text' },
    lastName: {
      column: 'lastName',
      type: 'text',
      collation: 'insensitive',
      nullable: true,
    },
    age: { column: 'age', type: 'integer', nullable: true },
    score: { column: 'score', type: 'decimal' },
    active: { column: 'active', type: 'boolean' },
    status: { column: 'status', type: 'enum', values: ['lead', 'customer'] },
    tags: { column: 'tags', type: 'array', of: 'text' },
    createdAt: { column: 'createdAt', type: 'timestamptz' },
    birthday: { column: 'birthday', type: 'date', nullable: true },
    emailCount: {
      aggregate: { relation: 'emails', fn: 'count' },
      type: 'bigint',
    },
    latestStart: {
      aggregate: { relation: 'workHistory', fn: 'max', column: 'startDate' },
      type: 'date',
    },
    eventCount: {
      aggregate: { relation: 'events', fn: 'count' },
      type: 'bigint',
    },
  },
  relations: {
    emails: {
      table: 'contactEmails',
      on: { contactId: 'id' },
      fields: {
        email: { column: 'email', type: 'text' },
        primary: { column: 'isPrimary', type: 'boolean' },
      },
    },
    workHistory: {
      table: 'workHistory',
      on: { contactId: 'id' },
      fields: { company: { column: 'company', type: 'text' } },
    },
    events: {
      table: 'events',
      on: { contactId: 'id' },
      fields: { kind: { column: 'kind', type: 'text' } },
    },
  },
  search: { mode: 'like', columns: ['firstName', 'lastName'] },
  page: { range: true },
  cursor: { secret: 'test-secret-with-at-least-32-bytes!!' },
} as const;

export const contacts: Keyset<
  typeof CONTACTS.fields,
  typeof CONTACTS.relations
> = defineKeyset(CONTACTS);

/** A declared relation of the test keyset, by name. */
export function relation(name: keyof typeof CONTACTS.relations): Relation {
  const found = contacts.definition.relations.get(name);
  if (found === undefined) {
    throw new TypeError(`the test keyset has no relation ${name}`);
  }
  return found;
}
