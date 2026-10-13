/**
 * `pg-catalog rules --check` (catalog SPEC 11.2) run as a package manager
 * runs the built bin, in the oracle's database directory: the
 * configuration imports the declarations lazily, and the report says the
 * declarations agree with PGlite on every fixture.
 */
import { describe, expect, it } from 'vitest';

import { ORACLE_DIR } from './support/paths';
import { binPath, runBin } from './support/run-bin';

describe('pg-catalog rules --check', () => {
  it("prints the oracle's report and exits 0 when the declarations agree with the database", async () => {
    const run = await runBin(
      await binPath('@nizam-os/pg-catalog', 'pg-catalog'),
      ['rules', '--check'],
      ORACLE_DIR,
    );
    expect(run.stderr).toBe('');
    expect(run.stdout).toMatch(
      /^\d+ cases, \d+ fixtures: no disagreements\n$/u,
    );
    expect(run.code).toBe(0);
  });
});
