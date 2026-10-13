import type { Catalog, Rule } from '@nizam-os/catalog-core';

import type { SqlSession } from '../target/session';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { replay } from '../replay';
import { openThrowawayDatabase } from '../target/server';
import { useSession } from '../target/session';
import { replayedPglite } from '../test-support/replayed';
import { ruleAccepts } from '../test-support/rule-verdict';
import { rulesMigrations } from '../test-support/rules-schema';
import { readCatalog } from './read-catalog';

const SCHEMAS = ['public'];
const CHECK_VIOLATION = '23514';

/** Values at and around each bound, sent as text the way a client would send them. */
const COLUMN_VALUES: ReadonlyArray<
  readonly [string, string, ReadonlyArray<string | null>]
> = [
  [
    'name',
    'name_length',
    [
      '',
      'a',
      'x'.repeat(200),
      'x'.repeat(201),
      '日'.repeat(200),
      '𝒳'.repeat(200),
      '𝒳'.repeat(201),
    ],
  ],
  ['code', 'code_member', ['a', 'b', 'c', 'A', 'a ']],
  ['slug', 'slug_pattern', ['abc-1', '-', 'ABC', 'a_b', 'a\nb', '']],
  ['website', 'website_pattern', ['https://x', 'http://x', 'xhttps://', null]],
  ['qty', 'qty_range', ['1', '0', '-1', '2147483647']],
  ['price', 'price_range', ['0.00', '-0.01', '0.01', '12345678.99']],
  [
    'ratio',
    'ratio_range',
    ['0', '1', '-0.0000001', '1.0000001', '0.5', '1e-320'],
  ],
  ['feeling', 'feeling_member', ['happy', 'sad']],
  ['note', 'note_length', ['x'.repeat(100), 'x'.repeat(101)]],
];

const DOMAIN_VALUES: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['lower_word', ['abc', 'Abc', '', 'abc1']],
  ['short_word', ['abcdefgh', 'abcdefghi', 'Ab']],
  ['percentage', ['0', '100', '100.01', '-0.01', '50.5']],
  ['ci_word', ['a', 'b', 'A', 'c']],
];

/** Whether PostgreSQL accepts the statement; a CHECK violation is a rejection, any other error a test failure. */
async function accepts(
  session: SqlSession,
  sql: string,
  value: string | null,
): Promise<boolean> {
  try {
    await session.query(sql, [value]);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      Reflect.get(error, 'code') === CHECK_VIOLATION
    ) {
      return false;
    }
    throw error;
  }
}

/** A domain's rules with those of the domains it rests on. */
function domainChain(catalog: Catalog, name: string): ReadonlyArray<Rule> {
  const domain = catalog.domains[name];
  if (domain === undefined) {
    return [];
  }
  const own = Object.values(domain.constraints).flatMap((constraint) =>
    constraint.rule === null ? [] : [constraint.rule],
  );
  return domain.typeKind === 'domain'
    ? [...domainChain(catalog, domain.type), ...own]
    : own;
}

function columnRule(catalog: Catalog, constraint: string): Rule {
  const found = catalog.tables['rules']?.constraints[constraint];
  if (found?.kind !== 'check' || found.rule === null) {
    throw new Error(`${constraint} has no rule`);
  }
  return found.rule;
}

/** Every value's verdict from the rule and from the database, side by side. */
async function verdicts(
  session: SqlSession,
  catalog: Catalog,
): Promise<ReadonlyArray<readonly [string, boolean, boolean]>> {
  const rows: Array<readonly [string, boolean, boolean]> = [];
  for (const [column, constraint, values] of COLUMN_VALUES) {
    const rule = columnRule(catalog, constraint);
    for (const value of values) {
      const database = await accepts(
        session,
        `insert into rules (${column}) values ($1)`,
        value,
      );
      rows.push([
        `${column} ${JSON.stringify(value)}`,
        ruleAccepts(rule, value, column === 'ratio'),
        database,
      ]);
    }
  }
  for (const [domain, values] of DOMAIN_VALUES) {
    const rules = domainChain(catalog, domain);
    for (const value of values) {
      const database = await accepts(session, `select $1::${domain}`, value);
      const client = rules.every((rule) => ruleAccepts(rule, value));
      rows.push([`${domain} ${JSON.stringify(value)}`, client, database]);
    }
  }
  return rows;
}

function disagreements(
  rows: ReadonlyArray<readonly [string, boolean, boolean]>,
): ReadonlyArray<string> {
  return rows.flatMap(([value, client, database]) =>
    client === database
      ? []
      : [`${value}: rule ${client}, database ${database}`],
  );
}

describe('rules agree with PostgreSQL 18 on every value (SPEC 2.9)', () => {
  let session: SqlSession;
  let catalog: Catalog;

  beforeAll(async () => {
    session = await replayedPglite(rulesMigrations);
    catalog = await readCatalog(session, SCHEMAS);
  });

  afterAll(async () => {
    await session.close();
  });

  it('gives the database verdict for values at and around every bound', async () => {
    const rows = await verdicts(session, catalog);
    expect(rows.length).toBeGreaterThan(40);
    expect(disagreements(rows)).toEqual([]);
  });

  it('shows why over_ci has no rule: its pattern is an error under its collation', async () => {
    await expect(session.query("select 'a'::over_ci")).rejects.toMatchObject({
      code: '0A000',
    });
  });
});

describe.skipIf(process.env['CATALOG_PG_URL'] === undefined)(
  'rules agree with a PostgreSQL server on every value',
  () => {
    it('gives the database verdict for values at and around every bound', async () => {
      const url = process.env['CATALOG_PG_URL'] ?? '';
      const rows = await useSession(
        await openThrowawayDatabase(url),
        async (database) => {
          await replay(database, rulesMigrations);
          return verdicts(database, await readCatalog(database, SCHEMAS));
        },
      );
      expect(disagreements(rows)).toEqual([]);
    });

    // PGlite's ICU data ignores the strength, so only a server shows this.
    it('shows why the case-insensitive CHECK has no rule: the database accepts A for IN (a)', async () => {
      const url = process.env['CATALOG_PG_URL'] ?? '';
      const accepted = await useSession(
        await openThrowawayDatabase(url),
        async (database) => {
          await replay(database, rulesMigrations);
          return accepts(database, 'insert into rules (ci) values ($1)', 'A');
        },
      );
      expect(accepted).toBe(true);
    });
  },
);
