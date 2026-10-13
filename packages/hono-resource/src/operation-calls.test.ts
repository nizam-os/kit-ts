/**
 * `OperationCalls` (resource SPEC 19.4): a refusal a call throws rejects
 * moved at once; anything else rejects as thrown, and the error the
 * transaction maps from it once it ended moves to the operation whose
 * call threw it.
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 */
import { describe, expect, it } from 'vitest';

import { errorObjects, isBanError, jsonApiError } from '@nizam-os/hono-jsonapi';

import { OperationCalls } from './operation-calls';
import { objectPath } from './pointers';

const TITLE = ['data', 'attributes', 'title'];

/** A move into operation `index`'s data. */
function into(index: number) {
  return (path: ReadonlyArray<string | number>) =>
    objectPath(path, ['atomic:operations', index, 'data']);
}

function conflict(path?: ReadonlyArray<string>) {
  return jsonApiError([
    {
      code: 'CONFLICT',
      status: 409,
      detail: 'Taken',
      ...(path === undefined ? {} : { path }),
    },
  ]);
}

/** `value` after a turn of the microtask queue, as a storage round trip settles. */
async function resolved<TValue>(value: TValue): Promise<TValue> {
  await Promise.resolve();
  return value;
}

/** A rejection with `reason` after a turn of the microtask queue. */
async function failing(reason: unknown): Promise<never> {
  await Promise.resolve();
  throw reason;
}

/** The pointer of each error object of `error`, a `BanError`. */
function pointers(error: unknown): ReadonlyArray<string | undefined> {
  if (!isBanError(error)) {
    throw new TypeError('expected a BanError');
  }
  return errorObjects(error).map((object) => object.source?.pointer);
}

describe('OperationCalls (resource SPEC 19.4)', () => {
  it("rejects a refusal moved into the operation's data at once", async () => {
    const calls = new OperationCalls();
    const outcome = await calls
      .run(2, into(2), async () => failing(conflict(TITLE)))
      .catch((error: unknown) => error);
    expect(pointers(outcome)).toEqual([
      '/atomic:operations/2/data/attributes/title',
    ]);
    const mapped = conflict(TITLE);
    expect(calls.settled(mapped)).toBe(mapped);
  });

  it('moves the error mapped from what a call threw to that call', async () => {
    const calls = new OperationCalls();
    expect(await calls.run(0, into(0), async () => resolved('done'))).toBe(
      'done',
    );
    const thrown = new Error('unique violation');
    const outcome = await calls
      .run(1, into(1), async () => failing(thrown))
      .catch((error: unknown) => error);
    expect(outcome).toBe(thrown);
    expect(pointers(calls.settled(conflict(TITLE)))).toEqual([
      '/atomic:operations/1/data/attributes/title',
    ]);
    expect(pointers(calls.settled(conflict()))).toEqual([
      '/atomic:operations/1',
    ]);
    expect(calls.settled(thrown)).toBe(thrown);
  });
});
