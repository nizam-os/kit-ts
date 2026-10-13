/**
 * Runs the oracle's cases (SPEC 10.3) in a session holding the replayed
 * database, whose catalog was just read: each case's probe is built, its
 * writable fixtures are attempted in one call, and each verdict goes to
 * the fixture's judge. A fixture its storage codec cannot write is a
 * disagreement as it stands. The probe is dropped after its case.
 * @packageDocumentation
 */
import type { Catalog } from '@nizam-os/catalog-core';
import type {
  OracleCase,
  OracleFixture,
  WritableFixture,
} from '@nizam-os/resource-core/testing';

import type { SqlSession } from '../target/session';
import type { Attempt } from './attempt';
import type { RuleCaseReport, RuleDisagreement } from './report';

import { attempt, installAttempt } from './attempt';
import { buildProbe, dropProbe } from './probe';

function isWritable(fixture: OracleFixture): fixture is WritableFixture {
  return 'texts' in fixture;
}

/** The fixtures' disagreements, in their order. */
function disagreementsOf(
  fixtures: ReadonlyArray<OracleFixture>,
  attempts: ReadonlyArray<Attempt>,
): ReadonlyArray<RuleDisagreement> {
  const reasons = new Map<OracleFixture, string | undefined>(
    attempts.map(({ fixture, verdict }) => [fixture, fixture.judge(verdict)]),
  );
  return fixtures.flatMap((fixture) => {
    const reason = isWritable(fixture)
      ? reasons.get(fixture)
      : fixture.unwritable;
    return reason === undefined
      ? []
      : [{ label: fixture.label, value: fixture.value, reason }];
  });
}

async function runCase(
  session: SqlSession,
  catalog: Catalog,
  oracleCase: OracleCase,
): Promise<RuleCaseReport> {
  const { subject, kind, fixtures } = oracleCase;
  const tried = { subject, kind, fixtures: fixtures.length };
  const probe = await buildProbe(session, catalog, oracleCase.probe);
  if (!probe.built) {
    return { ...tried, problem: probe.problem, disagreements: [] };
  }
  try {
    const attempts = await attempt(
      session,
      probe.template,
      fixtures.filter((fixture) => isWritable(fixture)),
    );
    return {
      ...tried,
      problem: null,
      disagreements: disagreementsOf(fixtures, attempts),
    };
  } finally {
    await dropProbe(session);
  }
}

/** Runs each case in order and reports how it went. */
export async function runCases(
  session: SqlSession,
  catalog: Catalog,
  cases: ReadonlyArray<OracleCase>,
): Promise<ReadonlyArray<RuleCaseReport>> {
  await installAttempt(session);
  const reports: Array<RuleCaseReport> = [];
  for (const oracleCase of cases) {
    reports.push(await runCase(session, catalog, oracleCase));
  }
  return reports;
}
