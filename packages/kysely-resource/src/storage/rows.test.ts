import type { TextCodec } from './types';

import { sql } from 'kysely';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { scopeValues } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { contractDatabase, storageOptions } from '../test-support/database';
import { createKyselyStorage } from './create-storage';
import { tableOf } from './sql';
import { readRow, writeText } from './values';

const { catalog, resources } = contractFixture;
const { tasks, workspaces } = resources;
const CREATOR = '00000000-0000-4000-8000-0000000000aa';
const inWorkspace = (workspace: string) =>
  scopeValues(contractFixture.scopes, { workspace });

const database = contractDatabase();
const storage = createKyselyStorage(storageOptions(database.db));

beforeEach(async () => {
  await database.reset();
});
afterAll(async () => {
  await database.close();
});

describe('row operations', () => {
  it('refuses an insert that returned no row, as a trigger that drops it makes', async () => {
    await database.exec(`
      create function drop_dropped() returns trigger language plpgsql as $$
        begin return case when new.name = 'Dropped' then null else new end; end $$;
      create trigger workspaces_drop before insert on workspaces
        for each row execute function drop_dropped();`);
    try {
      await expect(
        storage.transaction([], async (tx) =>
          storage.create(tx, workspaces, {
            attributes: { name: 'Dropped' },
            relationships: {},
          }),
        ),
      ).rejects.toThrow(new Error('workspaces: the insert returned no row'));
    } finally {
      await database.exec(
        'drop trigger workspaces_drop on workspaces; drop function drop_dropped();',
      );
    }
  });

  it('inserts default values for a create without members, which the database checks', async () => {
    const refused: unknown = await storage
      .transaction([], async (tx) =>
        storage.create(tx, workspaces, { attributes: {}, relationships: {} }),
      )
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({ code: '23502', column: 'name' });
  });

  it('refuses a write that names a member the resource does not have', async () => {
    await expect(
      storage.transaction(inWorkspace('1'), async (tx) =>
        storage.update(tx, tasks, '1', {
          attributes: { nope: 1 },
          relationships: {},
        }),
      ),
    ).rejects.toThrow(new Error('tasks has no member nope'));
  });

  it('counts every row of a resource without a scope', async () => {
    const counted = await storage.transaction(inWorkspace('1'), async (tx) =>
      storage.count(tx, workspaces, 'workspaces'),
    );
    expect(counted).toBe(3);
  });

  it('records nothing and needs no outbox for no events, and refuses events without one', async () => {
    const { outbox: _outbox, ...rest } = storageOptions(database.db);
    const bare = createKyselyStorage(rest);
    await bare.transaction([], async (tx) => bare.record(tx, []));
    await expect(
      bare.transaction([], async (tx) =>
        bare.record(tx, [{ name: 'task.created', version: 1, payload: {} }]),
      ),
    ).rejects.toThrow(
      new Error(
        'record: the storage has no outbox table; pass options.outbox to createKyselyStorage',
      ),
    );
  });

  it('reads and writes a codec field only through its storage codec', async () => {
    const { codecs: _codecs, ...rest } = storageOptions(database.db);
    const bare = createKyselyStorage(rest);
    const write = bare.transaction(inWorkspace('1'), async (tx) =>
      bare.create(tx, tasks, {
        attributes: { title: 'Located', location: { x: 1, y: 2 } },
        relationships: {},
        values: { created_by: CREATOR },
      }),
    );
    await expect(write).rejects.toThrow(new Error('no storage codec point'));
    await database.exec(`insert into tasks (workspace_id, title, location, created_by)
      values (1, 'Located', '(1,2)', '${CREATOR}');`);
    const read = bare.transaction(inWorkspace('1'), async (tx) =>
      tx
        .execute((db) =>
          sql<{
            id: string;
          }>`select id::text as "id" from tasks where title = 'Located'`.compile(
            db,
          ),
        )
        .then(async ([row]) => bare.get(tx, tasks, row?.id ?? '')),
    );
    await expect(read).rejects.toThrow(new Error('no storage codec point'));
  });

  it("refuses a storage codec's write that returns no text", () => {
    const location = tableOf(catalog, tasks).columns['location'];
    const meta = tasks.fields['location'];
    const broken: TextCodec = {
      read: (text) => text,
      write: () => 7 as unknown as string,
    };
    expect(location).toBeDefined();
    expect(() =>
      writeText({ catalog, codecs: { point: broken } }, location!, meta, {
        x: 1,
        y: 2,
      }),
    ).toThrow(
      new TypeError(
        'storage codec point: write returned a value that is not text',
      ),
    );
  });

  it('refuses a selected value or id that the driver did not return as text', () => {
    const context = { catalog, codecs: {} };
    const table = tableOf(catalog, workspaces);
    expect(() =>
      readRow(context, table, workspaces, {
        id: 10,
        name: 'Ten',
        createdIn: null,
      }),
    ).toThrow(
      new TypeError('workspaces: the driver returned an id that is not text'),
    );
    expect(() =>
      readRow(context, table, workspaces, {
        id: '10',
        name: 10,
        createdIn: null,
      }),
    ).toThrow(
      new TypeError(
        'workspaces.name: the driver returned a value that is not text',
      ),
    );
  });
});
