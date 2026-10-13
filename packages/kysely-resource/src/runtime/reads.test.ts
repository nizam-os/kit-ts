/**
 * The reading operations (resource SPEC 18.4, 18.5): `list` asks the
 * policy, then pages the actor's scope; `get` reads the row, then asks the
 * policy with it; `include` asks the policy for the relationship, then
 * reads each linked row once, leaving out what the actor cannot see.
 */
import type { PublicRow } from '@nizam-os/resource-core/server';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { HIDDEN, member, testDomain } from '../test-support/domain';
import {
  domainDatabase,
  domainStorage,
  storedTask,
} from '../test-support/domain-database';
import { refusal } from '../test-support/refusal';

const statements: Array<string> = [];
const database = domainDatabase((event) => {
  statements.push(event.query.sql);
});
const storage = domainStorage(database.db);
const domain = testDomain(storage);
const titles = (rows: ReadonlyArray<PublicRow>) =>
  rows.map((row) => row['title']);

beforeEach(async () => {
  await database.reset();
  statements.length = 0;
});
afterAll(async () => {
  await database.close();
});

describe('list (resource SPEC 18.4)', () => {
  it("pages the actor's workspace, and counts it on request", async () => {
    for (const title of ['c', 'a', 'b']) {
      await storedTask(storage, title);
    }
    await storedTask(storage, 'other', { workspace: '2' });
    const tasks = domain(member('1')).tasks;
    const first = await tasks.list({ sort: ['title'] }, { total: true });
    expect(titles(first.rows)).toEqual(['a', 'b']);
    expect(first.total).toBe(3);
    const next = await tasks.list({
      sort: ['title'],
      page: { after: first.next ?? '' },
    });
    expect(titles(next.rows)).toEqual(['c']);
    expect(next.total).toBeUndefined();
  });

  it('answers FORBIDDEN without a detail when the policy denies', async () => {
    const { status, objects } = await refusal(
      domain(member('1', ['tasks:write'])).tasks.list(),
    );
    expect(status).toBe(403);
    expect(objects).toEqual([
      {
        id: expect.any(String),
        status: '403',
        code: 'FORBIDDEN',
        title: 'Forbidden',
      },
    ]);
  });

  it("answers a keyset refusal with the profile's error at its parameter", async () => {
    const tasks = domain(member('1')).tasks;
    const [size, sort, filter] = await Promise.all([
      refusal(tasks.list({ page: { size: 4 } })),
      refusal(tasks.list({ sort: ['points'] })),
      refusal(
        tasks.list({ filter: { field: 'points', op: 'eq', value: '1' } }),
      ),
    ]);
    expect(size.objects).toMatchObject([
      { code: 'MAX_PAGE_SIZE_EXCEEDED', meta: { page: { maxSize: 3 } } },
    ]);
    expect(sort.objects).toMatchObject([
      { code: 'UNSUPPORTED_SORT', source: { parameter: 'sort' } },
    ]);
    expect(filter.objects).toMatchObject([
      { code: 'INVALID_QUERY_PARAMETER', source: { parameter: 'filter' } },
    ]);
  });

  it('names a refused filter value at the parameter it came in, when the list is told', async () => {
    const tasks = domain(member('1')).tasks;
    const filter = {
      or: [
        { field: 'title', op: 'eq', value: ['a', 'b'] },
        { field: 'title', op: 'eq', value: 'c' },
      ],
    } as never;
    const parameters = [
      { path: ['or', 0], parameter: 'filter[or][0][title]' },
      { path: ['or', 1], parameter: 'filter[or][0][title][eq]' },
    ];
    const [named, unnamed] = await Promise.all([
      refusal(tasks.list({ filter }, { parameters })),
      refusal(tasks.list({ filter })),
    ]);
    expect(named.objects).toMatchObject([
      {
        code: 'INVALID_QUERY_PARAMETER',
        source: { parameter: 'filter[or][0][title]' },
      },
    ]);
    expect(unnamed.objects).toMatchObject([
      {
        code: 'INVALID_QUERY_PARAMETER',
        source: { parameter: 'filter[title][eq]' },
      },
    ]);
  });

  it('refuses a cursor issued in another workspace', async () => {
    for (const title of ['a', 'b', 'c']) {
      await storedTask(storage, title, { workspace: '2' });
    }
    const page = await domain(member('2')).tasks.list({ sort: ['title'] });
    const { status, objects } = await refusal(
      domain(member('1')).tasks.list({
        sort: ['title'],
        page: { after: page.next ?? '' },
      }),
    );
    expect(status).toBe(400);
    expect(objects).toMatchObject([
      { code: 'INVALID_QUERY_PARAMETER', source: { parameter: 'page[after]' } },
    ]);
  });
});

describe('get (resource SPEC 18.4)', () => {
  it('reads the row, then asks the policy with it, answering NOT_FOUND for every row it cannot give', async () => {
    const id = await storedTask(storage, 'a');
    const hidden = await storedTask(storage, HIDDEN);
    const other = await storedTask(storage, 'o', { workspace: '2' });
    const tasks = domain(member('1')).tasks;
    expect(await tasks.get(id)).toMatchObject({ id, title: 'a' });
    const refusals = await Promise.all([
      refusal(tasks.get(hidden)),
      refusal(tasks.get(other)),
      refusal(domain(member('1', ['tasks:write'])).tasks.get(id)),
    ]);
    expect(refusals.map(({ objects }) => objects[0]?.code)).toEqual([
      'NOT_FOUND',
      'NOT_FOUND',
      'NOT_FOUND',
    ]);
  });

  it("answers NOT_FOUND without a statement for an id outside the key's form, and reads one in it as the form outputs it", async () => {
    const id = await storedTask(storage, 'a');
    statements.length = 0;
    expect((await refusal(domain(member('1')).tasks.get('nope'))).status).toBe(
      404,
    );
    expect(statements).toEqual([]);
    expect(await domain(member('1')).tasks.get(id.toUpperCase())).toMatchObject(
      { id },
    );
  });
});

describe('include (resource SPEC 18.4)', () => {
  it('reads each linked row once, leaving out one the actor cannot see', async () => {
    const parent = await storedTask(storage, 'parent');
    const foreign = await storedTask(storage, 'foreign', { workspace: '2' });
    await storedTask(storage, 'one', { parent });
    await storedTask(storage, 'two', { parent });
    await storedTask(storage, 'stray', { parent: foreign });
    const tasks = domain(member('1')).tasks;
    const { rows } = await tasks.list({ sort: ['title'], page: { size: 3 } });
    expect(titles(rows)).toEqual(['one', 'parent', 'stray']);
    const all = [
      ...rows,
      ...(
        await tasks.list({ filter: { field: 'title', op: 'eq', value: 'two' } })
      ).rows,
    ];
    expect(titles(await tasks.include('parent', all))).toEqual(['parent']);
    expect(await tasks.include('workspace', all)).toMatchObject([
      { id: '1', name: 'One' },
    ]);
  });

  it('answers FORBIDDEN at the include parameter when the policy denies the relationship', async () => {
    const rows = [
      { id: '00000000-0000-4000-8000-000000000001', workspace: '1' },
    ];
    const tasks = domain(member('1', ['tasks:read'])).tasks;
    for (const relationship of ['workspace', 'nope']) {
      const { status, objects } = await refusal(
        tasks.include(relationship, rows),
      );
      expect(status).toBe(403);
      expect(objects).toMatchObject([
        {
          code: 'FORBIDDEN',
          detail: 'The relationship may not be included.',
          source: { parameter: 'include' },
        },
      ]);
    }
  });

  it("runs no statement when no row links to a row in the target key's form", async () => {
    const rows = [
      { id: '1', parent: null },
      { id: '2', parent: 'nope' },
      { id: '3' },
    ];
    expect(await domain(member('1')).tasks.include('parent', rows)).toEqual([]);
    expect(statements).toEqual([]);
  });
});
