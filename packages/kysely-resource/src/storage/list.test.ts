import type {
  PublicRow,
  StorageListRequest,
} from '@nizam-os/resource-core/server';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { scopeValues } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { contractDatabase, storageOptions } from '../test-support/database';
import { createKyselyStorage } from './create-storage';

const { tasks, workspaces } = contractFixture.resources;
const CREATOR = '00000000-0000-4000-8000-0000000000aa';
const inWorkspace = (workspace: string) =>
  scopeValues(contractFixture.scopes, { workspace });
const titles = (rows: ReadonlyArray<PublicRow>) =>
  rows.map((row) => row['title']);

const statements: Array<string> = [];
const database = contractDatabase([], (event) => {
  statements.push(event.query.sql);
});
const storage = createKyselyStorage(storageOptions(database.db));
const created = new Map<string, string>();

beforeEach(async () => {
  await database.reset();
  const tasksOf: ReadonlyArray<readonly [string, string, boolean]> = [
    ['1', 'a', true],
    ['1', 'b', false],
    ['1', 'c', true],
    ['1', 'd', true],
    ['2', 'other', true],
  ];
  for (const [workspace, title, done] of tasksOf) {
    const row = await storage.transaction(inWorkspace(workspace), async (tx) =>
      storage.create(tx, tasks, {
        attributes: { title, done },
        relationships: {},
        values: { created_by: CREATOR },
      }),
    );
    created.set(title, row.id);
  }
});
afterAll(async () => {
  await database.close();
});

describe('the order of list (SPEC 18.2, keyset ADR 0016, ADR 0020)', () => {
  it('places nulls on a nullable key only, so a plain index matches the order', async () => {
    statements.length = 0;
    await storage.transaction(inWorkspace('1'), async (tx) => {
      await storage.list(tx, tasks, { sort: ['-title'], page: { size: 2 } });
      await storage.list(tx, tasks, { sort: ['-points'], page: { size: 2 } });
    });
    const orders = statements
      .filter((statement) => statement.includes(' limit '))
      .map((statement) => statement.slice(statement.indexOf(' order by ')));
    expect(orders).toEqual([
      expect.stringMatching(
        /^ order by "tasks"\."title" desc, "tasks"\."id" asc limit \$\d+$/u,
      ),
      expect.stringMatching(
        /^ order by "tasks"\."points" desc nulls last, "tasks"\."id" asc limit \$\d+$/u,
      ),
    ]);
  });

  it("runs the seek's branches as one select each under union all, ordered by the keys' values", async () => {
    const after = await storage.transaction(inWorkspace('1'), async (tx) => {
      const page = await storage.list(tx, tasks, {
        sort: ['title'],
        page: { size: 2 },
      });
      return page.next ?? '';
    });
    statements.length = 0;
    const rows = await storage.transaction(inWorkspace('1'), async (tx) => {
      const page = await storage.list(tx, tasks, {
        sort: ['title'],
        page: { size: 2, after },
      });
      return page.rows;
    });
    expect(titles(rows)).toEqual(['c', 'd']);
    const order = 'order by "tasks"\\."title" asc, "tasks"\\."id" asc';
    expect(
      statements.find((statement) => statement.includes(' limit ')),
    ).toMatch(
      new RegExp(
        [
          `^\\(select .+, cast\\("tasks"\\."title" as text\\) as "\\.keyset0", "tasks"\\."title" as "\\.keyset0v", cast\\("tasks"\\."id" as text\\) as "\\.keyset1", "tasks"\\."id" as "\\.keyset1v" from .+ and \\("tasks"\\."title" > \\$2\\) ${order} limit \\$3\\)`,
          `union all \\(select .+ and \\(\\("tasks"\\."title" = \\$5 and "tasks"\\."id" > \\$6\\)\\) ${order} limit \\$7\\)`,
          'order by "\\.keyset0v" asc, "\\.keyset1v" asc limit \\$8$',
        ].join(' '),
        'u',
      ),
    );
  });
});

describe('the total of list (SPEC 18.2)', () => {
  const done: StorageListRequest = {
    filter: { field: 'done', op: 'eq', value: true },
    sort: ['title'],
    page: { size: 2 },
  };

  it('counts the rows of the scope the filter selects, the same on every page', async () => {
    const [first, second] = await storage.transaction(
      inWorkspace('1'),
      async (tx) => {
        const page = await storage.list(tx, tasks, done, { total: true });
        const next = await storage.list(
          tx,
          tasks,
          { ...done, page: { size: 2, after: page.next ?? '' } },
          { total: true },
        );
        return [page, next];
      },
    );
    expect([titles(first.rows), first.total]).toEqual([['a', 'c'], 3]);
    expect([titles(second.rows), second.total]).toEqual([['d'], 3]);
  });

  it('counts nothing unless asked', async () => {
    const page = await storage.transaction(inWorkspace('1'), async (tx) =>
      storage.list(tx, tasks, done),
    );
    expect(page.total).toBeUndefined();
  });
});

describe('many (SPEC 18.4)', () => {
  it("reads the rows of the given ids in the transaction's scope, each once", async () => {
    const ids = ['a', 'c', 'other', 'a'].map(
      (title) => created.get(title) ?? '',
    );
    const rows = await storage.transaction(inWorkspace('1'), async (tx) =>
      storage.many(tx, tasks, ids),
    );
    expect(titles(rows)).toHaveLength(2);
    expect(new Set(titles(rows))).toEqual(new Set(['a', 'c']));
  });

  it('reads rows by a key of another type, without a scope', async () => {
    const rows = await storage.transaction(inWorkspace('1'), async (tx) =>
      storage.many(tx, workspaces, ['2', '9', '404']),
    );
    expect(rows.map((row) => row.id).toSorted()).toEqual(['2', '9']);
  });

  it('reads nothing for no ids', async () => {
    const rows = await storage.transaction(inWorkspace('1'), async (tx) =>
      storage.many(tx, tasks, []),
    );
    expect(rows).toEqual([]);
  });
});
