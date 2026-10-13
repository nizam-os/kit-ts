/**
 * `createKyselyStorage(options)` (SPEC 18.2): the storage adapter of
 * resource SPEC 12.8 over Kysely. Creating it checks the options and runs
 * no query; every statement runs on `db.withoutPlugins()`, so a plugin of
 * the application's, such as `CamelCasePlugin`, never renames the
 * adapter's identifiers or result keys.
 * @ref https://kysely-org.github.io/kysely-apidoc/classes/Kysely.html#withoutplugins
 * @packageDocumentation
 */
import type { Keyset } from '@nizam-os/keyset-core';
import type { DeclaredResource } from '@nizam-os/resource-core';

import type { KyselyStorage, KyselyStorageOptions } from './types';

import { listRows } from './list';
import { manyRows } from './many';
import { storageConfig } from './options';
import { recordEvents } from './outbox';
import { partitionRoot } from './partition';
import { countRows } from './quota';
import { registerStorage } from './registry';
import { deleteRow, insertRow, selectRow, updateRow } from './rows';
import { KyselyTransaction } from './transaction';

/** The storage adapter over `options.db`; throws `TypeError` for an option it cannot use. */
export function createKyselyStorage<TDatabase>(
  options: KyselyStorageOptions<TDatabase>,
): KyselyStorage {
  const config = storageConfig(options);
  const keysets = new WeakMap<DeclaredResource, Keyset>();
  const keysetOf = (resource: DeclaredResource): Keyset => {
    const known = keysets.get(resource);
    if (known !== undefined) {
      return known;
    }
    const keyset = config.defineKeyset(resource.keyset);
    keysets.set(resource, keyset);
    return keyset;
  };
  const storage: KyselyStorage = {
    catalog: config.catalog,
    outbox: config.outbox,
    transaction: async (scopes, run) =>
      KyselyTransaction.run(config.db, scopes, run),
    list: async (tx, resource, request, listOptions) =>
      listRows(config, keysetOf(resource), tx, resource, request, listOptions),
    many: async (tx, resource, ids) => manyRows(config, tx, resource, ids),
    get: async (tx, resource, id) => selectRow(config, tx, resource, id),
    lock: async (tx, resource, id, write) =>
      selectRow(config, tx, resource, id, write),
    create: async (tx, resource, input) =>
      insertRow(config, tx, resource, input),
    update: async (tx, resource, id, input) =>
      updateRow(config, tx, resource, id, input),
    remove: async (tx, resource, id) => deleteRow(config, tx, resource, id),
    count: async (tx, resource, quota) =>
      countRows(config, tx, resource, quota),
    record: async (tx, events) => recordEvents(config.outbox, tx, events),
    partitionRoot: async (names) => partitionRoot(config.db, names),
  };
  const frozen = Object.freeze(storage);
  registerStorage(frozen, config);
  return frozen;
}
