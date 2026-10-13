import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { createDefineKeyset as createCoreDefineKeyset } from '@nizam-os/keyset-core';

import { createDefineKeyset } from './define-keyset';
import { canned } from './test-support/db';

const SECRET = 'test-secret-with-at-least-32-bytes!!';
const ID = '00000000-0000-4000-8000-00000000000';

const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey(),
  firstName: text('first_name').notNull(),
  age: integer('age'),
  bio: text('bio').notNull(),
});

const contactEmails = pgTable('contact_emails', {
  id: integer('id').primaryKey(),
  contactId: uuid('contact_id').notNull(),
  email: text('email').notNull(),
});

const schema = { contacts, contactEmails };

const CONTACTS = {
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    age: { column: 'age', type: 'integer', nullable: true },
  },
  relations: {
    emails: {
      table: 'contactEmails',
      on: { contactId: 'id' },
      fields: { email: { column: 'email', type: 'text' } },
    },
  },
  cursor: { secret: SECRET },
} as const;

/** Contact `n` as the default selection reads it: its columns, then its id as the key. */
function row(n: number): Array<unknown> {
  const id = `${ID}${String(n)}`;
  return [id, `name${String(n)}`, null, 'bio', id];
}

describe('createDefineKeyset (SPEC 14.1)', () => {
  const defineKeyset = createDefineKeyset(schema);

  it("produces the core's definition and adds paginate", async () => {
    const keyset = defineKeyset(CONTACTS);
    expect(keyset.definition).toEqual(
      createCoreDefineKeyset()(CONTACTS).definition,
    );
    const { db, recorded } = canned([[row(1)]]);
    const page = await keyset.paginate(db, {
      filter: { field: 'emails.email', op: 'endsWith', value: '@x.io' },
    });
    expect(recorded.statements[0]?.sql).toBe(
      'select "id", "first_name", "age", "bio", cast("contacts"."id" as text) as "keyset0" from "contacts" where (exists (select 1 as "one" from "contact_emails" where "contact_emails"."contact_id" = "contacts"."id" and "contact_emails"."email" like $1)) order by "contacts"."id" asc limit $2',
    );
    expect(page.rows).toEqual([
      { id: `${ID}1`, firstName: 'name1', age: null, bio: 'bio' },
    ]);
  });

  it('validates like the core before it resolves the names', () => {
    expect(() =>
      defineKeyset({
        ...CONTACTS,
        fields: { id: { column: 'uuid' as 'id', type: 'uuid' } },
        cursor: { secret: 'short' },
      }),
    ).toThrow(new TypeError('cursor.secret must be at least 32 bytes'));
  });

  it('resolves the names in the schema at definition time', () => {
    expect(() =>
      defineKeyset({
        ...CONTACTS,
        fields: { id: { column: 'uuid' as 'id', type: 'uuid' } },
      }),
    ).toThrow(
      new TypeError(
        'fields.id.column: the schema table contacts has no column uuid',
      ),
    );
    expect(() =>
      defineKeyset({
        ...CONTACTS,
        fields: {
          ...CONTACTS.fields,
          age: { column: 'age', type: 'integer' } as never,
        },
      }),
    ).toThrow(
      new TypeError(
        'fields.age.nullable must be true: contacts.age is nullable',
      ),
    );
  });
});

describe('cursors across bindings (SPEC 14.3)', () => {
  it('reads and issues the cursors of a keyset with the same fields, sort, and secret', async () => {
    // A keyset as the Kysely binding defines it: the core's, over SQL names.
    // Neither the key text nor the request hash a cursor holds names a column.
    const other = createCoreDefineKeyset()({
      ...CONTACTS,
      relations: {
        emails: {
          table: 'contact_emails',
          on: { contact_id: 'id' },
          fields: { email: { column: 'email', type: 'text' } },
        },
      },
    });
    const keyset = createDefineKeyset(schema)(CONTACTS);
    const request = {
      sort: ['-age'],
      filter: { field: 'emails.email', op: 'endsWith', value: '@x.io' },
    } as const;
    const { db, recorded } = canned([
      [
        [...row(1).slice(0, -1), '30', `${ID}1`],
        [...row(2).slice(0, -1), '20', `${ID}2`],
      ],
      [],
    ]);
    const issued = await keyset.paginate(db, { ...request, page: { size: 1 } });
    const read = await other.plan({
      ...request,
      page: { after: issued.next! },
    });
    expect(read.after).toBe(issued.next);
    const plan = await other.plan(request);
    const theirs = await other.page(plan, [{}], () => ['25', `${ID}7`]);
    await keyset.paginate(db, {
      ...request,
      page: { after: theirs.cursors[0] },
    });
    // One select per branch (ADR 0020): the values past 25, the nulls, the rest of 25's tie.
    expect(recorded.statements[1]?.params).toEqual([
      '%@x.io',
      '25',
      21,
      '%@x.io',
      21,
      '%@x.io',
      '25',
      `${ID}7`,
      21,
      21,
    ]);
  });
});

describe('createDefineKeyset with defaults (SPEC 14.1, 3.6)', () => {
  const DEFAULTS = {
    cursor: { secret: SECRET },
    page: { default: 2, max: 40 },
    search: { config: 'english' },
  } as const;
  const define = createDefineKeyset(schema, DEFAULTS);
  const { cursor: _cursor, ...withoutCursor } = CONTACTS;

  it('merges the defaults exactly like the core', () => {
    expect(define(withoutCursor).definition).toEqual(
      createCoreDefineKeyset(DEFAULTS)(withoutCursor).definition,
    );
  });

  it('paginates with the default page size and cursor secret', async () => {
    const keyset = define(withoutCursor);
    const { db, recorded } = canned([[row(1), row(2), row(3)], [row(3)]]);
    const first = await keyset.paginate(db, {});
    expect(recorded.statements[0]?.params).toEqual([3]);
    expect(first.rows).toHaveLength(2);
    const second = await keyset.paginate(db, {
      page: { after: first.next! },
    });
    expect(recorded.statements[1]?.sql).toContain(
      'where ("contacts"."id" > $1)',
    );
    expect(recorded.statements[1]?.params).toEqual([`${ID}2`, 3]);
    expect(second.rows.map((item) => item.id)).toEqual([`${ID}3`]);
  });

  it('renders full-text search with the default configuration', async () => {
    const keyset = define({ ...withoutCursor, search: { columns: ['bio'] } });
    const { db, recorded } = canned([[]]);
    await keyset.paginate(db, { search: 'ada' });
    expect(recorded.statements[0]?.sql).toContain(
      `where (to_tsvector('english', concat_ws(' ', "contacts"."bio")) @@ websearch_to_tsquery('english', $1))`,
    );
  });

  it('needs the secret from the definition when the defaults have none', () => {
    const withoutSecret = createDefineKeyset(schema, { page: { max: 10 } });
    expect(() => withoutSecret(withoutCursor as never)).toThrow(
      new TypeError(
        'cursor.secret must be set by the definition or the defaults',
      ),
    );
    expect(withoutSecret(CONTACTS).definition.page).toEqual({
      default: 10,
      max: 10,
      range: false,
    });
  });

  it('checks the defaults at startup', () => {
    expect(() =>
      createDefineKeyset(schema, { cursor: { secret: 'short' } }),
    ).toThrow(new TypeError('cursor.secret must be at least 32 bytes'));
  });
});
