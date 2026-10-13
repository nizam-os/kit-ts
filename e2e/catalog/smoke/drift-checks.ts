/**
 * Drift checks for runtimes with sockets (Bun and Deno): the contacts
 * application on PGlite behind a socket server, compared with the reviewed
 * catalog through the built `@nizam-os/pg-catalog` and node-postgres.
 */
import type { Checks } from './report.ts';

import { drift } from '@nizam-os/pg-catalog';

import { contactsConfig, EXPECTED_CATALOG } from '../support/contacts.ts';
import { openPgliteDatabase } from '../support/live-database.ts';
import { check } from './report.ts';

export const driftChecks: Checks = {
  'drift finds no differences between a live database and the reviewed catalog':
    async () => {
      const live = await openPgliteDatabase();
      try {
        const report = await drift(
          {
            ...contactsConfig,
            out: { ...contactsConfig.out, catalog: EXPECTED_CATALOG },
            drift: { production: { url: live.url } },
          },
          'production',
        );
        check(
          report.diff.changes.length === 0,
          `${report.diff.changes.length} differences`,
        );
      } finally {
        await live.close();
      }
    },
};
