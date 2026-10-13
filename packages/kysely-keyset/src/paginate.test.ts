import type { Kysely, Selectable } from 'kysely';

import type { Contacts } from './test-support/db';
import type { QueryEvent } from './types';

import { CamelCasePlugin } from 'kysely';
import { describe, expect, it } from 'vitest';

import { createDefineKeyset } from './define-keyset';
import { paginate } from './paginate';
import { canned, compileOnly } from './test-support/db';
import { CONTACTS, contacts, typedContacts } from './test-support/keysets';
import { ID, row } from './test-support/rows';

type Row = Selectable<Contacts>;

describe('paginate', () => {
  it('selects the key as text under a private alias, orders by it, and fetches size + 1', async () => {
    const { db, recorded } = canned([[row(1), row(2), row(3)]]);
    const page = await paginate(
      contacts,
      db.selectFrom('contacts').selectAll(),
      {
        page: { size: 2 },
      },
    );
    expect(recorded.queries).toHaveLength(1);
    expect(recorded.queries[0]).toMatchObject({
      sql: 'select *, cast("contacts"."id" as text) as "keyset0" from "contacts" order by "contacts"."id" asc limit $1',
      parameters: [3],
    });
    expect(page.rows).toEqual([
      { id: `${ID}1`, first_name: 'name1' },
      { id: `${ID}2`, first_name: 'name2' },
    ]);
    expect(page.hasNext).toBe(true);
    expect(page.hasPrev).toBe(false);
    const plan = await contacts.plan({ page: { size: 2 } });
    const next = await contacts.plan({ page: { size: 2, after: page.next! } });
    expect(next.context).toBe(plan.context);
    expect(next.seek).toMatchObject([{ kind: 'compare', operator: '>' }]);
  });

  it('puts the filter into where, counts it for the total, and reports both queries', async () => {
    const { db, recorded } = canned([
      [{ total: '42' }],
      [row(1, { keyset0: '2024-01-01 00:00:00+00', keyset1: `${ID}1` })],
    ]);
    const events: Array<QueryEvent> = [];
    const page = await paginate(
      contacts,
      db.selectFrom('contacts').selectAll(),
      {
        sort: ['-createdAt'],
        filter: { field: 'age', op: 'gte', value: 18 },
        search: 'ada',
        page: { size: 10 },
      },
      {
        total: true,
        onQuery: (event) => {
          events.push(event);
        },
      },
    );
    expect(page.total).toBe(42);
    expect(page.rows).toHaveLength(1);
    expect(recorded.queries.map((query) => query.sql)).toEqual([
      `select count(*) as "total" from "contacts" where ("contacts"."age" >= $1 and concat_ws(' ', "contacts"."first_name", "contacts"."last_name") ilike $2)`,
      `select *, cast("contacts"."created_at" as text) as "keyset0", cast("contacts"."id" as text) as "keyset1" from "contacts" where ("contacts"."age" >= $1 and concat_ws(' ', "contacts"."first_name", "contacts"."last_name") ilike $2) order by "contacts"."created_at" desc, "contacts"."id" asc limit $3`,
    ]);
    expect(recorded.queries[1]?.parameters).toEqual([18, '%ada%', 11]);
    expect(events.map((event) => event.kind)).toEqual(['total', 'page']);
    expect(events[0]).toMatchObject({ rowCount: 1, parameters: [18, '%ada%'] });
    expect(events[1]).toMatchObject({ rowCount: 1 });
    expect(events[1]?.sql).toBe(recorded.queries[1]?.sql);
    for (const event of events) {
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("replaces the base query's order by, limit, and offset", async () => {
    const { db, recorded } = canned([[]]);
    await paginate(
      contacts,
      db
        .selectFrom('contacts')
        .selectAll()
        .orderBy('first_name')
        .limit(1)
        .offset(5),
      { page: { size: 2 } },
    );
    expect(recorded.queries[0]?.sql).toBe(
      'select *, cast("contacts"."id" as text) as "keyset0" from "contacts" order by "contacts"."id" asc limit $1',
    );
  });

  it("keeps the caller's own where and selection", async () => {
    const { db, recorded } = canned([[]]);
    await paginate(
      contacts,
      db
        .selectFrom('contacts')
        .select(['id', 'first_name'])
        .where('active', '=', true),
      { page: { size: 2 }, filter: { field: 'age', op: 'isNull' } },
    );
    expect(recorded.queries[0]?.sql).toBe(
      'select "id", "first_name", cast("contacts"."id" as text) as "keyset0" from "contacts" where "active" = $1 and "contacts"."age" is null order by "contacts"."id" asc limit $2',
    );
  });

  it("counts without the base query's limit and without the seek", async () => {
    const { db, recorded } = canned([[{ total: 7 }], []]);
    const first = await contacts.plan({});
    const after = await contacts.page(first, [row(5)], (item) => [
      String(item['keyset0']),
    ]);
    const page = await paginate(
      contacts,
      db.selectFrom('contacts').selectAll().limit(1),
      { page: { size: 2, after: after.cursors[0] } },
      { total: true },
    );
    expect(page.total).toBe(7);
    expect(recorded.queries[0]?.sql).toBe(
      'select count(*) as "total" from "contacts"',
    );
    expect(recorded.queries[1]?.sql).toContain(
      'where "contacts"."id" > $1 order by',
    );
  });

  it('works through a CamelCasePlugin with camelCase column names', async () => {
    const defineKeyset = createDefineKeyset<{
      contacts: { id: string; firstName: string; createdAt: string };
    }>();
    const camel = defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: {
        id: { column: 'id', type: 'uuid' },
        createdAt: { column: 'createdAt', type: 'timestamptz' },
      },
      cursor: { secret: CONTACTS.cursor.secret },
    });
    const { db, recorded } = canned(
      [
        [
          {
            id: 'a',
            first_name: 'Ada',
            created_at: '2024',
            keyset0: '2024',
            keyset1: 'a',
          },
        ],
      ],
      [new CamelCasePlugin()],
    );
    const camelDb = db as unknown as Kysely<{
      contacts: { id: string; firstName: string; createdAt: string };
    }>;
    const query = camelDb.selectFrom('contacts');
    const page = await camel.paginate(query.selectAll(), {
      sort: ['-createdAt'],
    });
    expect(recorded.queries[0]?.sql).toBe(
      'select *, cast("contacts"."created_at" as text) as "keyset0", cast("contacts"."id" as text) as "keyset1" from "contacts" order by "contacts"."created_at" desc, "contacts"."id" asc limit $1',
    );
    expect(page.rows).toEqual([
      { id: 'a', firstName: 'Ada', createdAt: '2024' },
    ]);
    expect(page.cursors).toHaveLength(1);
  });

  it('is what a typed keyset exposes as paginate', async () => {
    const { db, recorded } = canned([
      [row(1, { keyset0: '2', keyset1: `${ID}1` })],
    ]);
    const page = await typedContacts.paginate(
      db.selectFrom('contacts').selectAll(),
      {
        sort: ['-emailCount'],
      },
    );
    expect(page.rows).toHaveLength(1);
    expect(recorded.queries[0]?.sql).toContain(
      'cast((select count(*) as "value" from "contact_emails" where "contact_emails"."contact_id" = "contacts"."id") as text) as "keyset0"',
    );
    expect(recorded.queries[0]?.sql).toContain(
      'order by (select count(*) as "value" from "contact_emails" where "contact_emails"."contact_id" = "contacts"."id") desc, "contacts"."id" asc limit',
    );
  });

  it('reads missing or non-string key values as null and rejects non-object rows', async () => {
    const { db } = canned([[{ id: 'x', keyset0: 5, keyset1: 'x' }]]);
    const page = await paginate(
      contacts,
      db.selectFrom('contacts').selectAll(),
      { sort: ['age'] },
    );
    const plan = await contacts.plan({ sort: ['age'] });
    const codec = await import('@nizam-os/keyset-core').then((m) =>
      m.createCursorCodec(CONTACTS.cursor),
    );
    expect(await codec.decode(page.cursors[0]!, plan.context, 2)).toEqual({
      ok: true,
      values: [null, 'x'],
    });
    const keyless = canned([[{ id: 'x' }]]);
    await expect(
      paginate(contacts, keyless.db.selectFrom('contacts').selectAll(), {}),
    ).rejects.toThrow(
      'sort key id is null, but the field is not declared nullable',
    );
    const broken = canned([[1]]);
    await expect(
      paginate(contacts, broken.db.selectFrom('contacts').selectAll(), {}),
    ).rejects.toThrow('paginate expects object rows');
  });

  it('binds cursors to the context and rejects a foreign one before querying (SPEC 6.1)', async () => {
    const { db, recorded } = canned([[row(1), row(2), row(3)]]);
    const scoped = () =>
      db.selectFrom('contacts').where('id', '<>', 'x').selectAll();
    const first = await typedContacts.paginate(
      scoped(),
      { page: { size: 2 } },
      { context: { tenant: 'acme' } },
    );
    const after = first.next ?? '';
    await expect(
      typedContacts.paginate(
        scoped(),
        { page: { after } },
        { context: { tenant: 'globex' } },
      ),
    ).rejects.toMatchObject({ parameter: 'after', reason: 'context' });
    await expect(
      typedContacts.paginate(scoped(), { page: { after } }),
    ).rejects.toMatchObject({ reason: 'context' });
    expect(recorded.queries).toHaveLength(1);
  });

  it('compiles against a dummy driver with no rows', async () => {
    const page = await paginate(
      contacts,
      compileOnly().selectFrom('contacts').selectAll(),
      {},
    );
    expect(page.rows).toEqual([]);
    expect(page.next).toBeNull();
    const rows: Array<Row> = page.rows;
    expect(rows).toEqual([]);
  });
});
