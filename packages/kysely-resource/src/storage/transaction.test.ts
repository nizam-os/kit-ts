import type { TestDatabase } from '../test-support/database';
import type { KyselyStorage } from './types';

import { CamelCasePlugin, sql } from 'kysely';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { defineScope, scopeValues } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { contractDatabase, storageOptions } from '../test-support/database';
import { createKyselyStorage } from './create-storage';

interface Actor {
  readonly workspace: string;
  readonly team: string;
}

const team = defineScope({
  column: 'team_id',
  value: (actor: Actor) => actor.team,
  session: 'contract.team_id',
});
const scopesOf = (actor: Actor) =>
  scopeValues({ workspace: contractFixture.scopes.workspace, team }, actor);

const SETTINGS = sql<Record<string, string>>`select
  current_setting('TimeZone') as "TimeZone",
  current_setting('DateStyle') as "DateStyle",
  current_setting('IntervalStyle') as "IntervalStyle",
  current_setting('extra_float_digits') as "extra_float_digits",
  current_setting('bytea_output') as "bytea_output"`;
const PARAMETERS = sql<Record<string, string | null>>`select
  current_setting('contract.workspace_id', true) as "workspace",
  current_setting('contract.team_id', true) as "team"`;
const insertWorkspace = (name: string) =>
  sql<{
    id: string;
    created_in: string | null;
  }>`insert into workspaces (name) values (${name}) returning id::text as "id", created_in`;

let database: TestDatabase;
let storage: KyselyStorage;

async function namesOf(name: string): Promise<number> {
  const { rows } = await sql<{
    n: number;
  }>`select count(*)::int4 as "n" from workspaces where name = ${name}`.execute(
    database.db,
  );
  return rows[0]?.n ?? 0;
}

beforeAll(() => {
  database = contractDatabase();
  storage = createKyselyStorage(storageOptions(database.db));
});
afterAll(async () => {
  await database.close();
});
beforeEach(async () => {
  await database.reset();
});
afterEach(async () => {
  await sql`reset all`.execute(database.db);
});

describe('transaction', () => {
  it('fixes how values print for the transaction, whatever the session set', async () => {
    for (const statement of [
      sql`set TimeZone to 'Asia/Tokyo'`,
      sql`set DateStyle to 'SQL, DMY'`,
      sql`set IntervalStyle to 'iso_8601'`,
      sql`set extra_float_digits to 3`,
      sql`set bytea_output to 'escape'`,
    ]) {
      await statement.execute(database.db);
    }
    const inside = await storage.transaction([], async (tx) => {
      const [settings] = await tx.execute((db) => SETTINGS.compile(db));
      const [printed] = await tx.execute((db) =>
        sql<Record<string, string>>`select
          '2024-01-02 03:04:05.5+09'::timestamptz::text as "at",
          interval '1 day 2 hours'::text as "span",
          0.1::float8::text as "float",
          '\\x01ff'::bytea::text as "bytes",
          current_setting('transaction_isolation') as "isolation"`.compile(db),
      );
      return { settings, printed };
    });
    expect(inside).toEqual({
      settings: {
        TimeZone: 'UTC',
        DateStyle: 'ISO, YMD',
        IntervalStyle: 'postgres',
        extra_float_digits: '1',
        bytea_output: 'hex',
      },
      printed: {
        at: '2024-01-01 18:04:05.5+00',
        span: '1 day 02:00:00',
        float: '0.1',
        bytes: '\\x01ff',
        isolation: 'read committed',
      },
    });
    const { rows } = await SETTINGS.execute(database.db);
    expect(rows).toEqual([
      {
        TimeZone: 'Asia/Tokyo',
        DateStyle: 'SQL, DMY',
        IntervalStyle: 'iso_8601',
        extra_float_digits: '3',
        bytea_output: 'escape',
      },
    ]);
  });

  it('sets each scope parameter before the first statement of the run', async () => {
    const result = await storage.transaction(
      scopesOf({ workspace: '7', team: 'blue' }),
      async (tx) => {
        const [parameters] = await tx.execute((db) => PARAMETERS.compile(db));
        const [workspace] = await tx.execute((db) =>
          insertWorkspace('Seven').compile(db),
        );
        return { parameters, createdIn: workspace?.created_in };
      },
    );
    expect(result).toEqual({
      parameters: { workspace: '7', team: 'blue' },
      createdIn: '7',
    });
  });

  it('sets the parameters for their transaction only, committed or rolled back', async () => {
    await storage.transaction(
      scopesOf({ workspace: '1', team: 'red' }),
      async (tx) =>
        tx.execute((db) => insertWorkspace('Committed').compile(db)),
    );
    await expect(
      storage.transaction(
        scopesOf({ workspace: '2', team: 'green' }),
        async (tx) => {
          await tx.execute((db) => insertWorkspace('Rolled back').compile(db));
          throw new Error('rolled back');
        },
      ),
    ).rejects.toThrow('rolled back');
    const { rows } = await PARAMETERS.execute(database.db);
    expect(rows).toEqual([{ workspace: '', team: '' }]);
    const unscoped = await storage.transaction([], async (tx) =>
      tx.execute((db) => PARAMETERS.compile(db)),
    );
    expect(unscoped).toEqual([{ workspace: '', team: '' }]);
  });

  it('commits when the run resolves, and resolves to what it returned', async () => {
    const id = await storage.transaction(
      scopesOf({ workspace: '1', team: 'red' }),
      async (tx) => {
        const [row] = await tx.execute((db) =>
          insertWorkspace('Kept').compile(db),
        );
        return row?.id;
      },
    );
    expect(id).toBe('10');
    expect(await namesOf('Kept')).toBe(1);
  });

  it('rolls back and rejects with what the run threw, unchanged', async () => {
    const stop = new Error('stop');
    await expect(
      storage.transaction([], async (tx) => {
        await tx.execute((db) => insertWorkspace('Dropped').compile(db));
        throw stop;
      }),
    ).rejects.toBe(stop);
    expect(await namesOf('Dropped')).toBe(0);
  });

  it('rejects with the first error a statement raised, though the run went on', async () => {
    const refusals: Array<unknown> = [];
    const thrown: unknown = await storage
      .transaction([], async (tx) => {
        await tx.execute((db) => insertWorkspace('Before').compile(db));
        for (const name of ['', 'After']) {
          try {
            await tx.execute((db) => insertWorkspace(name).compile(db));
          } catch (error) {
            // The run goes on, as a rule that catches an error might.
            refusals.push(error);
          }
        }
        return 'resolved';
      })
      .catch((error: unknown) => error);
    expect(refusals).toMatchObject([{ code: '23514' }, { code: '25P02' }]);
    expect(thrown).toBe(refusals[0]);
    expect(thrown).toMatchObject({ constraint: 'workspaces_name_check' });
    expect(await namesOf('Before')).toBe(0);
  });

  it('rejects with what the run threw after a statement failed', async () => {
    const own = new Error('the run decided');
    await expect(
      storage.transaction([], async (tx) => {
        await tx
          .execute((db) => insertWorkspace('').compile(db))
          .catch(() => 'caught');
        throw own;
      }),
    ).rejects.toBe(own);
  });

  it("runs without the application's plugins", async () => {
    const camel = database.db.withPlugin(new CamelCasePlugin());
    const query = sql`select 1 as "created_in"`;
    expect((await query.execute(camel)).rows).toEqual([{ createdIn: 1 }]);
    const rows = await createKyselyStorage(storageOptions(camel)).transaction(
      [],
      async (tx) => tx.execute((db) => query.compile(db)),
    );
    expect(rows).toEqual([{ created_in: 1 }]);
  });
});
