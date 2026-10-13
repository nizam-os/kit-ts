/**
 * The storage contract catches what it is about (resource SPEC 12.9): for
 * each defect of `support/contract-faults.ts`, the reference adapter with
 * that defect fails the cases the defect breaks, with the case's own
 * check, or with the database's refusal where the defect writes what
 * PostgreSQL refuses before any check runs, on PGlite and on the
 * server `RESOURCE_PG_URL` names. A defect of concurrency runs on the
 * server only, since PGlite runs one transaction at a time.
 */
import type { ContractDatabase } from './support/contract-database.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { storageContract } from '@nizam-os/resource-core/testing';

import { contractDatabases } from './support/contract-database.ts';
import { FAULTS } from './support/contract-faults.ts';

describe.each(contractDatabases())(
  'on %s, the storage contract fails an adapter that',
  (name, open) => {
    let database: ContractDatabase | undefined;
    beforeAll(async () => {
      database = await open();
    });
    afterAll(async () => {
      await database?.close();
    });

    const faults = FAULTS.filter(
      (fault) => fault.concurrent !== true || name !== 'PGlite',
    );
    it.each(faults)('$name', async (fault) => {
      expect(database).toBeDefined();
      const opened = database as ContractDatabase;
      const cases = storageContract({
        adapter: fault.adapter(opened),
        reset: opened.reset,
        events: opened.events,
      });
      for (const failing of fault.fails) {
        const contractCase = cases.find(
          (candidate) => candidate.name === failing,
        );
        expect(contractCase, failing).toBeDefined();
        await expect(contractCase?.run(), failing).rejects.toMatchObject(
          fault.refused === undefined
            ? { name: 'ContractFailure' }
            : { code: fault.refused },
        );
      }
    });
  },
);
