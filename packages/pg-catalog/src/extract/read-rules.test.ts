import type { Catalog, Rule } from '@nizam-os/catalog-core';

import { beforeAll, describe, expect, it } from 'vitest';

import { replay } from '../replay';
import { openThrowawayDatabase } from '../target/server';
import { useSession } from '../target/session';
import { readReplayed } from '../test-support/replayed';
import {
  excl,
  incl,
  length,
  members,
  pattern,
  range,
} from '../test-support/rules';
import {
  rules18Migrations,
  rulesMigrations,
} from '../test-support/rules-schema';
import { readCatalog } from './read-catalog';

const SCHEMAS = ['public'];

const TABLE_RULES: Readonly<Record<string, Rule | null>> = {
  ci_member: null,
  code_member: members('a', 'b'),
  feeling_member: members('happy'),
  low_below_high: null,
  name_length: length(1, 200),
  nickname_lower: null,
  note_length: length(null, 100),
  price_range: range(incl('0'), null),
  qty_range: range(excl('0'), null),
  ratio_range: range(incl('0'), incl('1')),
  slug_pattern: pattern('^[a-z0-9-]+$'),
  website_pattern: pattern('^https://'),
  word_length: length(2, null),
};

// ci_word compares under text's collation, not its own; over_ci under
// ci_text's nondeterministic one, where a pattern is an error.
const DOMAIN_RULES: Readonly<Record<string, Record<string, Rule | null>>> = {
  ci_text: {},
  ci_word: {
    ci_word_member: members('a', 'b'),
    ci_word_pattern: pattern('^[ab]$'),
  },
  lower_word: { lower_word_check: pattern('^[a-z]+$') },
  over_ci: { over_ci_check: null },
  percentage: { percentage_check: range(incl('0'), incl('100')) },
  short_word: { short_word_check: length(null, 8) },
};

function tableRules(catalog: Catalog): Record<string, Rule | null> {
  const table = catalog.tables['rules'];
  return Object.fromEntries(
    Object.entries(table?.constraints ?? {}).flatMap(([name, constraint]) =>
      constraint.kind === 'check' ? [[name, constraint.rule]] : [],
    ),
  );
}

function domainRules(
  catalog: Catalog,
): Record<string, Record<string, Rule | null>> {
  return Object.fromEntries(
    Object.entries(catalog.domains).map(([name, domain]) => [
      name,
      Object.fromEntries(
        Object.entries(domain.constraints).map(([key, constraint]) => [
          key,
          constraint.rule,
        ]),
      ),
    ]),
  );
}

describe('readCatalog: rules from CHECK constraints (SPEC 8)', () => {
  let catalog: Catalog;

  beforeAll(async () => {
    catalog = await readReplayed(rules18Migrations, SCHEMAS);
  });

  it('reads a rule from every single-column CHECK it recognizes, and null from the rest', () => {
    expect(tableRules(catalog)).toEqual({ ...TABLE_RULES, qty_cap: null });
  });

  it('keeps the rule of a NOT VALID CHECK, which still checks new rows', () => {
    expect(catalog.tables['rules']?.constraints['note_length']).toMatchObject({
      validated: false,
      enforced: true,
      rule: length(null, 100),
    });
  });

  it('reads no rule from a NOT ENFORCED CHECK (PostgreSQL 18)', () => {
    expect(catalog.tables['rules']?.constraints['qty_cap']).toMatchObject({
      enforced: false,
      rule: null,
    });
  });

  it('reads domain rules under the collation of the type each domain is declared over', () => {
    expect(domainRules(catalog)).toEqual(DOMAIN_RULES);
  });
});

describe.skipIf(process.env['CATALOG_PG_URL'] === undefined)(
  'readCatalog: rules on a PostgreSQL server',
  () => {
    it('reads the same rules as PGlite', async () => {
      const url = process.env['CATALOG_PG_URL'] ?? '';
      const server = await useSession(
        await openThrowawayDatabase(url),
        async (database) => {
          await replay(database, rulesMigrations);
          return readCatalog(database, SCHEMAS);
        },
      );
      expect(tableRules(server)).toEqual(TABLE_RULES);
      expect(domainRules(server)).toEqual(DOMAIN_RULES);
    });
  },
);
