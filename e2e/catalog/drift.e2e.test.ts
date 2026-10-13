/**
 * Drift on the contacts application (SPEC 10.2, 13.1): a live database the
 * migrations built matches the committed catalog, which PGlite extracted,
 * so a PostgreSQL 14 or 18 production database shows no false drift. After
 * a hotfix outside the migrations adds a column, drops a policy, and
 * loosens a CHECK, drift reports exactly those three objects. On the
 * server, drift also runs as the read-only role the README recommends.
 * Runs on PGlite behind a socket server, and on the server
 * `CATALOG_PG_URL` names.
 */
import type { ExtractionConfig } from '@nizam-os/pg-catalog';

import type { LiveDatabase } from './support/live-database';

import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { drift, formatDiff } from '@nizam-os/pg-catalog';

import {
  contactsConfig,
  EXPECTED_CATALOG,
  HOTFIX,
  HOTFIX_REPORT,
} from './support/contacts';
import {
  liveDatabases,
  onServer,
  openServerDatabase,
} from './support/live-database';

const SERVER = process.env['CATALOG_PG_URL'];
const SECRET_BYTES = 12;

/** The contacts configuration with the committed catalog and one drift environment. */
function driftConfig(url: () => string): ExtractionConfig {
  return {
    ...contactsConfig,
    out: { ...contactsConfig.out, catalog: EXPECTED_CATALOG },
    drift: { production: { url } },
  };
}

for (const [name, open] of liveDatabases()) {
  describe(`drift on ${name}`, () => {
    let live: LiveDatabase;

    beforeAll(async () => {
      live = await open();
    });

    afterAll(async () => {
      await live.close();
    });

    it('finds no drift in a database the migrations built', async () => {
      const report = await drift(
        driftConfig(() => live.url),
        'production',
      );
      expect(report).toEqual({
        environment: 'production',
        diff: { changes: [] },
      });
      expect(formatDiff(report.diff)).toBe('No differences');
    });

    it('reports exactly the column, policy, and CHECK a hotfix changed', async () => {
      await live.pool.query(HOTFIX);
      const report = await drift(
        driftConfig(() => live.url),
        'production',
      );
      expect(formatDiff(report.diff)).toBe(HOTFIX_REPORT);
    });
  });
}

describe.skipIf(SERVER === undefined)(
  'drift as the read-only role the README recommends',
  () => {
    const role = `catalog_drift_${randomBytes(SECRET_BYTES).toString('hex')}`;
    const password = randomBytes(SECRET_BYTES).toString('hex');
    let live: LiveDatabase;

    beforeAll(async () => {
      live = await openServerDatabase(SERVER ?? '');
      await live.pool.query(`create role ${role} login password '${password}';
grant connect on database ${live.name} to ${role};
grant usage on schema public, audit to ${role};`);
    });

    afterAll(async () => {
      await live.close();
      await onServer(SERVER ?? '', `drop role if exists ${role}`);
    });

    it('reads the whole catalog with CONNECT and USAGE alone', async () => {
      const url = new URL(live.url);
      url.username = role;
      url.password = password;
      const report = await drift(
        driftConfig(() => url.toString()),
        'production',
      );
      expect(report.diff.changes).toEqual([]);
    });
  },
);
