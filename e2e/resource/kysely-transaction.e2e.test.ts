/**
 * The Kysely runtime's transaction protocol (resource SPEC 18.2) through the
 * built `@nizam-os/kysely-resource`: every transaction runs at READ
 * COMMITTED with the adapter's settings and the actor's scope parameter,
 * whatever the session's defaults, transactions on different connections
 * keep to their own scopes, a run that went on after a refused statement
 * rejects with that statement's error, and no connection keeps a setting
 * or a parameter once its transaction ends. Only the server's sessions
 * start with other defaults (`support/kysely-database.ts`).
 * @ref https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SET
 */
import type { KyselyStorage } from '@nizam-os/kysely-resource';

import type { KyselyDatabase } from './support/kysely-database.ts';

import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createKyselyStorage } from '@nizam-os/kysely-resource';
import { scopeValues } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { DEFINE_KEYSET } from './support/keyset-definer.ts';
import {
  kyselyDatabases,
  POOL_SIZE,
  SESSION_DEFAULTS,
} from './support/kysely-database.ts';

const inWorkspace = (workspace: string) =>
  scopeValues(contractFixture.scopes, { workspace });
const CURRENT = `select current_setting('transaction_isolation') as transaction_isolation,
  current_setting('TimeZone') as "TimeZone", current_setting('DateStyle') as "DateStyle",
  current_setting('contract.workspace_id', true) as workspace`;

describe.each(kyselyDatabases())('transactions on %s', (_name, open) => {
  let database: KyselyDatabase;
  let storage: KyselyStorage;

  beforeAll(() => {
    database = open();
    storage = createKyselyStorage({
      db: database.db,
      catalog: contractFixture.catalog,
      defineKeyset: DEFINE_KEYSET,
    });
  });
  afterAll(async () => {
    await database.close();
  });

  it("runs at read committed with the adapter's settings and the scope's parameter", async () => {
    const [inside] = await storage.transaction(inWorkspace('1'), async (tx) =>
      tx.execute((db) => sql.raw<Record<string, string>>(CURRENT).compile(db)),
    );
    expect(inside).toEqual({
      transaction_isolation: 'read committed',
      TimeZone: 'UTC',
      DateStyle: 'ISO, YMD',
      workspace: '1',
    });
  });

  it('keeps transactions on different connections to their own scopes', async () => {
    const workspaces = Array.from({ length: POOL_SIZE }, (_, index) =>
      String(index + 1),
    );
    const created = await Promise.all(
      workspaces.map(async (workspace) =>
        storage.transaction(inWorkspace(workspace), async (tx) => {
          await tx.execute((db) => sql`select pg_sleep(0.1)`.compile(db));
          const [row] = await tx.execute((db) =>
            sql<{
              created_in: string;
            }>`insert into workspaces (name) values (${`In ${workspace}`}) returning created_in`.compile(
              db,
            ),
          );
          return row?.created_in;
        }),
      ),
    );
    expect(created).toEqual(workspaces);
  });

  it('leaves no setting and no parameter on any connection', async () => {
    const rows = await database.onEachConnection(CURRENT);
    const expected = database.defaults
      ? { ...SESSION_DEFAULTS, workspace: '' }
      : { workspace: '' };
    for (const row of rows) {
      expect(row).toMatchObject(expected);
    }
  });

  it('rejects with the error of a statement that failed, though the run went on', async () => {
    const refused: Array<unknown> = [];
    const thrown: unknown = await storage
      .transaction(inWorkspace('1'), async (tx) => {
        for (const name of ['Before', '']) {
          try {
            await tx.execute((db) =>
              sql`insert into workspaces (name) values (${name})`.compile(db),
            );
          } catch (error) {
            refused.push(error);
          }
        }
        return 'resolved';
      })
      .catch((error: unknown) => error);
    expect(thrown).toBe(refused[0]);
    expect(thrown).toMatchObject({
      code: '23514',
      constraint: 'workspaces_name_check',
    });
    const [kept] = await storage.transaction([], async (tx) =>
      tx.execute((db) =>
        sql<{
          n: number;
        }>`select count(*)::int4 as n from workspaces where name = 'Before'`.compile(
          db,
        ),
      ),
    );
    expect(kept?.n).toBe(0);
  });
});
