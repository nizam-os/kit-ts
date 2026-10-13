import type { QueryEvent } from './types';

import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  createCursorCodec,
  defineKeyset,
  keyAlias,
} from '@nizam-os/keyset-core';

import { paginate } from './paginate';
import { canned } from './test-support/db';
import { CONTACTS, contacts } from './test-support/keysets';
import { ID, row } from './test-support/rows';
import { schema, selection } from './test-support/schema';

const people = defineKeyset({
  table: 'people',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    createdAt: { column: 'createdAt', type: 'timestamptz' },
  },
  cursor: CONTACTS.cursor,
});

describe('paginate (SPEC 14.3)', () => {
  it('selects the key as text under a private alias, orders by it, and fetches size + 1', async () => {
    const { db, recorded } = canned([[row(1), row(2), row(3)]]);
    const page = await paginate(
      contacts,
      schema,
      db,
      { page: { size: 2 } },
      { select: selection },
    );
    expect(recorded.statements).toEqual([
      {
        sql: 'select "id", "first_name", cast("contacts"."id" as text) as "keyset0" from "contacts" order by "contacts"."id" asc limit $1',
        params: [3],
      },
    ]);
    expect(page.rows).toEqual([
      { id: `${ID}1`, firstName: 'name1' },
      { id: `${ID}2`, firstName: 'name2' },
    ]);
    expect(page.hasNext).toBe(true);
    expect(page.hasPrev).toBe(false);
    expect(page.cursor(page.rows[1]!)).toBe(page.next);
    const next = await contacts.plan({ page: { size: 2, after: page.next! } });
    expect(next.seek).toMatchObject([{ kind: 'compare', operator: '>' }]);
  });

  it("puts the caller's where, the filter, and the seek each in parentheses", async () => {
    const { db, recorded } = canned([[row(1), row(2)], []]);
    // Written as `sql` with an `or`, which `and()` would not parenthesize.
    const options = {
      select: selection,
      where: sql`"contacts"."status" = ${'lead'} or "contacts"."active"`,
    };
    const request = {
      filter: { field: 'age', op: 'gte', value: 18 },
      page: { size: 1 },
    } as const;
    const first = await paginate(contacts, schema, db, request, options);
    await paginate(
      contacts,
      schema,
      db,
      { ...request, page: { size: 1, after: first.next! } },
      options,
    );
    const select =
      'select "id", "first_name", cast("contacts"."id" as text) as "keyset0" from "contacts"';
    expect(recorded.statements).toEqual([
      {
        sql: `${select} where ("contacts"."status" = $1 or "contacts"."active") and ("contacts"."age" >= $2) order by "contacts"."id" asc limit $3`,
        params: ['lead', 18, 2],
      },
      {
        sql: `${select} where ("contacts"."status" = $1 or "contacts"."active") and ("contacts"."age" >= $2) and ("contacts"."id" > $3) order by "contacts"."id" asc limit $4`,
        params: ['lead', 18, `${ID}1`, 2],
      },
    ]);
  });

  it("counts the caller's where and the filter, not the seek, and reports both queries", async () => {
    const created = '2024-01-01 00:00:00+00';
    const { db, recorded } = canned([
      [['42']],
      [row(1, created, created, `${ID}1`, `${ID}1`)],
    ]);
    const request = { sort: ['-createdAt'], search: 'ada' } as const;
    const after = (
      await contacts.page(await contacts.plan(request), [row(9)], () => [
        '2025-01-01 00:00:00+00',
        `${ID}9`,
      ])
    ).cursors[0];
    const events: Array<QueryEvent> = [];
    const page = await paginate(
      contacts,
      schema,
      db,
      { ...request, page: { size: 10, after } },
      {
        select: selection,
        where: sql`"contacts"."active"`,
        total: true,
        onQuery: (event) => {
          events.push(event);
        },
      },
    );
    expect(page.total).toBe(42);
    expect(page.rows).toEqual([{ id: `${ID}1`, firstName: 'name1' }]);
    expect(recorded.statements[0]).toEqual({
      sql: `select count(*) from "contacts" where ("contacts"."active") and (concat_ws(' ', "contacts"."first_name", "contacts"."last_name") ilike $1)`,
      params: ['%ada%'],
    });
    // The caller's where and the filter hold in each branch of the seek (ADR 0020).
    const select =
      'select "id", "first_name", cast("contacts"."created_at" as text) as "keyset0", "contacts"."created_at" as "keyset0v", cast("contacts"."id" as text) as "keyset1", "contacts"."id" as "keyset1v" from "contacts"';
    const search = `concat_ws(' ', "contacts"."first_name", "contacts"."last_name")`;
    const order = 'order by "contacts"."created_at" desc, "contacts"."id" asc';
    expect(recorded.statements[1]).toEqual({
      sql: [
        `(${select} where ("contacts"."active") and (${search} ilike $1) and ("contacts"."created_at" < $2) ${order} limit $3)`,
        `union all (${select} where ("contacts"."active") and (${search} ilike $4) and (("contacts"."created_at" = $5 and "contacts"."id" > $6)) ${order} limit $7)`,
        'order by "keyset0v" desc, "keyset1v" asc  limit $8',
      ].join(' '),
      params: [
        '%ada%',
        '2025-01-01 00:00:00+00',
        11,
        '%ada%',
        '2025-01-01 00:00:00+00',
        `${ID}9`,
        11,
        11,
      ],
    });
    expect(events.map((event) => event.kind)).toEqual(['total', 'page']);
    expect(events.map((event) => event.rowCount)).toEqual([1, 1]);
    expect(events.map((event) => event.sql)).toEqual(
      recorded.statements.map((statement) => statement.sql),
    );
    expect(events.map((event) => event.parameters)).toEqual(
      recorded.statements.map((statement) => statement.params),
    );
    for (const event of events) {
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('counts zero when the count returns no row, and counts nothing unless asked', async () => {
    const { db, recorded } = canned([[], []]);
    const page = await paginate(contacts, schema, db, {}, { total: true });
    expect(page.total).toBe(0);
    expect(recorded.statements[0]?.sql).toBe('select count(*) from "contacts"');
    const uncounted = canned([[]]);
    expect((await paginate(contacts, schema, uncounted.db, {})).total).toBe(
      undefined,
    );
    expect(uncounted.recorded.statements).toHaveLength(1);
  });

  it("selects the table's columns by default, named by the database's casing", async () => {
    const { db, recorded } = canned(
      [[[`${ID}1`, 'Ada', '2024-01-01 00:00:00+00', `${ID}1`]]],
      'snake_case',
    );
    const page = await paginate(people, schema, db, {});
    expect(recorded.statements[0]?.sql).toBe(
      'select "id", "given_name", "created_at", cast("people"."id" as text) as "keyset0" from "people" order by "people"."id" asc limit $1',
    );
    expect(page.rows).toEqual([
      {
        id: `${ID}1`,
        givenName: 'Ada',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
    ]);
  });

  it('refuses a selection member named like a key alias before planning or querying', async () => {
    const { db, recorded } = canned([[]]);
    for (const name of [keyAlias(0), keyAlias(12), `${keyAlias(3)}v`]) {
      await expect(
        paginate(
          contacts,
          schema,
          db,
          { sort: ['nope' as never] },
          { select: { ...selection, [name]: sql`1` } },
        ),
      ).rejects.toThrow(
        new TypeError(
          `select has a member named ${name}: paginate reserves the names keyset0, keyset0v, keyset1, keyset1v, ... for the sort keys`,
        ),
      );
    }
    expect(recorded.statements).toHaveLength(0);
    await paginate(contacts, schema, db, {}, { select: { keyset: sql`1` } });
    expect(recorded.statements[0]?.sql).toBe(
      'select 1, cast("contacts"."id" as text) as "keyset0" from "contacts" order by "contacts"."id" asc limit $1',
    );
  });

  it('reads a non-string key value as null and strips the aliases', async () => {
    const { db } = canned([[row(1, 5, `${ID}1`)], [row(1, null)]]);
    const page = await paginate(
      contacts,
      schema,
      db,
      { sort: ['age'] },
      { select: selection },
    );
    expect(page.rows).toEqual([{ id: `${ID}1`, firstName: 'name1' }]);
    const plan = await contacts.plan({ sort: ['age'] });
    const codec = createCursorCodec(CONTACTS.cursor);
    expect(await codec.decode(page.cursors[0]!, plan.context, 2)).toEqual({
      ok: true,
      values: [null, `${ID}1`],
    });
    await expect(
      paginate(contacts, schema, db, {}, { select: selection }),
    ).rejects.toThrow(
      'sort key id is null, but the field is not declared nullable',
    );
  });

  it('binds cursors to the context and rejects a foreign one before querying (SPEC 6.1)', async () => {
    const { db, recorded } = canned([[row(1), row(2), row(3)]]);
    const options = { select: selection, where: sql`"contacts"."active"` };
    const first = await paginate(
      contacts,
      schema,
      db,
      { page: { size: 2 } },
      { ...options, context: { tenant: 'acme' } },
    );
    const after = first.next!;
    await expect(
      paginate(
        contacts,
        schema,
        db,
        { page: { after } },
        { ...options, context: { tenant: 'globex' } },
      ),
    ).rejects.toMatchObject({ parameter: 'after', reason: 'context' });
    await expect(
      paginate(contacts, schema, db, { page: { after } }, options),
    ).rejects.toMatchObject({ reason: 'context' });
    expect(recorded.statements).toHaveLength(1);
  });
});
