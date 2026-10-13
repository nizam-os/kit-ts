/**
 * The storage contract (resource SPEC 12.9), through the built package:
 * every case of `storageContract` passes against the reference adapter,
 * plain SQL over PGlite and over the server `RESOURCE_PG_URL` names, so
 * the obligations of SPEC 12.8 are implementable as written.
 */
import type { ContractHarness } from '@nizam-os/resource-core/testing';

import type { ContractDatabase } from './support/contract-database.ts';
import type { ReferenceTransaction } from './support/reference-sql.ts';

import { afterAll, beforeAll, describe, it } from 'vitest';

import {
  contractFixture,
  storageContract,
} from '@nizam-os/resource-core/testing';

import {
  contractDatabases,
  OUTBOX,
  POINT_TEXT,
} from './support/contract-database.ts';
import { DEFINE_KEYSET } from './support/keyset-definer.ts';
import { referenceAdapter } from './support/reference-adapter.ts';

describe.each(contractDatabases())(
  'the storage contract on %s',
  (_name, open) => {
    let database: ContractDatabase | undefined;
    const current = (): ContractDatabase => {
      if (database === undefined) {
        throw new Error('the database is not open');
      }
      return database;
    };
    const harness: ContractHarness<ReferenceTransaction> = {
      adapter: referenceAdapter({
        catalog: contractFixture.catalog,
        codecs: { point: POINT_TEXT },
        outbox: OUTBOX,
        defineKeyset: DEFINE_KEYSET,
        transact: async (run) => current().transact(run),
      }),
      reset: async () => current().reset(),
      events: async () => current().events(),
    };

    beforeAll(async () => {
      database = await open();
    });
    afterAll(async () => {
      await database?.close();
    });

    for (const contractCase of storageContract(harness)) {
      it(contractCase.name, contractCase.run);
    }
  },
);
