/**
 * Databases holding the storage contract's schema (resource SPEC 12.9),
 * with what the reference adapter's harness needs around them: PGlite in
 * process, and a throwaway database on the server `RESOURCE_PG_URL` names
 * through a node-postgres pool of several connections, so the contract's
 * concurrent case runs two transactions at once. Each adds the reference
 * adapter's outbox to the fixture's migrations, and `reset` runs the
 * fixture's seed and empties the outbox.
 * @ref https://node-postgres.com/features/transactions
 * @ref https://pglite.dev/docs/api#transaction
 */
import type { DomainEvent } from '@nizam-os/resource-core/server';

import type { Transact } from './reference-adapter.ts';
import type { Row, SqlClient, TextCodec } from './reference-sql.ts';

import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

import { contractFixture } from '@nizam-os/resource-core/testing';

import { throwawayDatabase } from './oracle-database.ts';
import { endPool } from './pool-closed.ts';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Pool } = pg` for ESM
const { Pool } = pg;

/** The reference adapter's outbox table. */
export const OUTBOX = 'contract_outbox';
/** The outbox table's DDL, after the fixture's migrations. */
export const OUTBOX_TABLE = `create table ${OUTBOX} (
  position int8 generated always as identity primary key,
  name text not null,
  version int4 not null,
  payload jsonb not null
)`;
/** The outbox's events, in the order recorded. */
export const EVENTS = `select name, version, payload::text as payload from ${OUTBOX} order by position`;
/** The fixture's seed, and an empty outbox. */
export const RESET = `${contractFixture.seed}truncate table ${OUTBOX} restart identity;`;
/** Connections of the server's pool: enough for the concurrent case's two transactions. */
const POOL_SIZE = 4;
const POINT = /^\(([^,]+),([^,]+)\)$/u;

/** The `point` codec's storage facet over PostgreSQL's text `(x,y)`. */
export const POINT_TEXT: TextCodec = {
  read: (text) => {
    const [, x = '', y = ''] = POINT.exec(text) ?? [];
    return contractFixture.codecs.point.schema.parse({
      x: Number(x),
      y: Number(y),
    });
  },
  write: (value) => {
    const { x, y } = contractFixture.codecs.point.schema.parse(value);
    return `(${String(x)},${String(y)})`;
  },
};

/** A database holding the contract's schema and the reference adapter's outbox. */
export interface ContractDatabase {
  readonly transact: Transact;
  /** A client that runs each statement in a transaction of its own, for the fault that forgets transactions. */
  readonly autocommit: SqlClient;
  readonly reset: () => Promise<void>;
  readonly events: () => Promise<ReadonlyArray<DomainEvent>>;
  readonly close: () => Promise<void>;
}

/** The event of a row of `EVENTS`. */
export function eventOf(row: Row): DomainEvent {
  const { name, version, payload } = row;
  if (
    typeof name !== 'string' ||
    typeof version !== 'number' ||
    typeof payload !== 'string'
  ) {
    throw new TypeError('the outbox returned a row of another shape');
  }
  const parsed: unknown = JSON.parse(payload);
  return { name, version, payload: parsed };
}

async function openPglite(): Promise<ContractDatabase> {
  const pglite = await PGlite.create();
  for (const script of [...contractFixture.migrations, OUTBOX_TABLE]) {
    await pglite.exec(script);
  }
  return {
    transact: async (run) =>
      pglite.transaction(async (tx) =>
        run({
          query: async (sql, parameters) =>
            (await tx.query<Row>(sql, [...parameters])).rows,
        }),
      ),
    autocommit: {
      query: async (sql, parameters) =>
        (await pglite.query<Row>(sql, [...parameters])).rows,
    },
    reset: async () => {
      await pglite.exec(RESET);
    },
    events: async () =>
      (await pglite.query<Row>(EVENTS)).rows.map((row) => eventOf(row)),
    close: async () => {
      await pglite.close();
    },
  };
}

async function openServer(url: string): Promise<ContractDatabase> {
  const database = await throwawayDatabase(url);
  const pool = new Pool({ connectionString: database.url, max: POOL_SIZE });
  const close = async () => {
    await endPool(pool);
    await database.drop();
  };
  try {
    for (const script of [...contractFixture.migrations, OUTBOX_TABLE]) {
      await pool.query(script);
    }
  } catch (error) {
    await close();
    throw error;
  }
  return {
    transact: async (run) => {
      const connection = await pool.connect();
      const client: SqlClient = {
        query: async (sql, parameters) =>
          (await connection.query<Row>(sql, [...parameters])).rows,
      };
      try {
        await connection.query('begin');
        const result = await run(client);
        await connection.query('commit');
        connection.release();
        return result;
      } catch (error) {
        try {
          await connection.query('rollback');
          connection.release();
        } catch (failure) {
          // The connection broke, which ended the transaction: drop it from the pool.
          connection.release(failure instanceof Error ? failure : true);
        }
        throw error;
      }
    },
    autocommit: {
      query: async (sql, parameters) =>
        (await pool.query<Row>(sql, [...parameters])).rows,
    },
    reset: async () => {
      await pool.query(RESET);
    },
    events: async () =>
      (await pool.query<Row>(EVENTS)).rows.map((row) => eventOf(row)),
    close,
  };
}

/** Databases holding the contract's schema: PGlite always, and the server `RESOURCE_PG_URL` names when it is set. */
export function contractDatabases(): ReadonlyArray<
  readonly [string, () => Promise<ContractDatabase>]
> {
  const url = process.env['RESOURCE_PG_URL'];
  return [
    ['PGlite', openPglite],
    ...(url === undefined
      ? []
      : [['a PostgreSQL server', async () => openServer(url)] as const]),
  ];
}
