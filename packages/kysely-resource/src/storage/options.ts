import type { Kysely } from 'kysely';

/**
 * The options of `createKyselyStorage` (SPEC 18.2), checked once when the
 * adapter is created: a value JavaScript lets through that the adapter
 * cannot use throws `TypeError` naming the option, before any query runs,
 * and so does a key that is not an option, such as a misspelled `outbox`.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';
import type { DefineDefaultedKeyset } from '@nizam-os/keyset-core';
import type { AnyDatabase } from '@nizam-os/kysely-keyset';

import type { KyselyStorage, KyselyStorageOptions, TextCodec } from './types';

import { CATALOG_FORMAT } from '@nizam-os/catalog-core';

import {
  checkDb,
  checkKeys,
  outboxName,
  plain,
} from '../internal/kysely-options';
import { isRecord } from '../internal/object';

const CALLER = 'createKyselyStorage';
const OPTIONS: ReadonlySet<string> = new Set([
  'db',
  'catalog',
  'codecs',
  'defineKeyset',
  'outbox',
]);

/** The options as the adapter uses them. */
export interface StorageConfig {
  /** `options.db` without its plugins. */
  readonly db: Kysely<AnyDatabase>;
  readonly catalog: PublicCatalog;
  readonly codecs: Readonly<Record<string, TextCodec>>;
  readonly defineKeyset: DefineDefaultedKeyset;
  readonly outbox: KyselyStorage['outbox'];
}

/** The checks resource-core's definer applies to its catalog, so one object serves both. */
function checkCatalog(value: unknown): void {
  const path = `${CALLER}: options.catalog`;
  if (!isRecord(value)) {
    throw new TypeError(
      `${path} must be the public catalog the declarations are built from`,
    );
  }
  if (Object.hasOwn(value, 'schemas')) {
    throw new TypeError(
      `${path}: a full catalog; pass the public catalog the declarations are built from (toPublicCatalog)`,
    );
  }
  if (value['format'] !== CATALOG_FORMAT) {
    throw new TypeError(
      `${path}: format ${String(value['format'])} is not supported (expected ${String(CATALOG_FORMAT)})`,
    );
  }
  for (const member of ['enums', 'domains', 'tables']) {
    if (!isRecord(value[member])) {
      throw new TypeError(`${path}.${member} must be an object`);
    }
  }
}

function checkCodecs(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    throw new TypeError(
      `${CALLER}: options.codecs must be an object of storage codecs by codec name`,
    );
  }
  for (const [name, codec] of Object.entries(value)) {
    for (const member of ['read', 'write']) {
      if (!isRecord(codec) || typeof codec[member] !== 'function') {
        throw new TypeError(
          `${CALLER}: options.codecs.${name}.${member} must be a function`,
        );
      }
    }
  }
}

function checkDefiner(value: unknown): void {
  if (typeof value !== 'function') {
    throw new TypeError(
      `${CALLER}: options.defineKeyset must be the server's keyset definer: createDefineKeyset({ cursor })`,
    );
  }
}

/** The checked options; throws `TypeError` naming the first option the adapter cannot use. */
export function storageConfig<TDatabase>(
  options: KyselyStorageOptions<TDatabase>,
): StorageConfig {
  const value: unknown = options;
  if (!isRecord(value)) {
    throw new TypeError(`${CALLER}: options must be an object`);
  }
  checkKeys(CALLER, 'options', value, OPTIONS);
  checkDb(CALLER, value['db']);
  checkCatalog(value['catalog']);
  checkCodecs(value['codecs']);
  checkDefiner(value['defineKeyset']);
  return {
    db: plain(options.db),
    catalog: options.catalog,
    codecs: options.codecs ?? {},
    defineKeyset: options.defineKeyset,
    outbox:
      value['outbox'] === undefined
        ? undefined
        : outboxName(CALLER, value['outbox']),
  };
}
