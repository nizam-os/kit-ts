/**
 * The contacts application's database for the runtime (resource SPEC 12,
 * 18.3, 18.7): its migrations, the outbox among them, on PGlite and on a
 * throwaway database of the server `RESOURCE_PG_URL` names. The runtime
 * connects as the application's role, which is no superuser, has no
 * BYPASSRLS, and owns no table, as an application's connections would, so
 * the row security policies of `V6__row_security.sql` and
 * `V14__calls_row_security.sql` bind every statement the storage runs, on
 * top of its own scope predicate. The seed and the tests' checks run as
 * the database's owner, past them. Boot's tests connect as the superuser,
 * as a role with BYPASSRLS, and as the owner of `calls`, which does not
 * force row security. PGlite has one connection, the superuser's, so each
 * role is the session's `SET ROLE`, and the owner's work runs in a
 * transaction of `SET LOCAL ROLE NONE`; on the server each role logs in
 * with a password of its own, since CI's server authenticates with SCRAM,
 * and is dropped with the database. `seed.ts` holds what each one holds.
 * @ref https://www.postgresql.org/docs/18/ddl-rowsecurity.html
 * @ref https://www.postgresql.org/docs/18/sql-set-role.html
 * @ref https://www.postgresql.org/docs/18/auth-password.html
 */
import type { DomainEvent } from '@nizam-os/resource-core/server';

import type { Owner, Role } from './seed.ts';

import { randomBytes } from 'node:crypto';

import { Kysely, PGliteDialect, PostgresDialect } from 'kysely';
import pg from 'pg';

import {
  CONTACTS_SCHEMA,
  migratedPglite,
  migrationScripts,
  onServer,
  throwawayDatabase,
} from '../support/oracle-database.ts';
import { connectionsClosed } from '../support/pool-closed.ts';
import { ownerSide, roleStatements, SEED } from './seed.ts';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Client, Pool } = pg` for ESM
const { Client, Pool } = pg;

/** The roles boot's tests connect as, in place of the application's. */
export type BootRole = 'superuser' | 'bypass' | 'owner';

type Row = Readonly<Record<string, unknown>>;

/** Connections of the application's pool on the server: enough for operations to run side by side. */
const POOL_SIZE = 4;
const NAME_BYTES = 8;
const PASSWORD_BYTES = 24;
const PGLITE_ROLES: Readonly<Record<Role, string>> = {
  app: 'contacts_app',
  bypass: 'contacts_bypass',
  owner: 'contacts_owner',
};

/** The database: the application's connections, and the owner's, past row security. */
export interface RuntimeDatabase {
  /** Kysely connected as the application's role. */
  readonly db: Kysely<unknown>;
  /** Runs `run` with Kysely connected as `role` in place of the application's role. */
  readonly as: <TResult>(
    role: BootRole,
    run: (db: Kysely<unknown>) => Promise<TResult>,
  ) => Promise<TResult>;
  /** Runs SQL text of one or more statements as the database's owner. */
  readonly exec: (script: string) => Promise<void>;
  /** Seeds the organizations, their contacts, and Ada's meeting, over an empty outbox. */
  readonly reset: () => Promise<void>;
  /** The committed outbox, in order. */
  readonly events: () => Promise<ReadonlyArray<DomainEvent>>;
  /** An organization's contacts, counted past row security. */
  readonly contacts: (organization: number) => Promise<number>;
  readonly close: () => Promise<void>;
}

/** PGlite with the schema and the roles, its session acting as the application's role. */
export async function openPgliteDatabase(): Promise<RuntimeDatabase> {
  const pglite = await migratedPglite(CONTACTS_SCHEMA);
  for (const statement of roleStatements(PGLITE_ROLES, '')) {
    await pglite.exec(statement);
  }
  const sessionRole = async (role: string): Promise<void> => {
    await pglite.exec(`set role ${role}`);
  };
  await sessionRole(PGLITE_ROLES.app);
  const db = new Kysely<unknown>({ dialect: new PGliteDialect({ pglite }) });
  const owner: Owner = {
    exec: async (script) => {
      await pglite.transaction(async (tx) => {
        await tx.exec(`set local role none;\n${script}`);
      });
    },
    query: async (sql, parameters = []) =>
      pglite.transaction(async (tx) => {
        await tx.exec('set local role none');
        return (await tx.query<Row>(sql, [...parameters])).rows;
      }),
  };
  await owner.exec(SEED);
  return {
    db,
    as: async (role, run) => {
      await sessionRole(role === 'superuser' ? 'none' : PGLITE_ROLES[role]);
      try {
        return await run(db);
      } finally {
        await sessionRole(PGLITE_ROLES.app);
      }
    },
    ...ownerSide(owner),
    close: async () => {
      await db.destroy();
      if (!pglite.closed) {
        await pglite.close();
      }
    },
  };
}

/** Destroys `db`, then waits until every connection of its pool has closed. */
async function destroy(db: Kysely<unknown>, pool: pg.Pool): Promise<void> {
  // Kysely's destroy ends the pool when a query opened it, without waiting for its connections.
  const closed = connectionsClosed(pool);
  await db.destroy();
  if (!pool.ended) {
    await pool.end();
  }
  await closed;
}

/** `url` with the role's name and password in place of its user's. */
function urlAs(url: string, name: string, password: string): string {
  const target = new URL(url);
  target.username = name;
  target.password = password;
  return target.toString();
}

/** A throwaway database on the server at `url`, with login roles of its own, all dropped by `close`. */
async function openServerDatabase(url: string): Promise<RuntimeDatabase> {
  const database = await throwawayDatabase(url);
  const suffix = randomBytes(NAME_BYTES).toString('hex');
  const names: Readonly<Record<Role, string>> = {
    app: `contacts_app_${suffix}`,
    bypass: `contacts_bypass_${suffix}`,
    owner: `contacts_owner_${suffix}`,
  };
  const password = randomBytes(PASSWORD_BYTES).toString('hex');
  const admin = new Client({ connectionString: database.url });
  const drop = async () => {
    await admin.end();
    await database.drop();
    await onServer(
      url,
      `drop role if exists ${Object.values(names).join(', ')}`,
    );
  };
  try {
    await admin.connect();
    for (const statement of [
      ...(await migrationScripts(CONTACTS_SCHEMA)),
      ...roleStatements(names, `login password '${password}'`),
      SEED,
    ]) {
      await admin.query(statement);
    }
  } catch (error) {
    await drop();
    throw error;
  }
  const connect = (role: BootRole | 'app') =>
    role === 'superuser'
      ? database.url
      : urlAs(database.url, names[role], password);
  const pool = new Pool({ connectionString: connect('app'), max: POOL_SIZE });
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });
  const owner: Owner = {
    exec: async (script) => {
      await admin.query(script);
    },
    query: async (sql, parameters = []) =>
      (await admin.query<Row>(sql, [...parameters])).rows,
  };
  return {
    db,
    as: async (role, run) => {
      const rolePool = new Pool({ connectionString: connect(role), max: 1 });
      const roleDb = new Kysely<unknown>({
        dialect: new PostgresDialect({ pool: rolePool }),
      });
      try {
        return await run(roleDb);
      } finally {
        await destroy(roleDb, rolePool);
      }
    },
    ...ownerSide(owner),
    close: async () => {
      await destroy(db, pool);
      await drop();
    },
  };
}

/** The databases: PGlite always, and the server `RESOURCE_PG_URL` names when it is set. */
export function runtimeDatabases(): ReadonlyArray<
  readonly [string, () => Promise<RuntimeDatabase>]
> {
  const url = process.env['RESOURCE_PG_URL'];
  return [
    ['PGlite', openPgliteDatabase],
    ...(url === undefined
      ? []
      : [
          ['a PostgreSQL server', async () => openServerDatabase(url)] as const,
        ]),
  ];
}
