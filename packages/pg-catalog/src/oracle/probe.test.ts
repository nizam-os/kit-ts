/**
 * The probes (SPEC 10.3) on PGlite: a copy of a table's columns with each
 * column's type, collation, and NOT NULL and the CHECKs a case names, in
 * any configured schema and under any identifier; a column of a domain;
 * and the problems of a case whose objects the replayed database does not
 * hold.
 */
import type { Catalog } from '@nizam-os/catalog-core';
import type {
  OracleProbe,
  OracleVerdict,
} from '@nizam-os/resource-core/testing';

import type { SqlSession } from '../target/session';
import type { BuiltProbe } from './probe';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readCatalog } from '../extract/read-catalog';
import { openPglite } from '../target/pglite';
import { attempt, installAttempt } from './attempt';
import { buildProbe, dropProbe } from './probe';

const SCHEMA = `create schema crm;
create function public.is_code(text) returns boolean language sql immutable
  as $$ select $1 ~ '^[a-z]+$' $$;
create domain public.slug as text not null
  constraint slug_check check (value ~ '^[a-z-]+$');
create table public.items (
  id integer primary key,
  code text collate "POSIX" not null constraint items_code_check check (public.is_code(code)),
  low integer,
  high integer,
  constraint items_order check (low < high)
);
create table crm."odd ""name""" ("50%" text constraint odd_check check ("50%" <> 'x'));`;

const PROBED_COLUMNS = `select a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
  a.attnotnull as "notNull", co.collname as collation
from pg_attribute a left join pg_collation co on co.oid = a.attcollation
where a.attrelid = 'pg_temp.nizam_probe'::regclass and a.attnum > 0
order by a.attnum`;

/** CHECKs only: PostgreSQL 18 also records each NOT NULL in pg_constraint. */
const PROBED_CHECKS = `select conname as name from pg_constraint
where conrelid = 'pg_temp.nizam_probe'::regclass and contype = 'c' order by conname`;

/** A judge that reports each refusal; these tests read the verdicts themselves. */
function refusalOf(verdict: OracleVerdict): string | undefined {
  return verdict.accepted ? undefined : verdict.code;
}

let session: SqlSession;
let catalog: Catalog;

beforeAll(async () => {
  session = await openPglite();
  await session.exec(SCHEMA);
  catalog = await readCatalog(session, ['public', 'crm']);
  await installAttempt(session);
});

afterAll(async () => {
  await session.close();
});

function columns(
  table: string,
  names: ReadonlyArray<string>,
  checks: ReadonlyArray<string> = [],
  notNull = true,
): OracleProbe {
  return { kind: 'columns', table, columns: names, checks, notNull };
}

/** Builds `probe`, runs `work` on it, and drops it. */
async function withProbe<TResult>(
  probe: OracleProbe,
  work: (built: BuiltProbe) => Promise<TResult>,
): Promise<TResult> {
  const built = await buildProbe(session, catalog, probe);
  try {
    return await work(built);
  } finally {
    await dropProbe(session);
  }
}

async function verdicts(
  built: BuiltProbe,
  ...fixtures: ReadonlyArray<ReadonlyArray<string | null>>
): Promise<ReadonlyArray<unknown>> {
  if (!built.built) {
    throw new Error(built.problem);
  }
  const attempts = await attempt(
    session,
    built.template,
    fixtures.map((texts) => ({
      label: '',
      value: null,
      texts,
      judge: refusalOf,
    })),
  );
  return attempts.map(({ verdict }) => verdict);
}

describe('buildProbe (SPEC 10.3)', () => {
  it("copies each column's type, collation, and NOT NULL, in the case's order", async () => {
    const copied = await withProbe(
      columns('items', ['high', 'code'], ['items_code_check']),
      async () => session.query(PROBED_COLUMNS),
    );
    expect(copied).toEqual([
      { name: 'high', type: 'integer', notNull: false, collation: null },
      { name: 'code', type: 'text', notNull: true, collation: 'POSIX' },
    ]);
  });

  it("leaves out the columns' NOT NULL when the case does not keep it, so only the CHECKs decide", async () => {
    const outcome = await withProbe(
      columns('items', ['code', 'low', 'high'], ['items_order'], false),
      async (built) => ({
        columns: await session.query(PROBED_COLUMNS),
        verdicts: await verdicts(built, [null, '1', '2'], [null, '2', '1']),
      }),
    );
    expect(outcome).toEqual({
      columns: [
        { name: 'code', type: 'text', notNull: false, collation: 'POSIX' },
        { name: 'low', type: 'integer', notNull: false, collation: null },
        { name: 'high', type: 'integer', notNull: false, collation: null },
      ],
      verdicts: [
        { accepted: true, stored: [null, '1', '2'] },
        { accepted: false, code: '23514', constraint: 'items_order' },
      ],
    });
  });

  it('holds only the CHECKs the case names, which PostgreSQL itself judges', async () => {
    const outcome = await withProbe(
      columns('items', ['code', 'low', 'high'], ['items_order']),
      async (built) => ({
        checks: await session.query(PROBED_CHECKS),
        verdicts: await verdicts(
          built,
          ['UPPER', '2', '1'],
          ['UPPER', '1', '2'],
          [null, '1', '2'],
        ),
      }),
    );
    expect(outcome).toEqual({
      checks: [{ name: 'items_order' }],
      verdicts: [
        { accepted: false, code: '23514', constraint: 'items_order' },
        { accepted: true, stored: ['UPPER', '1', '2'] },
        { accepted: false, code: '23502', constraint: null },
      ],
    });
  });

  it("calls the application's functions a CHECK names", async () => {
    const outcome = await withProbe(
      columns('items', ['code'], ['items_code_check']),
      async (built) => verdicts(built, ['abc'], ['ab1']),
    );
    expect(outcome).toEqual([
      { accepted: true, stored: ['abc'] },
      { accepted: false, code: '23514', constraint: 'items_code_check' },
    ]);
  });

  it('copies a table of another schema whose names need quoting, a % included', async () => {
    const outcome = await withProbe(
      columns('crm.odd "name"', ['50%'], ['odd_check']),
      async (built) => verdicts(built, ['y'], ['x']),
    );
    expect(outcome).toEqual([
      { accepted: true, stored: ['y'] },
      { accepted: false, code: '23514', constraint: 'odd_check' },
    ]);
  });

  it("writes a value of a domain, which brings the domain's CHECKs and NOT NULL", async () => {
    const outcome = await withProbe(
      { kind: 'domain', domain: 'slug' },
      async (built) => verdicts(built, ['a-b'], ['A'], [null]),
    );
    expect(outcome).toEqual([
      { accepted: true, stored: ['a-b'] },
      { accepted: false, code: '23514', constraint: 'slug_check' },
      { accepted: false, code: '23502', constraint: null },
    ]);
  });

  const problems: ReadonlyArray<readonly [string, OracleProbe, string]> = [
    [
      'a table',
      columns('people', ['name']),
      'the replayed database has no table people',
    ],
    [
      'a column',
      columns('items', ['label']),
      'the replayed database has no column items.label',
    ],
    [
      'a CHECK',
      columns('items', ['code'], ['items_code_lower']),
      'the replayed database has no CHECK items_code_lower on items',
    ],
    [
      'a domain',
      { kind: 'domain', domain: 'email' },
      'the replayed database has no domain email',
    ],
  ];

  it.each(problems)(
    'reports %s the replayed database does not hold',
    async (_name, probe, problem) => {
      expect(await buildProbe(session, catalog, probe)).toEqual({
        built: false,
        problem,
      });
    },
  );

  it('reports a probe PostgreSQL cannot build: a CHECK over a column the case leaves out', async () => {
    const built = await buildProbe(
      session,
      catalog,
      columns('items', ['low'], ['items_order']),
    );
    await dropProbe(session);
    expect(built).toEqual({
      built: false,
      problem:
        'the probe could not be built: column "high" does not exist (SQLSTATE 42703)',
    });
  });
});
