/**
 * Live databases for the drift tests, reached by URL the way drift reaches
 * production: PGlite behind a socket server, which node-postgres reaches
 * over the wire protocol, and a database of its own on the server
 * `CATALOG_PG_URL` names. The socket server multiplexes its connections
 * over PGlite's one session, so the tests never use two at once.
 * @ref https://pglite.dev/docs/pglite-socket
 */
import { randomBytes } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';

import { withDatabase } from '../target/server';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Client } = pg` for ESM
const { Client } = pg;

const NAME_BYTES = 8;
/** The owner's connection and the one drift opens. */
const CONNECTIONS = 2;

export interface TestDatabase {
  /** The URL drift connects to, as the owner. */
  readonly url: string;
  /** The database's name. */
  readonly name: string;
  /** Runs SQL as the owner, through the simple query protocol. */
  run(sql: string): Promise<void>;
  close(): Promise<void>;
}

async function connected(url: string): Promise<pg.Client> {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/** PGlite (PostgreSQL 18) behind a socket server on a port the system picks. */
export async function pgliteDatabase(): Promise<TestDatabase> {
  const pglite = await PGlite.create();
  const server = new PGLiteSocketServer({
    db: pglite,
    port: 0,
    maxConnections: CONNECTIONS,
  });
  await server.start();
  const url = `postgres://postgres@${server.getServerConn()}/postgres`;
  const owner = await connected(url);
  return {
    url,
    name: 'postgres',
    run: async (sql) => {
      await owner.query(sql);
    },
    close: async () => {
      await owner.end();
      await server.stop();
      await pglite.close();
    },
  };
}

/** A database of its own on the server, created from `template0` and dropped by `close`. */
export async function serverDatabase(server: string): Promise<TestDatabase> {
  const name = `nizam_drift_${randomBytes(NAME_BYTES).toString('hex')}`;
  const admin = await connected(server);
  await admin.query(
    `create database ${name} template template0 encoding 'UTF8'`,
  );
  const url = withDatabase(server, name);
  const owner = await connected(url);
  return {
    url,
    name,
    run: async (sql) => {
      await owner.query(sql);
    },
    close: async () => {
      await owner.end();
      try {
        await admin.query(`drop database ${name} with (force)`);
      } finally {
        await admin.end();
      }
    },
  };
}
