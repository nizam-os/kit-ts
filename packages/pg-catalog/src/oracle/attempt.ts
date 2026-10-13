/**
 * Writes a case's fixtures into its probe (SPEC 10.3) and gives the
 * database's verdict on each, in order, from one call of the attempt
 * function. Each text goes in as the drivers would send it as a parameter:
 * node-postgres and PGlite both encode it as UTF-8, writing U+FFFD for a
 * lone surrogate, and PostgreSQL refuses a text holding U+0000 with 22021
 * before any type reads it, so such a fixture gets that verdict without a
 * round trip: the fixtures travel as JSON, which cannot carry U+0000 into
 * a text either.
 * @ref https://www.postgresql.org/docs/18/multibyte.html
 * @ref https://encoding.spec.whatwg.org/#utf-8-encode
 * @packageDocumentation
 */
import type {
  OracleVerdict,
  WritableFixture,
} from '@nizam-os/resource-core/testing';

import type { SqlSession } from '../target/session';

import { ATTEMPT_FUNCTION, ATTEMPT_QUERY } from './probe-sql';

/** PostgreSQL's verdict on a text holding U+0000: `character_not_in_repertoire`. */
const REFUSED_ON_ARRIVAL: OracleVerdict = {
  accepted: false,
  code: '22021',
  constraint: null,
};
const NUL = '\u0000';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The fixture's texts as the server receives them, or `null` when it refuses them on arrival. */
function onTheWire(
  texts: ReadonlyArray<string | null>,
): ReadonlyArray<string | null> | null {
  if (texts.some((text) => text?.includes(NUL) === true)) {
    return null;
  }
  return texts.map((text) =>
    text === null ? null : decoder.decode(encoder.encode(text)),
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isStored(value: unknown): value is ReadonlyArray<string | null> {
  return (
    Array.isArray(value) &&
    value.every((item) => item === null || typeof item === 'string')
  );
}

/** A verdict the attempt function wrote; anything else is a defect of the function. */
function verdictOf(value: unknown): OracleVerdict {
  if (isRecord(value)) {
    const { accepted, stored, code, constraint } = value;
    if (accepted === true && isStored(stored)) {
      return { accepted, stored };
    }
    if (
      accepted === false &&
      typeof code === 'string' &&
      (constraint === null || typeof constraint === 'string')
    ) {
      return { accepted, code, constraint };
    }
  }
  throw new TypeError('the attempt function returned a malformed verdict');
}

/** Creates the attempt function in the session's `pg_temp`. */
export async function installAttempt(session: SqlSession): Promise<void> {
  await session.exec(ATTEMPT_FUNCTION);
}

/** A fixture and the database's verdict on it. */
export interface Attempt {
  readonly fixture: WritableFixture;
  readonly verdict: OracleVerdict;
}

/** The verdicts on `sent`, from one call; checked here, where they cross from the database. */
async function verdictsOn(
  session: SqlSession,
  template: string,
  sent: ReadonlyArray<ReadonlyArray<string | null>>,
): Promise<ReadonlyArray<OracleVerdict>> {
  if (sent.length === 0) {
    return [];
  }
  const [row] = await session.query<{ verdicts: string }>(ATTEMPT_QUERY, [
    template,
    JSON.stringify(sent),
  ]);
  const parsed: unknown = JSON.parse(row?.verdicts ?? '[]');
  if (!Array.isArray(parsed) || parsed.length !== sent.length) {
    throw new TypeError(
      'the attempt function returned other than one verdict per fixture',
    );
  }
  return parsed.map((value: unknown) => verdictOf(value));
}

/** Writes each fixture into the probe through `template`, and gives the verdicts in the fixtures' order. */
export async function attempt(
  session: SqlSession,
  template: string,
  fixtures: ReadonlyArray<WritableFixture>,
): Promise<ReadonlyArray<Attempt>> {
  const wire = fixtures.map((fixture) => onTheWire(fixture.texts));
  const verdicts = await verdictsOn(
    session,
    template,
    wire.filter((texts) => texts !== null),
  );
  const attempts: Array<Attempt> = [];
  let next = 0;
  for (const [index, fixture] of fixtures.entries()) {
    if (wire[index] === null) {
      attempts.push({ fixture, verdict: REFUSED_ON_ARRIVAL });
      continue;
    }
    const verdict = verdicts[next];
    next += 1;
    if (verdict === undefined) {
      throw new TypeError('the attempt function lost a verdict');
    }
    attempts.push({ fixture, verdict });
  }
  return attempts;
}
