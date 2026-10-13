/**
 * The first failure of `transaction(actor, work)` (resource SPEC 12.10,
 * 18.4, 18.5) on PGlite: it rolls everything back, ends the transaction
 * at once, rejects its call with what it threw, and rejects `transaction`
 * with it mapped once the transaction ended, unless `work` rejected with
 * another value.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { isBanError } from '@nizam-os/ban-core';
import { Rejection } from '@nizam-os/resource-core/server';

import { LOCKED, member, memberApi } from '../test-support/domain';
import { outboxEvents } from '../test-support/domain-database';
import { refusal } from '../test-support/refusal';
import { transactionHarness } from '../test-support/transaction';
import { createDomain } from './domain';

const harness = transactionHarness();

beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness.database.close();
});

describe('transaction: the first failure (resource SPEC 12.10, 18.5)', () => {
  it('rolls back, rejecting its call with what it threw and transaction with its error', async () => {
    const thrown: Array<unknown> = [];
    const { status, objects } = await refusal(
      harness.transaction(member('1'), async (domain) => {
        await domain.tasks.create({ attributes: { title: 'Kept?' } });
        await domain.tasks
          .create({ attributes: { title: LOCKED } })
          .catch((error: unknown) => {
            thrown.push(error);
            throw error;
          });
      }),
    );
    expect(thrown[0]).toBeInstanceOf(Rejection);
    expect(status).toBe(409);
    expect(objects).toMatchObject([
      { code: 'TASK_LOCKED', source: { pointer: '/data/attributes/title' } },
    ]);
    expect(await harness.titles()).toEqual([]);
    expect(await outboxEvents(harness.database.db)).toEqual([]);
    expect(harness.committed).toEqual([]);
  });

  it('rolls back when work catches the failure and resolves, and refuses every later call', async () => {
    const later: Array<unknown> = [];
    const { objects } = await refusal(
      harness.transaction(member('1'), async (domain) => {
        await domain.tasks.create({ attributes: { title: 'Kept?' } });
        await domain.tasks
          .create({ attributes: { title: LOCKED } })
          .catch(() => null);
        later.push(await domain.tasks.list().catch((error: unknown) => error));
        return 'done';
      }),
    );
    expect(objects).toMatchObject([{ code: 'TASK_LOCKED' }]);
    expect(later).toEqual([
      new TypeError(
        'transaction: an operation was called after an earlier one failed, which ended the transaction',
      ),
    ]);
    expect(await harness.titles()).toEqual([]);
  });

  it('rejects with what work rejected with when that is another value', async () => {
    const own = new Error('operation 1 failed');
    await expect(
      harness.transaction(member('1'), async (domain) => {
        await domain.tasks.create({ attributes: { title: 'Kept?' } });
        await domain.tasks
          .create({ attributes: { title: LOCKED } })
          .catch(() => {
            throw own;
          });
      }),
    ).rejects.toBe(own);
    expect(await harness.titles()).toEqual([]);
  });

  it("maps a constraint violation once it ended, a partition's with its partitioned table's code", async () => {
    const log = {
      id: '1007',
      attributes: { note: 'once' },
      relationships: { owner: { type: 'workspaces', id: '1' } },
    };
    const thrown: Array<unknown> = [];
    const { status, objects } = await refusal(
      harness.transaction(member('1'), async (domain) => {
        await domain.logs.create(log);
        await domain.logs.create(log).catch((error: unknown) => {
          thrown.push(error);
          throw error;
        });
      }),
    );
    expect(isBanError(thrown[0])).toBe(false);
    expect(thrown[0]).toMatchObject({ code: '23505' });
    expect(status).toBe(409);
    expect(objects).toMatchObject([
      { code: 'LOGS_PKEY', source: { pointer: '/data/id' } },
    ]);
  });

  it('answers a refusal raised before the lifecycle runs as it is', async () => {
    const { status, objects } = await refusal(
      harness.transaction(member('1'), async (domain) =>
        domain.tasks.create({ attributes: { title: '' } }),
      ),
    );
    expect(status).toBe(422);
    expect(objects).toMatchObject([
      { source: { pointer: '/data/attributes/title' } },
    ]);
  });

  it("maps a list's refused filter value once it ended, at the parameter it came in", async () => {
    const thrown: Array<unknown> = [];
    const { objects } = await refusal(
      harness.transaction(member('1'), async (domain) =>
        domain.tasks
          .list(
            {
              filter: { field: 'title', op: 'eq', value: ['a', 'b'] } as never,
            },
            { parameters: [{ path: [], parameter: 'filter[title]' }] },
          )
          .catch((error: unknown) => {
            thrown.push(error);
            throw error;
          }),
      ),
    );
    expect(isBanError(thrown[0])).toBe(false);
    expect(objects).toMatchObject([
      {
        code: 'INVALID_QUERY_PARAMETER',
        source: { parameter: 'filter[title]' },
      },
    ]);
  });

  it('rolls back when a call still pending as work resolves fails', async () => {
    const { objects } = await refusal(
      harness.transaction(member('1'), async (domain) => {
        await domain.tasks.create({ attributes: { title: 'Kept?' } });
        void domain.tasks
          .create({ attributes: { title: LOCKED } })
          .catch(() => null);
      }),
    );
    expect(objects).toMatchObject([{ code: 'TASK_LOCKED' }]);
    expect(await harness.titles()).toEqual([]);
  });

  it('ends at the first failure, releasing its connection while work goes on', async () => {
    const outside = createDomain(harness.options);
    const seen: Array<ReadonlyArray<string>> = [];
    await refusal(
      harness.transaction(member('1'), async (domain) => {
        await domain.tasks.create({ attributes: { title: 'Kept?' } });
        await domain.tasks
          .create({ attributes: { title: LOCKED } })
          .catch(() => null);
        // PGlite has one connection: this transaction of its own waits for it
        const page = await memberApi(outside(member('1'))).tasks.list();
        seen.push(page.rows.map((row) => String(row['title'])));
      }),
    );
    expect(seen).toEqual([[]]);
  });

  it('rolls back when work rejects and no operation failed', async () => {
    const changed = new Error('changed my mind');
    await expect(
      harness.transaction(member('1'), async (domain) => {
        await domain.tasks.create({ attributes: { title: 'Kept?' } });
        throw changed;
      }),
    ).rejects.toBe(changed);
    expect(await harness.titles()).toEqual([]);
    expect(harness.committed).toEqual([]);
  });
});
