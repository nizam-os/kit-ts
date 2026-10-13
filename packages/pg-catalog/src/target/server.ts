import type { SqlSession } from './session';

/**
 * Sessions on a PostgreSQL server: the server target (SPEC 6.2, ADR 0003),
 * a throwaway database created from `template0` with UTF-8 encoding and
 * dropped afterwards, and the live database drift reads (SPEC 10.2).
 * @ref https://www.postgresql.org/docs/18/sql-createdatabase.html
 * @ref https://www.postgresql.org/docs/18/sql-dropdatabase.html
 * @packageDocumentation
 */
import pg from 'pg';

import { PgCatalogError } from '../errors';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Client } = pg` for ESM
const { Client } = pg;

const NAME_PREFIX = 'nizam_catalog_';
const NAME_BYTES = 8;
const HEX = 16;
const BYTE_DIGITS = 2;

/** `nizam_catalog_` followed by 16 lowercase hex digits from a CSPRNG. */
export function throwawayName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NAME_BYTES));
  return (
    NAME_PREFIX +
    [...bytes]
      .map((byte) => byte.toString(HEX).padStart(BYTE_DIGITS, '0'))
      .join('')
  );
}

/** The parsed URL; messages never echo it, since it may hold a password. */
function postgresUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new PgCatalogError(
      'config_invalid',
      'the database URL is not a valid URL',
      {
        cause: error,
      },
    );
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new PgCatalogError(
      'config_invalid',
      'the database URL must start with postgres:// or postgresql://',
    );
  }
  return parsed;
}

/** The URL with its database replaced; it must be a `postgres://` or `postgresql://` URL. */
export function withDatabase(url: string, database: string): string {
  const parsed = postgresUrl(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * Why node-postgres could not connect, for the message: the socket error
 * (`connect ECONNREFUSED 127.0.0.1:5432`, `getaddrinfo ENOTFOUND db`) or
 * the server's (`database "app" does not exist`), which name the host,
 * role, or database but never the password. When every address of a host
 * such as `localhost` refuses, Node.js reports an `AggregateError` with an
 * empty message, so its errors speak instead.
 * @ref https://nodejs.org/api/net.html#socketconnectoptions-connectlistener (autoSelectFamily)
 */
function reasonOf(error: unknown): string {
  if (error instanceof AggregateError && error.message === '') {
    return error.errors.map(reasonOf).join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

function reportedByNextQuery(): void {
  // The failed connection rejects the next query, which reports it.
}

async function connect(url: string): Promise<pg.Client> {
  const client = new Client({ connectionString: url });
  // A connection the server ends is reported by the next query; without a
  // listener the 'error' event would end the process instead.
  client.on('error', reportedByNextQuery);
  try {
    await client.connect();
  } catch (error) {
    throw new PgCatalogError(
      'connection_failed',
      `cannot connect to the PostgreSQL server: ${reasonOf(error)}`,
      {
        cause: error,
      },
    );
  }
  return client;
}

/** A session over a connected client; `onClose` runs after the client ends. */
function clientSession(
  client: pg.Client,
  onClose: () => Promise<void>,
): SqlSession {
  return {
    exec: async (sql) => {
      await client.query(sql);
    },
    query: async <TRow extends Record<string, unknown>>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ) => (await client.query<TRow>(sql, [...params])).rows,
    close: async () => {
      await client.end();
      await onClose();
    },
  };
}

async function dropDatabase(admin: pg.Client, name: string): Promise<void> {
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } catch (error) {
    throw new PgCatalogError(
      'connection_failed',
      `cannot drop the database ${name}: ${reasonOf(error)}`,
      {
        cause: error,
      },
    );
  } finally {
    await admin.end();
  }
}

/**
 * Creates `nizam_catalog_<random>` on the server the URL names and
 * returns a session connected to it; closing the session drops it. The
 * role needs `CREATEDB`.
 */
export async function openThrowawayDatabase(url: string): Promise<SqlSession> {
  const name = throwawayName();
  const target = withDatabase(url, name);
  const admin = await connect(url);
  try {
    await admin.query(
      `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
    );
  } catch (error) {
    await admin.end();
    throw new PgCatalogError(
      'connection_failed',
      `cannot create the database ${name}: ${reasonOf(error)}`,
      {
        cause: error,
      },
    );
  }
  let client: pg.Client;
  try {
    client = await connect(target);
  } catch (error) {
    await dropDatabase(admin, name);
    throw error;
  }
  return clientSession(client, async () => dropDatabase(admin, name));
}

async function disconnected(): Promise<void> {
  // A live database is left as it was: closing only ends the connection.
}

/**
 * A session on the database the URL names, as it is; closing it ends the
 * connection. Fails with `config_invalid` for a URL that is not a
 * `postgres://` or `postgresql://` URL and `connection_failed` when the
 * server refuses the connection.
 */
export async function openLiveDatabase(url: string): Promise<SqlSession> {
  postgresUrl(url);
  return clientSession(await connect(url), disconnected);
}
