import type { AggregateTarget, ColumnTarget } from '@nizam-os/keyset-core';

import { pgTable, QueryBuilder, uuid } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { relation } from '../test-support/keysets';
import { compile, schema } from '../test-support/schema';
import { renderTarget } from './target';

const context = { schema, table: 'contacts' };

function columnTarget(
  table: string,
  name: string,
  lower = false,
): ColumnTarget {
  return { kind: 'column', table, column: name, type: 'text', lower };
}

const emailCount: AggregateTarget = {
  kind: 'aggregate',
  relation: relation('emails'),
  fn: 'count',
  column: null,
  type: 'bigint',
};

describe('renderTarget (SPEC 14.2)', () => {
  it('prints a column through its Drizzle object, under its SQL name', () => {
    expect(
      compile(renderTarget(columnTarget('contacts', 'firstName'), context)),
    ).toEqual({ sql: '"contacts"."first_name"', params: [] });
  });

  it('wraps an insensitive column in lower()', () => {
    expect(
      compile(renderTarget(columnTarget('contacts', 'lastName', true), context))
        .sql,
    ).toBe('lower("contacts"."last_name")');
  });

  it('renders count as a correlated scalar subquery over the relation', () => {
    expect(compile(renderTarget(emailCount, context)).sql).toBe(
      '(select count(*) as "value" from "contact_emails" where "contact_emails"."contact_id" = "contacts"."id")',
    );
  });

  it('applies the aggregate function to the relation column', () => {
    const target: AggregateTarget = {
      kind: 'aggregate',
      relation: relation('workHistory'),
      fn: 'max',
      column: 'startDate',
      type: 'date',
    };
    expect(compile(renderTarget(target, context)).sql).toBe(
      '(select max("work_history"."start_date") as "value" from "work_history" where "work_history"."contact_id" = "contacts"."id")',
    );
  });

  it('keeps the tables of a correlated aggregate selected beside a table (ADR 0017)', () => {
    // Drizzle prints a column directly inside a selected expression without
    // its table when the query reads one table; a bare `"contact_id" = "id"`
    // would compare the relation's own id.
    const query = new QueryBuilder()
      .select({
        id: renderTarget(columnTarget('contacts', 'id'), context),
        emailCount: renderTarget(emailCount, context),
      })
      .from(schema.contacts);
    expect(query.toSQL().sql).toBe(
      'select "id", (select count(*) as "value" from "contact_emails" where "contact_emails"."contact_id" = "contacts"."id") from "contacts"',
    );
  });

  it('prints a table of another PostgreSQL schema with its schema', () => {
    const target: AggregateTarget = {
      ...emailCount,
      relation: relation('events'),
    };
    expect(compile(renderTarget(target, context)).sql).toBe(
      '(select count(*) as "value" from "audit"."events" where "audit"."events"."contact_id" = "contacts"."id")',
    );
  });

  it('doubles a quote inside a table or column name (CVE-2026-39356)', () => {
    // drizzle-orm 0.45.1 and older print "we"ird"."i"d": 0.45.2 is the peer
    // range's floor for this escaping, and CI runs this test on it.
    const weird = pgTable('we"ird', { id: uuid('i"d').primaryKey() });
    const target = columnTarget('weird', 'id');
    expect(
      compile(renderTarget(target, { schema: { weird }, table: 'weird' })).sql,
    ).toBe('"we""ird"."i""d"');
  });

  it("names a column declared without a name by the database's casing", () => {
    const target = columnTarget('people', 'givenName');
    expect(compile(renderTarget(target, context), 'snake_case').sql).toBe(
      '"people"."given_name"',
    );
    expect(compile(renderTarget(target, context)).sql).toBe(
      '"people"."givenName"',
    );
  });

  it('joins the search columns with concat_ws, which skips nulls', () => {
    expect(
      compile(
        renderTarget(
          {
            kind: 'concat',
            table: 'contacts',
            columns: ['firstName', 'lastName'],
          },
          context,
        ),
      ),
    ).toEqual({
      sql: 'concat_ws(\' \', "contacts"."first_name", "contacts"."last_name")',
      params: [],
    });
  });

  it.each(['nope', 'contact_emails', 'contactsRelations', '__proto__'])(
    'refuses %s, which names no table of the schema',
    (table) => {
      expect(() => renderTarget(columnTarget(table, 'id'), context)).toThrow(
        new TypeError(`the schema has no table ${table}`),
      );
    },
  );

  it.each(['nope', 'first_name', 'constructor'])(
    'refuses %s, which names no column of the table',
    (name) => {
      expect(() =>
        renderTarget(columnTarget('contacts', name), context),
      ).toThrow(
        new TypeError(`the schema table contacts has no column ${name}`),
      );
    },
  );
});
