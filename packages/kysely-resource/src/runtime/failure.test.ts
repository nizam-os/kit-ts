import type { StorageWrite } from '@nizam-os/resource-core/server';

import { sql } from 'kysely';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { BanError } from '@nizam-os/ban-core';
import { errorObjects } from '@nizam-os/jsonapi-core';
import {
  quotaExceeded,
  Rejection,
  scopeValues,
} from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { createKyselyStorage } from '../storage/create-storage';
import { contractDatabase, storageOptions } from '../test-support/database';
import { operationFailure } from './failure';

const { tasks, logs } = contractFixture.resources;
const CREATOR = '00000000-0000-4000-8000-0000000000aa';
const PARENT = '00000000-0000-4000-8000-000000000001';
const APP_ERRORS = {
  TASK_LOCKED: { status: 409, title: 'Task Locked' },
} as const;
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

/** What running `run` in workspace 1 rejected with. */
async function thrownBy(
  run: Parameters<typeof storage.transaction>[1],
): Promise<unknown> {
  return storage.transaction(inWorkspace('1'), run).then(
    () => {
      throw new Error('the operation succeeded');
    },
    (error: unknown) => error,
  );
}

/** A task titled `title`, with `id` when given. */
function taskWrite(title: string, id?: string): StorageWrite {
  return {
    ...(id === undefined ? {} : { id }),
    attributes: { title },
    relationships: {},
    values: { created_by: CREATOR },
  };
}

/** Creates `write` in workspace 1. */
async function create(
  resource: typeof tasks,
  write: StorageWrite,
): Promise<void> {
  await storage.transaction(inWorkspace('1'), async (tx) =>
    storage.create(tx, resource, write),
  );
}

/** The error objects `operationFailure` makes of `thrown`. */
async function failureOf(
  thrown: unknown,
  options: {
    resource?: typeof tasks;
    operation?: 'create' | 'remove' | 'list';
    pointer?: string;
  } = {},
) {
  const error = await operationFailure(thrown, {
    storage,
    resource: options.resource ?? tasks,
    operation: options.operation ?? 'create',
    errors: APP_ERRORS,
    pointer: options.pointer,
  });
  expect(error).toBeInstanceOf(BanError);
  return { error: error as BanError, objects: errorObjects(error as BanError) };
}

describe('operationFailure (resource SPEC 18.5)', () => {
  it("a rule's rejection is its code's error, with an item at each member it names", async () => {
    const rejection = new Rejection('TASK_LOCKED', {
      fields: ['title'],
      detail: 'The task is locked.',
    });
    const { error, objects } = await failureOf(rejection, {
      operation: 'create',
    });
    expect(error.status).toBe(409);
    expect(objects).toMatchObject([
      {
        code: 'TASK_LOCKED',
        detail: 'The task is locked.',
        source: { pointer: '/data/attributes/title' },
      },
    ]);
  });

  it("a keyset refusal is the profile's error", async () => {
    const thrown = await thrownBy(async (tx) =>
      storage.list(tx, tasks, { page: { size: 4 } }),
    );
    const { error, objects } = await failureOf(thrown, { operation: 'list' });
    expect(error.status).toBe(400);
    expect(objects).toMatchObject([
      { code: 'MAX_PAGE_SIZE_EXCEEDED', meta: { page: { maxSize: 3 } } },
    ]);
  });

  it('a unique violation is its declared 409 at the member, the driver error kept as the cause', async () => {
    await create(tasks, taskWrite('Twice'));
    const thrown = await thrownBy(async (tx) =>
      storage.create(tx, tasks, taskWrite('Twice')),
    );
    const { error, objects } = await failureOf(thrown);
    expect(error.status).toBe(409);
    expect(error.cause).toBe(thrown);
    expect(objects).toMatchObject([
      {
        code: 'TASKS_WORKSPACE_ID_TITLE_KEY',
        source: { pointer: '/data/attributes/title' },
      },
    ]);
    const atomic = await failureOf(thrown, {
      pointer: '/atomic:operations/2/data',
    });
    expect(atomic.objects[0]?.source).toEqual({
      pointer: '/atomic:operations/2/data/attributes/title',
    });
  });

  it("a violation a partition raised is the partitioned table's code", async () => {
    const write: StorageWrite = {
      id: '1007',
      attributes: { note: 'First' },
      relationships: { owner: '1' },
    };
    await create(logs, write);
    const thrown = await thrownBy(async (tx) =>
      storage.create(tx, logs, write),
    );
    const { objects } = await failureOf(thrown, { resource: logs });
    expect(objects).toMatchObject([
      { code: 'LOGS_PKEY', source: { pointer: '/data/id' } },
    ]);
  });

  it('a remove another row still references is CONFLICT, without items', async () => {
    await create(tasks, taskWrite('Parent', PARENT));
    await storage.transaction(inWorkspace('1'), async (tx) =>
      tx.execute((db) =>
        sql`insert into tasks (workspace_id, title, created_by, parent_id) values (1, 'Child', ${CREATOR}, ${PARENT})`.compile(
          db,
        ),
      ),
    );
    const thrown = await thrownBy(async (tx) =>
      storage.remove(tx, tasks, PARENT),
    );
    const { error, objects } = await failureOf(thrown, { operation: 'remove' });
    expect(error.status).toBe(409);
    expect(objects).toMatchObject([
      { code: 'CONFLICT', detail: 'The resource is still referenced.' },
    ]);
  });

  it('anything else stays as thrown: a client error already made, a statement error, a lost connection', async () => {
    const quota = quotaExceeded(3, 3);
    const statement = await thrownBy(async (tx) =>
      tx.execute((db) => sql`select * from no_such_table`.compile(db)),
    );
    const lost = new Error('Connection terminated unexpectedly');
    for (const thrown of [quota, statement, lost]) {
      expect(
        await operationFailure(thrown, {
          storage,
          resource: tasks,
          operation: 'create',
          errors: APP_ERRORS,
        }),
      ).toBe(thrown);
    }
  });
});
