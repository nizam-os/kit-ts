import type { PgRemoteDatabase } from 'drizzle-orm/pg-proxy';

/**
 * The Drizzle binding's runtime-neutral checks (SPEC 11.4, 14.4): a keyset
 * defined over a Drizzle schema paginates through Drizzle's `pg-proxy`
 * driver, whose callback stands in for the database and records each
 * statement, so the binding runs with no driver or socket on Bun, Deno,
 * and workerd.
 * @ref https://orm.drizzle.team/docs/connect-drizzle-proxy
 */
import type { QueryEvent } from '@nizam-os/drizzle-keyset';

import type { Check } from './assert.ts';

import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pg-proxy';

import { createDefineKeyset } from '@nizam-os/drizzle-keyset';

import { check, equal } from './assert.ts';

const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  age: integer('age'),
});

const keyset = createDefineKeyset(
  { contacts },
  { cursor: { secret: 'smoke-secret-with-at-least-32-bytes!!' } },
)({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text', collation: 'insensitive' },
    createdAt: { column: 'createdAt', type: 'timestamptz' },
    age: { column: 'age', type: 'integer', nullable: true },
  },
  search: { columns: ['name'] },
});

const ID = '00000000-0000-4000-8000-00000000000';
const CREATED_AT = '2026-01-01T00:00:00.000Z';

/** Three people answer a page of two and tell that another follows. */
const PEOPLE = [
  [`${ID}1`, 'Ada', 40],
  [`${ID}2`, 'Adam', 30],
  [`${ID}3`, 'Adele', null],
] as const;
const TOTAL = 3;

/**
 * The selected rows the proxy answers, positional in the selection's
 * order: the table's columns, then the sort key and the tie-breaker as
 * text, and in a union of the seek's branches each also as its value
 * (ADR 0020).
 */
function rowsOf(union: boolean): Array<Array<unknown>> {
  return PEOPLE.map(([id, name, age]) => {
    const ageText = age === null ? null : String(age);
    return union
      ? [id, name, CREATED_AT, age, ageText, age, id, id]
      : [id, name, CREATED_AT, age, ageText, id];
  });
}

interface Recorded {
  readonly db: PgRemoteDatabase;
  readonly statements: Array<{ sql: string; params: Array<unknown> }>;
}

/** A database whose driver records each statement and answers it like a server would. */
function recorded(): Recorded {
  const statements: Recorded['statements'] = [];
  const db = drizzle(async (sql, params) => {
    statements.push({ sql, params });
    // A network driver answers on a later turn.
    await Promise.resolve();
    return {
      rows: sql.startsWith('select count(*)')
        ? [[TOTAL]]
        : rowsOf(sql.startsWith('(')),
    };
  });
  return { db, statements };
}

const REQUEST = { sort: ['-age'], search: 'ada', page: { size: 2 } } as const;

export const DRIZZLE_CHECKS: Readonly<Record<string, Check>> = {
  'paginates a Drizzle keyset over pg-proxy without a database': async () => {
    const { db, statements } = recorded();
    const events: Array<QueryEvent> = [];
    const page = await keyset.paginate(db, REQUEST, {
      total: true,
      onQuery: (event) => {
        events.push(event);
      },
    });
    equal(page.total, TOTAL, 'total');
    equal(page.rows.map((row) => row.name).join(','), 'Ada,Adam', 'rows');
    check(!('keyset0' in (page.rows[0] ?? {})), 'rows without the key values');
    equal(
      page.rows[0]?.createdAt.toISOString(),
      CREATED_AT,
      "rows as Drizzle's columns map them",
    );
    equal(page.hasNext, true, 'hasNext');
    equal(
      events.map((event) => event.sql).join('\n'),
      statements.map((statement) => statement.sql).join('\n'),
      'onQuery reports what the driver ran',
    );
    const sql = statements[1]?.sql ?? '';
    check(
      sql.includes('cast("contacts"."age" as text) as "keyset0"'),
      `key selection: ${sql}`,
    );
    check(
      sql.includes("websearch_to_tsquery('simple', $"),
      `text search: ${sql}`,
    );
    check(
      sql.includes(
        'order by "contacts"."age" desc nulls last, "contacts"."id" asc limit $',
      ),
      `order with the nulls of the nullable key last: ${sql}`,
    );
  },
  'resumes a Drizzle page from its cursor': async () => {
    const first = recorded();
    const page = await keyset.paginate(first.db, REQUEST);
    check(typeof page.next === 'string', 'next cursor');
    const { db, statements } = recorded();
    const resumed = await keyset.paginate(db, {
      ...REQUEST,
      page: { size: 2, after: page.next },
    });
    const statement = statements[0];
    check(statement !== undefined, 'one statement');
    // After 30 on the nullable -age: the smaller ages, the nulls, and the
    // rest of the tie, one select each under union all (ADR 0020).
    for (const branch of [
      'and ("contacts"."age" < $2) order by',
      'and ("contacts"."age" is null) order by',
      'and (("contacts"."age" = $7 and "contacts"."id" > $8)) order by',
      ') order by "keyset0v" desc nulls last, "keyset1v" asc',
    ]) {
      check(
        statement.sql.includes(branch),
        `seek past the cursor, its nulls last: ${statement.sql}`,
      );
    }
    equal(
      JSON.stringify([2, 7, 8].map((index) => statement.params[index - 1])),
      JSON.stringify(['30', '30', `${ID}2`]),
      "the cursor's values",
    );
    equal(
      resumed.rows.map((row) => `${row.name}:${String(row.age)}`).join(','),
      'Ada:40,Adam:30',
      "rows split from the union's aliases",
    );
  },
};
