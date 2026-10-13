/**
 * Relationship targets (resource SPEC 9.5, 12.3): PostgreSQL checks a
 * foreign key without row security, so the runtime looks every target a
 * write names up in the actor's scope first, and answers one it does not
 * find exactly as the foreign key answers a missing one.
 */
import type { ErrorObject } from '@nizam-os/jsonapi-core';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { LOCKED, member, testDomain } from '../test-support/domain';
import {
  domainDatabase,
  domainStorage,
  storedTask,
  taskTitles,
} from '../test-support/domain-database';
import { refusal } from '../test-support/refusal';

const database = domainDatabase();
const storage = domainStorage(database.db);
const domain = testDomain(storage);
const MISSING = '00000000-0000-4000-8000-0000000000ff';
/** The seed's task in workspace 9, whose `starts_at` is `infinity`, a value without a read form. */
const UNREADABLE = '00000000-0000-4000-8000-000000000009';
const CLIENT_ID = '00000000-0000-4000-8000-00000000000c';

beforeEach(async () => {
  await database.reset();
});
afterAll(async () => {
  await database.close();
});

const owner = (id: string) => ({ owner: { type: 'workspaces', id } });
const parent = (id: string | null) => ({
  parent: id === null ? null : { type: 'tasks', id },
});

/** What a client receives, which every occurrence of an error shares. */
function received(objects: ReadonlyArray<ErrorObject>) {
  return objects.map(({ id: _occurrence, ...object }) => object);
}

describe('relationship targets (resource SPEC 12.3)', () => {
  it("answers a create naming another workspace's row as one naming a missing row, writing nothing", async () => {
    const foreign = await storedTask(storage, 'foreign', { workspace: '2' });
    const tasks = domain(member('1')).tasks;
    const [elsewhere, missing] = await Promise.all([
      refusal(
        tasks.create({
          attributes: { title: 'a' },
          relationships: parent(foreign),
        }),
      ),
      refusal(
        tasks.create({
          attributes: { title: 'b' },
          relationships: parent(MISSING),
        }),
      ),
    ]);
    expect(elsewhere.status).toBe(404);
    expect(received(elsewhere.objects)).toEqual([
      {
        status: '404',
        code: 'TASKS_PARENT_ID_FKEY',
        title: 'Related Resource Not Found',
        detail: 'The related resource does not exist.',
        source: { pointer: '/data/relationships/parent' },
      },
    ]);
    expect(received(elsewhere.objects)).toEqual(received(missing.objects));
    expect(await taskTitles(database.db, '1')).toEqual([]);
  });

  it("answers an update naming another workspace's row the same way, changing nothing", async () => {
    const id = await storedTask(storage, 'a');
    const foreign = await storedTask(storage, 'foreign', { workspace: '2' });
    const { status, objects } = await refusal(
      domain(member('1')).tasks.update(id, {
        attributes: { title: 'b' },
        relationships: parent(foreign),
      }),
    );
    expect(status).toBe(404);
    expect(objects[0]?.code).toBe('TASKS_PARENT_ID_FKEY');
    expect(await domain(member('1')).tasks.get(id)).toMatchObject({
      title: 'a',
      parent: null,
    });
  });

  it('takes a target of its own workspace, a cleared one, and the row a create names by its own id', async () => {
    const tasks = domain(member('1')).tasks;
    const mother = await storedTask(storage, 'mother');
    const child = await tasks.create({
      attributes: { title: 'child' },
      relationships: parent(mother),
    });
    expect(child['parent']).toBe(mother);
    const cleared = await tasks.update(child.id, {
      relationships: parent(null),
    });
    expect(cleared['parent']).toBeNull();
    const itself = await tasks.create({
      id: CLIENT_ID,
      attributes: { title: 'itself' },
      relationships: parent(CLIENT_ID),
    });
    expect(itself['parent']).toBe(CLIENT_ID);
  });

  it('finds a target without reading its columns, so one without a read form is found', async () => {
    const row = await domain(member('9')).tasks.create({
      attributes: { title: 'after forever' },
      relationships: parent(UNREADABLE),
    });
    expect(row['parent']).toBe(UNREADABLE);
  });

  it("looks up an unscoped resource's row too", async () => {
    const logs = domain(member('1')).logs;
    await expect(
      logs.create({
        id: '1',
        attributes: { note: 'kept' },
        relationships: owner('2'),
      }),
    ).resolves.toMatchObject({ owner: '2' });
    const { objects } = await refusal(
      logs.create({
        id: '2',
        attributes: { note: 'lost' },
        relationships: owner('404'),
      }),
    );
    expect(objects).toMatchObject([
      {
        code: 'LOGS_OWNER_ID_FKEY',
        source: { pointer: '/data/relationships/owner' },
      },
    ]);
  });

  it('looks targets up only once the policy allowed the write, so a refused actor learns nothing of them', async () => {
    const foreign = await storedTask(storage, 'foreign', { workspace: '2' });
    const { objects } = await refusal(
      domain(member('1', ['tasks:read'])).tasks.create({
        attributes: { title: 'a' },
        relationships: parent(foreign),
      }),
    );
    expect(objects[0]?.code).toBe('FORBIDDEN');
  });

  it('looks targets up once the rules passed, so a rejected write learns nothing of them', async () => {
    const foreign = await storedTask(storage, 'foreign', { workspace: '2' });
    const { objects } = await refusal(
      domain(member('1')).tasks.create({
        attributes: { title: LOCKED },
        relationships: parent(foreign),
      }),
    );
    expect(objects[0]?.code).toBe('TASK_LOCKED');
  });

  it("looks targets up before the quota's lock, so a full workspace answers a missing target first", async () => {
    const full = testDomain(storage, { services: { taskLimit: 0 } });
    const { objects } = await refusal(
      full(member('1')).tasks.create({
        attributes: { title: 'a' },
        relationships: parent(MISSING),
      }),
    );
    expect(objects[0]?.code).toBe('TASKS_PARENT_ID_FKEY');
    const untargeted = await refusal(
      full(member('1')).tasks.create({ attributes: { title: 'b' } }),
    );
    expect(untargeted.objects[0]?.code).toBe('QUOTA_EXCEEDED');
  });
});
