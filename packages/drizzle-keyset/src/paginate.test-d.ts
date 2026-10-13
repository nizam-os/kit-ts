import type { Page } from '@nizam-os/keyset-core';

import type { KeysetDatabase } from './types';

import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  withReplicas,
} from 'drizzle-orm/pg-core';
import { describe, expectTypeOf, it } from 'vitest';

import { createDefineKeyset } from './define-keyset';
import { canned } from './test-support/db';

const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey(),
  firstName: text('first_name').notNull(),
  age: integer('age'),
  tags: text('tags').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

const contactEmails = pgTable('contact_emails', {
  id: integer('id').primaryKey(),
  contactId: uuid('contact_id').notNull(),
  email: text('email').notNull(),
});

const defineKeyset = createDefineKeyset(
  { contacts, contactEmails },
  { cursor: { secret: 'x'.repeat(32) } },
);

const keyset = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    createdAt: { column: 'createdAt', type: 'timestamptz' },
    tags: { column: 'tags', type: 'array', of: 'text' },
  },
  relations: {
    emails: {
      table: 'contactEmails',
      on: { contactId: 'id' },
      fields: { email: { column: 'email', type: 'text' } },
    },
  },
});

const { db } = canned([]);

describe('paginate types (SPEC 14.3)', () => {
  it("types the rows by the table's columns, or by the caller's selection", () => {
    const page = keyset.paginate(db, {
      sort: ['-createdAt'],
      filter: {
        and: [
          { field: 'emails.email', op: 'contains', value: 'a' },
          {
            relation: 'emails',
            some: { field: 'email', op: 'eq', value: 'x' },
          },
        ],
      },
    });
    expectTypeOf(page).resolves.toEqualTypeOf<
      Page<typeof contacts.$inferSelect>
    >();
    const narrow = keyset.paginate(db, {}, { select: { id: contacts.id } });
    expectTypeOf(narrow).resolves.toEqualTypeOf<Page<{ id: string }>>();
  });

  it('keeps the row type of a page reassigned in a loop', async () => {
    const statements: Array<string> = [];
    let page = await keyset.paginate(db, {});
    while (page.next !== null) {
      page = await keyset.paginate(db, { page: { after: page.next } });
      page = await keyset.paginate(
        db,
        { page: { after: page.next ?? '' } },
        {
          total: true,
          onQuery: (event) => {
            statements.push(event.sql);
          },
        },
      );
    }
    expectTypeOf(page.rows).toEqualTypeOf<
      Array<typeof contacts.$inferSelect>
    >();
    let narrow = await keyset.paginate(db, {}, { select: { id: contacts.id } });
    narrow = await keyset.paginate(
      db,
      { page: { after: narrow.next ?? '' } },
      { select: { id: contacts.id } },
    );
    expectTypeOf(narrow.rows).toEqualTypeOf<Array<{ id: string }>>();
  });

  it('types the request', () => {
    // @ts-expect-error tags is not sortable
    void keyset.paginate(db, { sort: ['tags'] });
    void keyset.paginate(db, {
      // @ts-expect-error unknown relation
      filter: { field: 'phones.number', op: 'eq', value: 1 },
    });
  });

  it('runs on a database of any driver, a transaction, or replicas', () => {
    expectTypeOf(db).toExtend<KeysetDatabase>();
    void db.transaction(async (tx) => {
      expectTypeOf(tx).toExtend<KeysetDatabase>();
      await keyset.paginate(tx, {});
    });
    expectTypeOf(withReplicas(db, [db])).toExtend<KeysetDatabase>();
  });
});
