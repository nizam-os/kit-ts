/**
 * The catalogs the declarations read are current (resource SPEC 15.4):
 * `pg-catalog extract --check`, run in each database directory as its CI
 * would, replays the migrations into PGlite and finds the committed
 * catalog.ts and public-catalog.ts unchanged. The contacts application's
 * catalogs type the declarations; the oracle's type the probes (SPEC 15.3);
 * the PostgreSQL 18 schema's type the NOT ENFORCED declarations. The
 * storage contract's catalog, which the testing entry ships next to its
 * migrations (SPEC 12.9), and the catalog of the unit-test fixture of
 * `@nizam-os/resource-ui` (SPEC 20.8) are what extraction gives for
 * theirs.
 */
import { describe, expect, it } from 'vitest';

import {
  COMMITTED_CATALOGS,
  extractCommitted,
} from './support/committed-catalogs.ts';
import { CONTACTS_DIR, ORACLE_DIR, POSTGRES18_DIR } from './support/paths';
import { binPath, runBin } from './support/run-bin';

describe('the extracted catalogs', () => {
  it.each([
    ['contacts', CONTACTS_DIR],
    ['oracle', ORACLE_DIR],
    ['PostgreSQL 18', POSTGRES18_DIR],
  ])('of the %s schema pass extract --check', async (_name, directory) => {
    const run = await runBin(
      await binPath('@nizam-os/pg-catalog', 'pg-catalog'),
      ['extract', '--check'],
      directory,
    );
    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(
      'unchanged catalog.ts\nunchanged public-catalog.ts\n',
    );
    expect(run.code).toBe(0);
  });

  it.each(Object.entries(COMMITTED_CATALOGS))(
    'of the migrations of %s is the committed one',
    async (_name, catalog) => {
      expect(
        await extractCommitted(catalog, true),
        'run `pnpm run write:catalogs` in e2e/resource',
      ).toBe('unchanged');
    },
  );
});
