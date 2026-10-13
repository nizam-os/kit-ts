/**
 * The rules of the contacts application as a client enforces them: each
 * value goes through the public catalog's rule and through the database,
 * which evaluates the CHECK expression the catalog records, and the two
 * verdicts must agree. The committed modules are the ones the extract
 * suite proves byte-identical to what extraction writes.
 */
import type { Catalog, PublicCatalog, Rule } from '@nizam-os/catalog-core';

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';

import { catalog } from './fixtures/contacts/expected/catalog.ts';
import { publicCatalog } from './fixtures/contacts/expected/public-catalog.ts';
import { MIGRATIONS_DIR } from './support/contacts';
import { ruleAccepts } from './support/rules';

// The literal modules, read through the model types to index them by name.
const typedCatalog: Catalog = catalog;
const typedPublic: PublicCatalog = publicCatalog;

const CHECK_VIOLATION = '23514';
const VERSIONED = /^V(\d+)__/u;

/** Values at and around each bound, keyed by table and CHECK constraint. */
const CHECK_VALUES: ReadonlyArray<
  readonly [string, string, ReadonlyArray<string | null>]
> = [
  [
    'contacts',
    'contacts_name_check',
    [
      '',
      'a',
      'x'.repeat(200),
      'x'.repeat(201),
      '𝒳'.repeat(200),
      '𝒳'.repeat(201),
    ],
  ],
  ['contacts', 'contacts_nickname_check', ['', 'n', null]],
  ['contacts', 'contacts_priority_check', ['0', '1', '5', '6']],
  [
    'contacts',
    'contacts_status_check',
    ['active', 'archived', 'deleted', 'Active'],
  ],
  [
    'contacts',
    'contacts_website_check',
    ['https://acme.test', 'http://acme.test', null],
  ],
  [
    'contact_phones',
    'contact_phones_number_check',
    ['+1 234', '1234', '12a', '+'],
  ],
  ['contact_phones', 'contact_phones_position_check', ['-1', '0', '7']],
  ['organizations', 'organizations_seats_check', ['0', '1']],
  ['organizations', 'organizations_slug_check', ['acme-1', 'Acme', 'a_b', '-']],
];

/** Values for the domains the public tables use; none exceeds a length modifier, which a cast would truncate. */
const DOMAIN_VALUES: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['percentage', ['0', '100', '100.01', '-0.01', '12.5']],
  ['country_code', ['DE', 'de', 'D', 'DEU']],
  ['short_text', ['', 'a', 'x'.repeat(120)]],
];

interface RecordedCheck {
  readonly rule: Rule;
  readonly expression: string;
  readonly column: string;
  readonly sqlType: string;
}

function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** A versioned migration's number; repeatable migrations sort after every version. */
function version(file: string): number {
  return Number(VERSIONED.exec(file)?.[1] ?? Number.POSITIVE_INFINITY);
}

/** Versioned migrations in version order, then repeatable ones by name. */
async function migrations(): Promise<ReadonlyArray<string>> {
  const files = await readdir(MIGRATIONS_DIR);
  const ordered = files.toSorted((left, right) => {
    const order = version(left) - version(right);
    return order === 0 ? left.localeCompare(right) : order;
  });
  return Promise.all(
    ordered.map(async (file) => readFile(join(MIGRATIONS_DIR, file), 'utf8')),
  );
}

/** A single-column CHECK: its rule from the public catalog, its expression and column type from the full one. */
function recordedCheck(table: string, name: string): RecordedCheck {
  const constraint = typedCatalog.tables[table]?.constraints[name];
  const shown = typedPublic.tables[table]?.constraints[name];
  if (
    constraint?.kind !== 'check' ||
    shown?.kind !== 'check' ||
    shown.rule === null
  ) {
    throw new Error(`${table}.${name} is not a CHECK with a rule`);
  }
  const [column = ''] = constraint.columns;
  const sqlType = typedCatalog.tables[table]?.columns[column]?.sqlType ?? '';
  return {
    rule: shown.rule,
    expression: constraint.expression,
    column,
    sqlType,
  };
}

/** Whether the domain accepts the value; a CHECK violation is a rejection, any other error a failure. */
async function domainAccepts(
  db: PGlite,
  domain: string,
  value: string,
): Promise<boolean> {
  try {
    await db.query(`select $1::${domain}`, [value]);
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

describe('the contacts rules as a client enforces them', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { btree_gist, citext, pg_trgm } });
    for (const sql of await migrations()) {
      await db.exec(sql);
    }
  });

  afterAll(async () => {
    await db.close();
  });

  it('are literal types a declaration library can build validators from', () => {
    expectTypeOf(
      publicCatalog.tables.contacts.constraints.contacts_status_check.rule,
    ).toEqualTypeOf<{
      readonly kind: 'enum';
      readonly values: readonly ['active', 'archived'];
    }>();
    expectTypeOf(
      publicCatalog.domains.percentage.constraints.percentage_check.rule.kind,
    ).toEqualTypeOf<'range'>();
  });

  it('agree with every CHECK the catalog recorded, value by value', async () => {
    const disagreements: Array<string> = [];
    for (const [table, name, values] of CHECK_VALUES) {
      const { rule, expression, column, sqlType } = recordedCheck(table, name);
      for (const value of values) {
        const result = await db.query<{ ok: boolean }>(
          `select (${expression}) is not false as ok from (select $1::${sqlType} as ${quoted(column)}) as input`,
          [value],
        );
        const database = result.rows[0]?.ok === true;
        if (database !== ruleAccepts(rule, value)) {
          disagreements.push(
            `${name} ${JSON.stringify(value)}: database ${String(database)}`,
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('agree with every domain CHECK the public tables rely on', async () => {
    const disagreements: Array<string> = [];
    for (const [domain, values] of DOMAIN_VALUES) {
      const rules = Object.values(
        typedPublic.domains[domain]?.constraints ?? {},
      ).map((constraint) => constraint.rule);
      for (const value of values) {
        const database = await domainAccepts(db, domain, value);
        const client = rules.every(
          (rule) => rule === null || ruleAccepts(rule, value),
        );
        if (database !== client) {
          disagreements.push(
            `${domain} ${JSON.stringify(value)}: database ${String(database)}`,
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});
