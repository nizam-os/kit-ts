import type { ColumnTarget, Predicate } from '@nizam-os/keyset-core';

import { QueryBuilder } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { relation } from '../test-support/keysets';
import { compile, schema } from '../test-support/schema';
import { renderPredicate } from './predicate';
import { renderTarget } from './target';

const context = { schema, table: 'contacts' };

function target(name: string, type: ColumnTarget['type']): ColumnTarget {
  return {
    kind: 'column',
    table: 'contacts',
    column: name,
    type,
    lower: false,
  };
}

const firstName = target('firstName', 'text');
const age = target('age', 'integer');

function render(node: Predicate): { sql: string; params: Array<unknown> } {
  return compile(renderPredicate(node, context));
}

describe('renderPredicate (SPEC 14.2)', () => {
  it.each([
    ['=', '"contacts"."first_name" = $1'],
    ['!=', '"contacts"."first_name" != $1'],
    ['>=', '"contacts"."first_name" >= $1'],
    ['<', '"contacts"."first_name" < $1'],
  ] as const)('binds the value of a %s comparison', (operator, sql) => {
    expect(
      render({ kind: 'compare', target: firstName, operator, value: 'Ada' }),
    ).toEqual({ sql, params: ['Ada'] });
  });

  it('parenthesizes and and or, and renders the empty ones as true and false', () => {
    const both: Predicate = {
      kind: 'and',
      items: [
        { kind: 'compare', target: age, operator: '>', value: 30 },
        {
          kind: 'or',
          items: [
            { kind: 'null', target: age, negate: false },
            { kind: 'literal', value: false },
          ],
        },
      ],
    };
    expect(render(both)).toEqual({
      sql: '("contacts"."age" > $1 and ("contacts"."age" is null or false))',
      params: [30],
    });
    expect(render({ kind: 'and', items: [] }).sql).toBe('true');
    expect(render({ kind: 'or', items: [] }).sql).toBe('false');
  });

  it('negates in parentheses, and renders is not null and literal true', () => {
    expect(
      render({ kind: 'not', item: { kind: 'null', target: age, negate: true } })
        .sql,
    ).toBe('not ("contacts"."age" is not null)');
    expect(render({ kind: 'literal', value: true }).sql).toBe('true');
  });

  it('binds each value of in and not in as its own parameter', () => {
    const status = target('status', 'enum');
    expect(
      render({
        kind: 'in',
        target: status,
        values: ['lead', 'customer'],
        negate: false,
      }),
    ).toEqual({
      sql: '"contacts"."status" in ($1, $2)',
      params: ['lead', 'customer'],
    });
    expect(
      render({ kind: 'in', target: status, values: ['lead'], negate: true })
        .sql,
    ).toBe('"contacts"."status" not in ($1)');
  });

  it('binds the bounds of between', () => {
    expect(render({ kind: 'between', target: age, low: 30, high: 40 })).toEqual(
      {
        sql: '"contacts"."age" between $1 and $2',
        params: [30, 40],
      },
    );
  });

  it('binds an escaped pattern for like, and ilike when case-insensitive', () => {
    const lastName: ColumnTarget = {
      ...target('lastName', 'text'),
      lower: true,
    };
    expect(
      render({
        kind: 'like',
        target: lastName,
        pattern: 'a\\_%',
        caseInsensitive: false,
      }),
    ).toEqual({
      sql: 'lower("contacts"."last_name") like $1',
      params: ['a\\_%'],
    });
    expect(
      render({
        kind: 'like',
        target: firstName,
        pattern: '%ada%',
        caseInsensitive: true,
      }).sql,
    ).toBe('"contacts"."first_name" ilike $1');
  });

  it.each([
    ['contains', '@>'],
    ['containedBy', '<@'],
    ['overlaps', '&&'],
  ] as const)('binds the array of %s as one parameter', (operator, symbol) => {
    // Interpolated into `sql`, a JavaScript array would print as `($1, $2)`.
    expect(
      render({
        kind: 'array',
        target: target('tags', 'array'),
        operator,
        values: ['ops', 'sec'],
      }),
    ).toEqual({
      sql: `"contacts"."tags" ${symbol} $1`,
      params: [['ops', 'sec']],
    });
  });

  it('correlates exists with the relation, with the inner predicate over its table', () => {
    const emails = relation('emails');
    expect(
      render({ kind: 'exists', relation: emails, predicate: null }).sql,
    ).toBe(
      'exists (select 1 as "one" from "contact_emails" where "contact_emails"."contact_id" = "contacts"."id")',
    );
    const inner: Predicate = {
      kind: 'like',
      target: { ...target('email', 'text'), table: 'contactEmails' },
      pattern: '%@example.com',
      caseInsensitive: false,
    };
    expect(
      render({ kind: 'exists', relation: emails, predicate: inner }),
    ).toEqual({
      sql: 'exists (select 1 as "one" from "contact_emails" where "contact_emails"."contact_id" = "contacts"."id" and "contact_emails"."email" like $1)',
      params: ['%@example.com'],
    });
  });

  it('searches the columns as a text search document with a literal configuration', () => {
    expect(
      render({
        kind: 'textSearch',
        table: 'contacts',
        source: { columns: ['firstName', 'lastName'] },
        mode: 'websearch',
        config: 'simple',
        term: 'ada -lovelace',
      }),
    ).toEqual({
      sql: 'to_tsvector(\'simple\', concat_ws(\' \', "contacts"."first_name", "contacts"."last_name")) @@ websearch_to_tsquery(\'simple\', $1)',
      params: ['ada -lovelace'],
    });
  });

  it.each([
    ['plain', 'plainto_tsquery'],
    ['phrase', 'phraseto_tsquery'],
  ] as const)('matches a stored vector with the %s parser', (mode, parser) => {
    expect(
      render({
        kind: 'textSearch',
        table: 'contacts',
        source: { vector: 'searchVector' },
        mode,
        config: 'english',
        term: 'ada',
      }).sql,
    ).toBe(`"contacts"."search_vector" @@ ${parser}('english', $1)`);
  });

  it('refuses a configuration that is not a configuration name, before rendering', () => {
    expect(() =>
      render({
        kind: 'textSearch',
        table: 'contacts',
        source: { vector: 'searchVector' },
        mode: 'plain',
        config: "simple', $1) or true or to_tsquery('simple",
        term: 'ada',
      }),
    ).toThrow(
      new TypeError(
        'the text search configuration is not a configuration name',
      ),
    );
  });

  it('refuses a kind the plan does not have', () => {
    const node = { kind: 'regex', target: firstName } as unknown as Predicate;
    expect(() => render(node)).toThrow(new TypeError('unknown predicate kind'));
  });

  it('numbers its parameters after those of the query it joins', () => {
    const query = new QueryBuilder()
      .select({ age: renderTarget(age, context) })
      .from(schema.contacts)
      .where(
        renderPredicate(
          { kind: 'compare', target: age, operator: '>', value: 30 },
          context,
        ),
      )
      .limit(5);
    expect(query.toSQL()).toMatchObject({
      sql: expect.stringMatching(/ where "contacts"\."age" > \$1 limit \$2$/u),
      params: [30, 5],
    });
  });
});
