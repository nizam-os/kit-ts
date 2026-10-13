/**
 * The storage contract (resource SPEC 12.9) over the built
 * `@nizam-os/kysely-resource`'s `createKyselyStorage`, on PGlite and on the
 * server `RESOURCE_PG_URL` names, where its concurrent cases hold a row
 * lock or a quota's lock in one transaction while a second, on another
 * connection, tries to write past it (SPEC 18.7).
 */
import type { KyselyTransaction } from '@nizam-os/kysely-resource';
import type { ContractHarness } from '@nizam-os/resource-core/testing';

import { sql } from 'kysely';
import { afterAll, describe, it } from 'vitest';

import { createKyselyStorage } from '@nizam-os/kysely-resource';
import {
  contractFixture,
  storageContract,
} from '@nizam-os/resource-core/testing';

import {
  EVENTS,
  eventOf,
  OUTBOX,
  POINT_TEXT,
  RESET,
} from './support/contract-database.ts';
import { DEFINE_KEYSET } from './support/keyset-definer.ts';
import { kyselyDatabases } from './support/kysely-database.ts';

describe.each(kyselyDatabases())(
  'the storage contract over createKyselyStorage on %s',
  (_name, open) => {
    const database = open();
    const storage = createKyselyStorage({
      db: database.db,
      catalog: contractFixture.catalog,
      codecs: { point: POINT_TEXT },
      defineKeyset: DEFINE_KEYSET,
      outbox: { table: OUTBOX },
    });
    const harness: ContractHarness<KyselyTransaction> = {
      adapter: storage,
      reset: async () => {
        await database.exec(RESET);
      },
      events: async () =>
        (
          await sql
            .raw<Readonly<Record<string, unknown>>>(EVENTS)
            .execute(database.db)
        ).rows.map((row) => eventOf(row)),
    };

    afterAll(async () => {
      await database.close();
    });

    for (const contractCase of storageContract(harness)) {
      it(contractCase.name, contractCase.run);
    }
  },
);
