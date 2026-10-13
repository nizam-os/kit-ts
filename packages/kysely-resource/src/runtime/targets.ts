/**
 * The rows a create's or an update's relationships name, looked up in the
 * operation's transaction before the write (SPEC 12.3). PostgreSQL checks
 * a foreign key without row security, and the adapter's scope predicate
 * covers only the statement's own table, so neither stops a write from
 * naming another scope's row, while a missing row fails the foreign key:
 * the difference would tell the actor which ids another tenant holds. A
 * target the actor cannot see answers as a missing one does, with the
 * relationship's `foreignKey` code; the foreign key still refuses a target
 * removed between the lookup and the write.
 * @ref https://www.postgresql.org/docs/18/ddl-rowsecurity.html ("Referential integrity checks ... always bypass row security")
 * @packageDocumentation
 */
import type { DeclaredResource } from '@nizam-os/resource-core';
import type { StorageWrite } from '@nizam-os/resource-core/server';

import type { StorageConfig } from '../storage/options';
import type { KyselyTransaction } from '../storage/transaction';

import { relationshipTargets } from '@nizam-os/resource-core/server';

import { rowExists } from '../storage/rows';

/** Resolves once every target `write` names exists in the transaction's scope; rejects with the first one's error otherwise. */
export async function checkTargets(
  config: StorageConfig,
  tx: KyselyTransaction,
  resource: DeclaredResource,
  write: StorageWrite,
): Promise<void> {
  for (const target of relationshipTargets(resource, write)) {
    if (!(await rowExists(config, tx, target.resource, target.id))) {
      throw target.error;
    }
  }
}
