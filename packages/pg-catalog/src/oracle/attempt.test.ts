/**
 * The attempt function (SPEC 10.3) on PGlite: each fixture written into a
 * probe with assignment semantics and the verdicts given back in order,
 * refusals caught inside the database so PGlite never runs out of stack
 * (pglite#1115), and the texts the drivers would refuse or rewrite on the
 * wire handled as they would be.
 */
import type {
  OracleVerdict,
  WritableFixture,
} from '@nizam-os/resource-core/testing';

import type { SqlSession } from '../target/session';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openPglite } from '../target/pglite';
import { attempt, installAttempt } from './attempt';
import { createProbe, insertTemplate } from './probe-sql';

/** More refusals than one PGlite 0.5.8 instance survives when they reach the client (about 1,800). */
const REFUSALS = 3000;

/** A judge that reports each refusal; these tests read the verdicts themselves. */
function refusalOf(verdict: OracleVerdict): string | undefined {
  return verdict.accepted ? undefined : verdict.code;
}

function fixture(...texts: ReadonlyArray<string | null>): WritableFixture {
  return { label: 'fixture', value: texts, texts, judge: refusalOf };
}

let session: SqlSession;

beforeAll(async () => {
  session = await openPglite();
  await installAttempt(session);
  await session.exec(
    createProbe([
      '"short" character varying(3)',
      '"amount" numeric(5,2)',
      '"count" integer not null',
      'constraint "probe_count_check" check (count > 0)',
    ]),
  );
});

afterAll(async () => {
  await session.close();
});

const template = insertTemplate(['short', 'amount', 'count']);

describe('attempt (SPEC 10.3)', () => {
  it('gives back the stored texts, as each column reads them with assignment semantics', async () => {
    const [verdict] = await attempt(session, template, [
      fixture('ab ', '1.005', '7'),
    ]);
    expect(verdict?.verdict).toEqual({
      accepted: true,
      stored: ['ab ', '1.01', '7'],
    });
  });

  it("gives each refusal's SQLSTATE and the constraint it names, in the fixtures' order", async () => {
    const attempts = await attempt(session, template, [
      fixture('abcd', '1', '1'),
      fixture('a', '1', '0'),
      fixture('a', 'one', '1'),
      fixture('a', '1', null),
      fixture('a', null, '2'),
    ]);
    expect(attempts.map(({ verdict }) => verdict)).toEqual([
      { accepted: false, code: '22001', constraint: null },
      { accepted: false, code: '23514', constraint: 'probe_count_check' },
      { accepted: false, code: '22P02', constraint: null },
      { accepted: false, code: '23502', constraint: null },
      { accepted: true, stored: ['a', null, '2'] },
    ]);
  });

  it('refuses a text holding U+0000 with 22021 without sending it, and still writes the others', async () => {
    const attempts = await attempt(session, template, [
      fixture('a\u0000', '1', '1'),
      fixture('b', '1', '1'),
    ]);
    expect(attempts.map(({ verdict }) => verdict)).toEqual([
      { accepted: false, code: '22021', constraint: null },
      { accepted: true, stored: ['b', '1.00', '1'] },
    ]);
  });

  it('writes a lone surrogate as U+FFFD, as the drivers encode it', async () => {
    const [verdict] = await attempt(session, template, [
      fixture('a\uD800', '1', '1'),
    ]);
    expect(verdict?.verdict).toEqual({
      accepted: true,
      stored: ['a�', '1.00', '1'],
    });
  });

  it('pairs each fixture with its verdict', async () => {
    const first = fixture('a', '1', '1');
    const second = fixture('b', '1', '0');
    const attempts = await attempt(session, template, [first, second]);
    expect(attempts.map(({ fixture: each }) => each)).toEqual([first, second]);
  });

  it('gives no verdicts for a case without writable fixtures', async () => {
    expect(await attempt(session, template, [])).toEqual([]);
  });

  it('catches every refusal inside the database, so one PGlite survives thousands', async () => {
    const refused = Array.from({ length: REFUSALS }, () =>
      fixture('a', '1', '0'),
    );
    const attempts = await attempt(session, template, refused);
    expect(attempts.every(({ verdict }) => !verdict.accepted)).toBe(true);
    const [after] = await attempt(session, template, [fixture('a', '1', '1')]);
    expect(after?.verdict.accepted).toBe(true);
  });
});
