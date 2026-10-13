/**
 * runCases (SPEC 10.3) on PGlite, over cases built by hand: each verdict
 * reaches its fixture's judge, disagreements keep the fixtures' order, a
 * fixture its storage codec cannot write is reported as it stands, a case
 * whose probe cannot be built reports its problem, and each case gets a
 * fresh probe.
 */
import type { Catalog } from '@nizam-os/catalog-core';
import type { OracleCase, OracleVerdict } from '@nizam-os/resource-core/testing';

import type { SqlSession } from '../target/session';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readCatalog } from '../extract/read-catalog';
import { openPglite } from '../target/pglite';
import { runCases } from './run-cases';

let session: SqlSession;
let catalog: Catalog;

beforeAll(async () => {
  session = await openPglite();
  await session.exec(
    "create table items (code text constraint items_code_check check (code <> 'x'), size integer);",
  );
  catalog = await readCatalog(session, ['public']);
});

afterAll(async () => {
  await session.close();
});

const seen: Array<OracleVerdict> = [];

function judged(label: string, text: string): OracleCase['fixtures'][number] {
  return {
    label,
    value: text,
    texts: [text],
    judge: (verdict) => {
      seen.push(verdict);
      return verdict.accepted ? undefined : `refused ${label}`;
    },
  };
}

const CODE: OracleCase = {
  subject: 'items.code',
  kind: 'field',
  probe: {
    kind: 'columns',
    table: 'items',
    columns: ['code'],
    checks: ['items_code_check'],
    notNull: true,
  },
  fixtures: [
    judged('first', 'x'),
    {
      label: 'second',
      value: 2,
      unwritable: 'the storage codec cannot write it: no',
    },
    judged('third', 'y'),
    judged('fourth', 'x'),
  ],
};

describe('runCases (SPEC 10.3)', () => {
  it("hands each verdict to its fixture's judge and keeps the fixtures' order", async () => {
    seen.length = 0;
    const [report] = await runCases(session, catalog, [CODE]);
    expect(report).toEqual({
      subject: 'items.code',
      kind: 'field',
      fixtures: 4,
      problem: null,
      disagreements: [
        { label: 'first', value: 'x', reason: 'refused first' },
        {
          label: 'second',
          value: 2,
          reason: 'the storage codec cannot write it: no',
        },
        { label: 'fourth', value: 'x', reason: 'refused fourth' },
      ],
    });
    expect(seen).toEqual([
      { accepted: false, code: '23514', constraint: 'items_code_check' },
      { accepted: true, stored: ['y'] },
      { accepted: false, code: '23514', constraint: 'items_code_check' },
    ]);
  });

  it('reports the problem of a case it cannot run, and runs the cases after it on fresh probes', async () => {
    const reports = await runCases(session, catalog, [
      {
        ...CODE,
        subject: 'items.label',
        probe: {
          kind: 'columns',
          table: 'items',
          columns: ['label'],
          checks: [],
          notNull: true,
        },
      },
      {
        ...CODE,
        subject: 'items.size',
        probe: {
          kind: 'columns',
          table: 'items',
          columns: ['size'],
          checks: [],
          notNull: true,
        },
        fixtures: [judged('size', '1')],
      },
      CODE,
    ]);
    expect(
      reports.map(({ subject, problem, disagreements }) => [
        subject,
        problem,
        disagreements.length,
      ]),
    ).toEqual([
      ['items.label', 'the replayed database has no column items.label', 0],
      ['items.size', null, 0],
      ['items.code', null, 3],
    ]);
  });
});
