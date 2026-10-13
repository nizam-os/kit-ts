import type { Kysely } from 'kysely';

/**
 * The option checks `createKyselyStorage` and `relayOutbox` share (SPEC
 * 18.2, 18.6): a key that is not an option, a `db` that is not a Kysely
 * instance, and an outbox table that is not `{ table, schema? }` each
 * throw `TypeError` naming the caller and the option, before any query.
 * @packageDocumentation
 */
import type { AnyDatabase } from '@nizam-os/kysely-keyset';

import { isRecord } from './object';

/** An outbox table by schema and name, its schema resolved. */
export interface OutboxName {
  readonly schema: string;
  readonly table: string;
}

const OUTBOX_OPTIONS: ReadonlySet<string> = new Set(['table', 'schema']);
/** The schema of an outbox table that names none: the schema PostgreSQL creates in every database, and the catalog's default. */
const DEFAULT_OUTBOX_SCHEMA = 'public';

/** Throws for a key of `value` that `known` does not hold. */
export function checkKeys(
  caller: string,
  path: string,
  value: Readonly<Record<string, unknown>>,
  known: ReadonlySet<string>,
): void {
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      throw new TypeError(`${caller}: ${path}.${key} is not an option`);
    }
  }
}

/** Throws unless `value` is a Kysely instance. */
export function checkDb(caller: string, value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value['withoutPlugins'] !== 'function' ||
    typeof value['transaction'] !== 'function'
  ) {
    throw new TypeError(`${caller}: options.db must be a Kysely instance`);
  }
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** `{ table, schema? }` with its schema resolved; throws for anything else. */
export function outboxName(caller: string, value: unknown): OutboxName {
  const path = `${caller}: options.outbox`;
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be { table, schema? }`);
  }
  checkKeys(caller, 'options.outbox', value, OUTBOX_OPTIONS);
  const { table, schema = DEFAULT_OUTBOX_SCHEMA } = value;
  if (!isName(table)) {
    throw new TypeError(`${path}.table must be a table name`);
  }
  if (!isName(schema)) {
    throw new TypeError(`${path}.schema must be a schema name`);
  }
  return Object.freeze({ schema, table });
}

/** `db` without its plugins, typed for statements over any table. */
export function plain<TDatabase>(db: Kysely<TDatabase>): Kysely<AnyDatabase> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: every table and column the adapter names comes from the catalog the declarations were checked against, or is the outbox's documented column, so the application's DB type adds nothing to its statements
  return db.withoutPlugins() as unknown as Kysely<AnyDatabase>;
}
