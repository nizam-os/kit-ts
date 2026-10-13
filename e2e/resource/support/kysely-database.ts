/**
 * Databases the Kysely runtime's suites run on (resource SPEC 18.7),
 * holding the storage contract's schema (SPEC 12.9) and its outbox: PGlite
 * through Kysely's PGlite dialect, and a throwaway database on the server
 * `RESOURCE_PG_URL` names through Kysely's PostgreSQL dialect over a
 * node-postgres pool of several connections, so the contract's concurrent
 * cases run two transactions at once. Each opens on first use, so a suite
 * can hand its adapter to the contract before any test runs. The server's
 * sessions start with defaults unlike the adapter's settings,
 * SERIALIZABLE, Asia/Tokyo, and SQL dates, as a role's or a database's
 * settings might set them, so a suite sees each setting the adapter makes
 * and that none outlives its transaction. PGlite keeps its own defaults:
 * it runs one transaction at a time, and Kysely's PGlite dialect passes no
 * isolation level on.
 * @ref https://node-postgres.com/apis/client (`options`: command-line options sent to the server at startup)
 * @ref https://www.postgresql.org/docs/18/config-setting.html#CONFIG-SETTING-SHELL
 * @ref https://kysely-org.github.io/kysely-apidoc/interfaces/PostgresDialectConfig.html (`pool` may be a function, called on first use)
 */
import { PGlite } from '@electric-sql/pglite';
import { Kysely, PGliteDialect, PostgresDialect } from 'kysely';
import pg from 'pg';

import { contractFixture } from '@nizam-os/resource-core/testing';

import { OUTBOX_TABLE } from './contract-database.ts';
import { throwawayDatabase } from './oracle-database.ts';
import { connectionsClosed, endPool } from './pool-closed.ts';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Pool } = pg` for ESM
const { Pool } = pg;

/** Connections of the server's pool: enough for transactions to run side by side. */
export const POOL_SIZE = 4;
/** The server sessions' defaults, each unlike the adapter's setting. */
export const SESSION_DEFAULTS = {
  transaction_isolation: 'serializable',
  TimeZone: 'Asia/Tokyo',
  DateStyle: 'SQL, DMY',
} as const;
const STARTUP_OPTIONS =
  '-c default_transaction_isolation=serializable -c TimeZone=Asia/Tokyo -c DateStyle=SQL,DMY';
const MIGRATIONS: ReadonlyArray<string> = [
  ...contractFixture.migrations,
  OUTBOX_TABLE,
];

type Row = Readonly<Record<string, unknown>>;

/** A database holding the contract's schema and outbox, through Kysely. */
export interface KyselyDatabase {
  readonly db: Kysely<unknown>;
  /** Whether each session starts with `SESSION_DEFAULTS`; PGlite's do not. */
  readonly defaults: boolean;
  /** Runs SQL text of one or more statements outside Kysely, as a migration does. */
  readonly exec: (script: string) => Promise<void>;
  /** Runs `query` on every connection at once, outside any transaction: the pool's, or PGlite's one. */
  readonly onEachConnection: (query: string) => Promise<ReadonlyArray<Row>>;
  readonly close: () => Promise<void>;
}

function pgliteDatabase(): KyselyDatabase {
  let opened: Promise<PGlite> | undefined;
  const open = async (): Promise<PGlite> => {
    opened ??= (async () => {
      const pglite = await PGlite.create();
      for (const script of MIGRATIONS) {
        await pglite.exec(script);
      }
      return pglite;
    })();
    return opened;
  };
  const db = new Kysely<unknown>({
    dialect: new PGliteDialect({ pglite: open }),
  });
  return {
    db,
    defaults: false,
    exec: async (script) => {
      await (await open()).exec(script);
    },
    onEachConnection: async (query) =>
      (await (await open()).query<Row>(query)).rows,
    close: async () => {
      await db.destroy();
    },
  };
}

interface Server {
  readonly pool: pg.Pool;
  readonly drop: () => Promise<void>;
}

function serverDatabase(url: string): KyselyDatabase {
  let opened: Promise<Server> | undefined;
  const open = async (): Promise<Server> => {
    opened ??= (async () => {
      const database = await throwawayDatabase(url);
      const pool = new Pool({
        connectionString: database.url,
        max: POOL_SIZE,
        options: STARTUP_OPTIONS,
      });
      try {
        for (const script of MIGRATIONS) {
          await pool.query(script);
        }
      } catch (error) {
        await endPool(pool);
        await database.drop();
        throw error;
      }
      return { pool, drop: database.drop };
    })();
    return opened;
  };
  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({ pool: async () => (await open()).pool }),
  });
  return {
    db,
    defaults: true,
    exec: async (script) => {
      await (await open()).pool.query(script);
    },
    onEachConnection: async (query) => {
      const { pool } = await open();
      const clients = await Promise.all(
        Array.from({ length: POOL_SIZE }, async () => pool.connect()),
      );
      try {
        const results = await Promise.all(
          clients.map(async (client) => (await client.query<Row>(query)).rows),
        );
        return results.flat();
      } finally {
        for (const client of clients) {
          client.release();
        }
      }
    },
    close: async () => {
      if (opened === undefined) {
        return;
      }
      const { pool, drop } = await opened;
      // Kysely's destroy ends the pool when a query opened it, without waiting for its connections.
      const closed = connectionsClosed(pool);
      await db.destroy();
      if (!pool.ended) {
        await pool.end();
      }
      await closed;
      await drop();
    },
  };
}

/** The databases, each opened on first use: PGlite always, and the server `RESOURCE_PG_URL` names when it is set. */
export function kyselyDatabases(): ReadonlyArray<
  readonly [string, () => KyselyDatabase]
> {
  const url = process.env['RESOURCE_PG_URL'];
  return [
    ['PGlite', pgliteDatabase],
    ...(url === undefined
      ? []
      : [['a PostgreSQL server', () => serverDatabase(url)] as const]),
  ];
}
