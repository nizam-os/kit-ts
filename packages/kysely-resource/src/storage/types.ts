import type { Kysely } from 'kysely';

/**
 * The storage adapter's options and handle (SPEC 18.2).
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';
import type { DefineDefaultedKeyset } from '@nizam-os/keyset-core';
import type { DeclaredResource } from '@nizam-os/resource-core';
import type {
  ListOptions,
  PublicRow,
  ScopeValue,
  StorageAdapter,
  StorageListRequest,
  StoragePage,
} from '@nizam-os/resource-core/server';

import type { KyselyTransaction } from './transaction';

/**
 * A storage codec over PostgreSQL's text (resource SPEC 7.1): `read` takes
 * the text PostgreSQL prints and returns the codec's value, and `write`
 * takes the codec's value and returns the text PostgreSQL reads. `write`
 * takes `never`, so the storage codec of any codec fits, and one object of
 * them serves the adapter and `rules --check` (`resources.storage`,
 * catalog SPEC 10.3).
 */
export interface TextCodec {
  readonly read: (stored: string) => unknown;
  readonly write: (value: never) => string;
}

/** The table events are written to (SPEC 18.6), by schema and name. */
export interface OutboxTable {
  readonly table: string;
  /** Defaults to `public`. */
  readonly schema?: string | undefined;
}

/** What `createKyselyStorage` takes. */
export interface KyselyStorageOptions<TDatabase> {
  /** The application's Kysely over PostgreSQL 14 or later, or PGlite; the adapter runs without its plugins. */
  readonly db: Kysely<TDatabase>;
  /** The public catalog the declarations are built from. */
  readonly catalog: PublicCatalog;
  /** A storage codec per codec name the declarations use. */
  readonly codecs?: Readonly<Record<string, TextCodec>> | undefined;
  /** The server's keyset definer, which holds the cursor secret: `createDefineKeyset({ cursor })`. */
  readonly defineKeyset: DefineDefaultedKeyset;
  /** Where events are written; needed once a behavior has effects. */
  readonly outbox?: OutboxTable | undefined;
}

/**
 * The storage adapter of resource SPEC 12.8 over Kysely, with `many` for
 * includes and the `total` option of `list` (SPEC 18.4).
 */
export interface KyselyStorage extends StorageAdapter<KyselyTransaction> {
  /** The public catalog it was created with. */
  readonly catalog: PublicCatalog;
  /** The outbox table it was created with, its schema resolved; `undefined` without one. */
  readonly outbox:
    | { readonly schema: string; readonly table: string }
    | undefined;
  /**
   * Runs `run` in one READ COMMITTED transaction that first fixes how
   * values print and sets each scope's parameter for the transaction only;
   * commits when `run` resolves, and rolls back and rejects otherwise, or
   * when one of the adapter's statements failed though `run` went on.
   */
  transaction<TResult>(
    scopes: ReadonlyArray<ScopeValue>,
    run: (tx: KyselyTransaction) => Promise<TResult>,
  ): Promise<TResult>;
  /**
   * A page of the resource's rows in the transaction's scope, its cursors
   * bound to the scope's values; with `options.total`, the count of the
   * rows the filter selects.
   */
  list(
    tx: KyselyTransaction,
    resource: DeclaredResource,
    request: StorageListRequest,
    options?: ListOptions,
  ): Promise<StoragePage>;
  /** The rows of the resource whose key is any of `ids`, in the transaction's scope. */
  many(
    tx: KyselyTransaction,
    resource: DeclaredResource,
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<PublicRow>>;
}
