/**
 * What only the Drizzle binding has (keyset SPEC 14.4, ADR 0017), on
 * PGlite: the database's `casing` over a schema declared without SQL
 * names, the caller's `where` and selection, a transaction, and cursors
 * that a Kysely keyset with the same fields, sort, and secret reads, and
 * the reverse; `drizzle-pg-schema.e2e.test.ts` covers a `pgSchema` table.
 * Expectations come from the seed, never from the SQL under test.
 */
import type { Page } from '@nizam-os/drizzle-keyset';

import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDefineKeyset } from '@nizam-os/drizzle-keyset';

import { openPglite } from './support/db.ts';
import { contactEmails, contacts as table } from './support/drizzle-schema.ts';
import { contacts, drizzleKeysets, SECRET } from './support/keysets.ts';
import { CONTACTS, emailCount, expectedIds } from './support/schema.ts';

/** The contacts table declared without SQL names, for `casing: 'snake_case'`. */
const casedContacts = pgTable('contacts', {
  id: uuid().primaryKey(),
  firstName: text().notNull(),
  lastName: text(),
  createdAt: timestamp({ withTimezone: true }).notNull(),
});

const nameOf = (id: string): string =>
  CONTACTS.find((row) => row.id === id)?.first_name ?? '';

class Rollback extends Error {}

describe('PGlite: the Drizzle binding', () => {
  let harness: Awaited<ReturnType<typeof openPglite>>;
  beforeAll(async () => {
    harness = await openPglite();
  });
  afterAll(async () => {
    await harness.close();
  });

  it("names columns by the database's casing when the schema declares none", async () => {
    const keyset = createDefineKeyset(
      { contacts: casedContacts },
      { cursor: { secret: SECRET } },
    )({
      table: 'contacts',
      key: ['id'],
      fields: {
        id: { column: 'id', type: 'uuid' },
        lastName: {
          column: 'lastName',
          type: 'text',
          collation: 'insensitive',
          nullable: true,
        },
        createdAt: { column: 'createdAt', type: 'timestamptz' },
      },
      search: { mode: 'like', columns: ['firstName', 'lastName'] },
    });
    const db = drizzle({ client: harness.pglite, casing: 'snake_case' });
    const seen: Array<string> = [];
    const statements: Array<string> = [];
    let page = await keyset.paginate(db, {
      sort: ['-lastName'],
      page: { size: 4 },
    });
    for (;;) {
      seen.push(...page.rows.map((row) => row.id));
      if (page.next === null) {
        break;
      }
      page = await keyset.paginate(
        db,
        { sort: ['-lastName'], page: { size: 4, after: page.next } },
        {
          onQuery: (event) => {
            statements.push(event.sql);
          },
        },
      );
    }
    expect(seen).toEqual(expectedIds(['-lastName']));
    expect(statements[0]).toContain('lower("contacts"."last_name")');
    const found = await keyset.paginate(db, {
      search: 'love',
      sort: ['createdAt'],
    });
    expect(found.rows.map((row) => row.firstName)).toEqual([
      'Ada',
      'Carol',
      'Judy',
    ]);
  });

  it("keeps the caller's where whole when it is written as sql with an or", async () => {
    const page = await drizzleKeysets.contacts.paginate(
      harness.drizzle,
      {
        filter: { field: 'age', op: 'gte', value: 30 },
        sort: ['createdAt'],
        page: { size: 50 },
      },
      {
        select: { id: table.id },
        where: sql`${table.status} = ${'lead'} or ${table.active}`,
        total: true,
      },
    );
    const expected = expectedIds(['createdAt']).filter((id) => {
      const row = CONTACTS.find((candidate) => candidate.id === id);
      return (
        row !== undefined &&
        (row.status === 'lead' || row.active) &&
        row.age !== null &&
        row.age >= 30
      );
    });
    expect(page.rows.map((row) => row.id)).toEqual(expected);
    expect(page.total).toBe(expected.length);
  });

  it("returns the caller's selection, a correlated subquery included", async () => {
    const page = await drizzleKeysets.contacts.paginate(
      harness.drizzle,
      { sort: ['-emailCount'], page: { size: 50 } },
      {
        select: {
          id: table.id,
          name: table.firstName,
          emails: sql<number>`(select count(*) from ${contactEmails}
            where ${sql`${contactEmails.contactId} = ${table.id}`})`.mapWith(
            Number,
          ),
        },
      },
    );
    expect(page.rows.map((row) => row.id)).toEqual(
      expectedIds(['-emailCount']),
    );
    for (const row of page.rows) {
      expect(Object.keys(row)).toEqual(['id', 'name', 'emails']);
      expect(row.emails).toBe(emailCount(row.id));
      expect(row.name).toBe(nameOf(row.id));
    }
  });

  it('runs on a transaction, seeing what the transaction wrote', async () => {
    const db = drizzle({ client: harness.pglite });
    const request = {
      filter: { field: 'firstName', op: 'eq', value: 'Zed' },
    } as const;
    let inside: Page<unknown> | undefined;
    await expect(
      db.transaction(
        async (tx) => {
          await tx.execute(sql`insert into contacts
            (id, first_name, score, active, status, tags, created_at, bio)
            values ('00000000-0000-4000-8000-00000000000f', 'Zed', 1, true,
              'lead', '{}', now(), 'new')`);
          inside = await drizzleKeysets.contacts.paginate(tx, request, {
            total: true,
          });
          throw new Rollback('roll back the insert');
        },
        { isolationLevel: 'repeatable read' },
      ),
    ).rejects.toBeInstanceOf(Rollback);
    expect(inside?.total).toBe(1);
    const after = await drizzleKeysets.contacts.paginate(db, request, {
      total: true,
    });
    expect(after.total).toBe(0);
  });

  it('issues cursors a Kysely keyset with the same fields, sort, and secret reads, and reads its cursors', async () => {
    const request = {
      sort: ['-createdAt'],
      filter: { field: 'active', op: 'eq', value: true },
      search: 'a',
      page: { size: 2 },
    } as const;
    const expected = (
      await contacts.paginate(harness.db.selectFrom('contacts').select('id'), {
        ...request,
        page: { size: 50 },
      })
    ).rows.map((row) => row.id);
    const fromDrizzle = await drizzleKeysets.contacts.paginate(
      harness.drizzle,
      request,
    );
    const inKysely = await contacts.paginate(
      harness.db.selectFrom('contacts').select('id'),
      { ...request, page: { size: 2, after: fromDrizzle.next ?? '' } },
    );
    expect(inKysely.rows.map((row) => row.id)).toEqual(expected.slice(2, 4));
    const inDrizzle = await drizzleKeysets.contacts.paginate(harness.drizzle, {
      ...request,
      page: { size: 2, before: inKysely.prev ?? '' },
    });
    expect(inDrizzle.rows.map((row) => row.id)).toEqual(expected.slice(0, 2));
    expect(expected.length).toBeGreaterThan(4);
  });
});
