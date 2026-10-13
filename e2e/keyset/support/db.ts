import type { Generated, GeneratedAlways } from 'kysely';

/**
 * Database harnesses: PGlite in-process (Kysely's built-in dialect),
 * node-postgres over a pglite-socket server (the stock `pg` driver and its
 * type parsers), and a PostgreSQL server named by `KEYSET_PG_URL`. Every
 * harness creates the schema and seeds it, so each test file starts from
 * the same rows, and opens Drizzle on the same client beside Kysely, so a
 * file can page through either binding.
 * @ref https://kysely.dev/docs/dialects
 * @ref https://pglite.dev/docs/pglite-socket
 * @ref https://orm.drizzle.team/docs/get-started-postgresql (an existing node-postgres pool)
 * @ref https://orm.drizzle.team/docs/connect-pglite (an existing PGlite client)
 */
import type { KeysetDatabase } from '@nizam-os/drizzle-keyset';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { Kysely, PGliteDialect, PostgresDialect, sql } from 'kysely';
import pg from 'pg';

import { CONTACTS, EMAILS, STATEMENTS, WORK } from './schema.ts';
// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Pool } = pg` for ESM
const { Pool } = pg;

interface ContactsTable {
  id: string;
  first_name: string;
  last_name: string | null;
  age: number | null;
  score: string;
  active: boolean;
  status: 'lead' | 'customer';
  tags: Array<string>;
  created_at: string | Date;
  birthday: string | Date | null;
  bio: string;
  search_vector: GeneratedAlways<string>;
}

interface ContactEmailsTable {
  id: Generated<number>;
  contact_id: string;
  email: string;
  is_primary: boolean;
}

interface WorkHistoryTable {
  id: Generated<number>;
  contact_id: string;
  company: string;
  start_date: string | Date;
}

export interface DB {
  contacts: ContactsTable;
  contact_emails: ContactEmailsTable;
  work_history: WorkHistoryTable;
}

/** The same tables as a `CamelCasePlugin` application sees them. */
export interface CamelDB {
  contacts: {
    id: string;
    firstName: string;
    lastName: string | null;
    age: number | null;
    score: string;
    active: boolean;
    status: 'lead' | 'customer';
    tags: Array<string>;
    createdAt: string | Date;
    birthday: string | Date | null;
    bio: string;
    searchVector: GeneratedAlways<string>;
  };
  contactEmails: {
    id: Generated<number>;
    contactId: string;
    email: string;
    isPrimary: boolean;
  };
  workHistory: {
    id: Generated<number>;
    contactId: string;
    company: string;
    startDate: string | Date;
  };
}

export interface Harness {
  readonly db: Kysely<DB>;
  /** Drizzle over the same database. */
  readonly drizzle: KeysetDatabase;
  close(): Promise<void>;
}

/** Postgres array input syntax, so the seed inserts the same way through every driver. */
function arrayLiteral(items: ReadonlyArray<string>): string {
  return `{${items.map((item) => `"${item.replaceAll('"', '\\"')}"`).join(',')}}`;
}

async function createSchema(db: Kysely<DB>): Promise<void> {
  for (const statement of STATEMENTS) {
    await sql.raw(statement).execute(db);
  }
  await db
    .insertInto('contacts')
    .values(
      CONTACTS.map((row) => ({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        age: row.age,
        score: row.score,
        active: row.active,
        status: row.status,
        // Array input syntax, so every driver sends the same parameter.
        tags: sql<Array<string>>`${arrayLiteral(row.tags)}`,
        created_at: row.created_at,
        birthday: row.birthday,
        bio: row.bio,
      })),
    )
    .execute();
  await db
    .insertInto('contact_emails')
    .values([...EMAILS])
    .execute();
  await db
    .insertInto('work_history')
    .values([...WORK])
    .execute();
}

export async function openPglite(): Promise<Harness & { pglite: PGlite }> {
  const pglite = new PGlite();
  await pglite.waitReady;
  const db = new Kysely<DB>({ dialect: new PGliteDialect({ pglite }) });
  await createSchema(db);
  return {
    db,
    drizzle: drizzlePglite({ client: pglite }),
    pglite,
    close: async () => {
      await db.destroy();
    },
  };
}

const PORT_RANGE = 20_000;
const PORT_BASE = 30_000;

/** node-postgres talking the wire protocol to PGlite behind a socket server. */
export async function openPgOverSocket(): Promise<Harness> {
  const pglite = new PGlite();
  await pglite.waitReady;
  const port = PORT_BASE + Math.floor(Math.random() * PORT_RANGE);
  const server = new PGLiteSocketServer({
    db: pglite,
    port,
    host: '127.0.0.1',
  });
  await server.start();
  const pool = new Pool({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    database: 'postgres',
    max: 1,
  });
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  await createSchema(db);
  return {
    db,
    drizzle: drizzleNodePg({ client: pool }),
    close: async () => {
      await db.destroy();
      await server.stop();
      await pglite.close();
    },
  };
}

/** A PostgreSQL server; the schema lives in a throwaway schema of its own. */
export async function openPostgres(url: string): Promise<Harness> {
  const schema = `keyset_e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const pool = new Pool({ connectionString: url, max: 2 });
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  await sql.raw(`create schema ${schema}`).execute(db);
  await pool.end();
  const scoped = new Pool({
    connectionString: url,
    max: 2,
    options: `-c search_path=${schema}`,
  });
  const scopedDb = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: scoped }),
  });
  await createSchema(scopedDb);
  return {
    db: scopedDb,
    drizzle: drizzleNodePg({ client: scoped }),
    close: async () => {
      await sql.raw(`drop schema ${schema} cascade`).execute(scopedDb);
      await scopedDb.destroy();
    },
  };
}

/**
 * The databases a feature file runs on: PGlite always, and the server
 * `KEYSET_PG_URL` names when it is set (CI provides PostgreSQL 14 and 18).
 */
export function databases(): ReadonlyArray<
  readonly [string, () => Promise<Harness>]
> {
  const url = process.env['KEYSET_PG_URL'];
  return [
    ['PGlite', openPglite],
    ...(url === undefined
      ? []
      : [['PostgreSQL server', async () => openPostgres(url)] as const]),
  ];
}
