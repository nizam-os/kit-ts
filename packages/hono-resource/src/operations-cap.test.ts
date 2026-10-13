/**
 * The cap of the operations endpoint (resource SPEC 19.4): the processor
 * takes the `atomic.max` the definer set on every definition, the value a
 * screen reads from the definition it imports, so a request over it is
 * the processor's 400 before any operation runs and one at it commits;
 * definitions whose caps differ are refused before anything is served.
 * The endpoint sits at the operations path of the links.
 * @ref https://jsonapi.org/ext/atomic/#processing
 */
import { describe, expect, it } from 'vitest';

import { createDeclareResource } from '@nizam-os/resource-core';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { jsonApiRoutes } from './routes';
import { memberOf, testApp } from './test-support/app';
import { memoryRuntime } from './test-support/memory-runtime';
import {
  CHILD,
  OTHER,
  TASK,
  postOperations,
  refusal,
  rename,
  seeded,
  titles,
} from './test-support/operations';
import { Tasks, Workspaces, testResources } from './test-support/resources';

const CAPPED = testResources({ max: 2 });
const SEEDED_TITLES = { [TASK]: 'Boot', [CHILD]: 'Wire', [OTHER]: 'Theirs' };

/** A definer over the storage contract's catalog, linked under `base`, whose definitions carry `max`. */
function definer(base: string, max?: number) {
  return createDeclareResource({
    catalog: contractFixture.catalog,
    codecs: contractFixture.codecs,
    links: { base },
    atomic: { max },
  });
}

describe('the cap of the operations endpoint (resource SPEC 19.4)', () => {
  it('refuses a request over the cap the definitions carry before any operation runs', async () => {
    const runtime = seeded(CAPPED);
    const response = await postOperations(testApp(runtime), [
      rename(TASK, 'Plan'),
      rename(CHILD, 'Ship'),
      rename(TASK, 'Done'),
    ]);
    expect(await refusal(response)).toEqual([
      400,
      [['INVALID_DOCUMENT', '/atomic:operations']],
    ]);
    expect(runtime.calls).toEqual([]);
    expect(titles(runtime)).toEqual(SEEDED_TITLES);
  });

  it('commits a request at the cap', async () => {
    const runtime = seeded(CAPPED);
    const response = await postOperations(testApp(runtime), [
      rename(TASK, 'Plan'),
      rename(CHILD, 'Ship'),
    ]);
    expect(response.status).toBe(200);
    expect(titles(runtime)).toEqual({
      ...SEEDED_TITLES,
      [TASK]: 'Plan',
      [CHILD]: 'Ship',
    });
  });

  it("refuses definitions whose caps differ with the processor's TypeError, before anything is served", () => {
    const Notes = definer('/api', 2)('logs', {
      operations: ['list'],
      fields: { note: { access: 'read' } },
    });
    expect(() =>
      jsonApiRoutes({
        runtime: memoryRuntime([Tasks, Workspaces, Notes]),
        actor: memberOf,
      }),
    ).toThrow(
      new TypeError(
        "operationsProcessor: the resources' definitions have different atomic.max (10, 2); one endpoint takes one cap",
      ),
    );
  });

  it('sits at the operations path of root-relative links', async () => {
    const Notes = definer('')('logs', {
      operations: ['list', 'create'],
      clientIds: true,
      fields: { note: { access: 'readWrite' } },
    });
    const app = testApp(memoryRuntime([Notes]));
    const response = await app.request('/operations', { method: 'GET' });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });
});
