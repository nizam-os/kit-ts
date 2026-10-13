import type { TestDatabase } from '../test-support/database';
import type { KyselyStorage } from './types';

import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { scopeValues } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { contractDatabase, storageOptions } from '../test-support/database';
import { createKyselyStorage } from './create-storage';
import { scopeOf, scopePredicate } from './scope';
import { tableName, tableOf } from './sql';

const { catalog, resources } = contractFixture;
const { tasks, workspaces } = resources;
const CREATED_BY = '00000000-0000-4000-8000-0000000000aa';

let database: TestDatabase;
let storage: KyselyStorage;

const inWorkspace = (workspace: string) =>
  scopeValues(contractFixture.scopes, { workspace });

beforeAll(async () => {
  database = contractDatabase();
  storage = createKyselyStorage(storageOptions(database.db));
  await database.reset();
  await database.exec(`insert into tasks (workspace_id, title, created_by) values
    (1, 'First', '${CREATED_BY}'), (1, 'Second', '${CREATED_BY}'), (2, 'Third', '${CREATED_BY}');`);
});
afterAll(async () => {
  await database.close();
});

describe('scope predicate', () => {
  it("compares the scope column with the transaction's value, cast to the column's type", async () => {
    const table = tableOf(catalog, tasks);
    const { compiled, count } = await storage.transaction(
      inWorkspace('1'),
      async (tx) => {
        const predicate = scopePredicate(catalog, table, tasks, tx);
        const [row] = await tx.execute((db) =>
          sql<{
            n: number;
          }>`select count(*)::int4 as "n" from ${tableName(table)} where ${predicate}`.compile(
            db,
          ),
        );
        return { compiled: predicate.compile(database.db), count: row?.n };
      },
    );
    expect(compiled.sql).toBe('"workspace_id" = $1::text::"int8"');
    expect(compiled.parameters).toEqual(['1']);
    expect(count).toBe(2);
  });

  it('is true for a resource without a scope', async () => {
    const table = tableOf(catalog, workspaces);
    const { compiled, count } = await storage.transaction(
      inWorkspace('1'),
      async (tx) => {
        expect(scopeOf(workspaces, tx)).toBeUndefined();
        const predicate = scopePredicate(catalog, table, workspaces, tx);
        const [row] = await tx.execute((db) =>
          sql<{
            n: number;
          }>`select count(*)::int4 as "n" from ${tableName(table)} where ${predicate}`.compile(
            db,
          ),
        );
        return { compiled: predicate.compile(database.db), count: row?.n };
      },
    );
    expect(compiled.sql).toBe('true');
    expect(compiled.parameters).toEqual([]);
    expect(count).toBe(3);
  });

  it('refuses a scoped resource in a transaction without its scope', async () => {
    const table = tableOf(catalog, tasks);
    await expect(
      storage.transaction([], async (tx) =>
        tx.execute((db) =>
          sql`select count(*) from ${tableName(table)} where ${scopePredicate(catalog, table, tasks, tx)}`.compile(
            db,
          ),
        ),
      ),
    ).rejects.toThrow(
      new Error('tasks: the transaction has no value for scope workspace'),
    );
  });

  it("keeps each statement to its scope's rows, with no row security on the table", async () => {
    const table = tableOf(catalog, tasks);
    const titlesIn = async (workspace: string) =>
      storage.transaction(inWorkspace(workspace), async (tx) =>
        tx.execute((db) =>
          sql<{
            title: string;
          }>`select title from ${tableName(table)} where ${scopePredicate(catalog, table, tasks, tx)} order by title`.compile(
            db,
          ),
        ),
      );
    expect(await titlesIn('1')).toEqual([
      { title: 'First' },
      { title: 'Second' },
    ]);
    expect(await titlesIn('2')).toEqual([{ title: 'Third' }]);
    expect(await titlesIn('9')).toEqual([{ title: 'Forever' }]);
    expect(await titlesIn('3')).toEqual([]);
  });
});
