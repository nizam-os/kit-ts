/**
 * A runtime that breaks the contract (resource SPEC 12.10): one whose
 * domain lacks a resource it lists, or an operation a declaration
 * declares, fails the request with a `TypeError` that names it, which
 * the host's handler answers with 500.
 */
import type { ResourceRuntime } from '@nizam-os/resource-core/server';

import type { TestDomain } from './test-support/memory-runtime';

import { describe, expect, it } from 'vitest';

import { testApp } from './test-support/app';
import { memoryRuntime } from './test-support/memory-runtime';
import { RESOURCES } from './test-support/resources';

const TASK = '0b5a2d4e-6f0c-4f3e-9a1b-2c3d4e5f6a7b';
const ADA = { 'X-Member': 'ada', 'Content-Type': 'application/vnd.api+json' };

/** What the host's handler saw when `runtime` served `path`. */
async function failure(
  runtime: ResourceRuntime<TestDomain>,
  path: string,
  init: RequestInit = {},
): Promise<{ readonly status: number; readonly error: unknown }> {
  let error: unknown;
  const app = testApp(runtime, {
    onError: (thrown) => {
      error = thrown;
    },
  });
  const response = await app.request(path, { headers: ADA, ...init });
  return { status: response.status, error };
}

describe('a runtime that breaks the contract', () => {
  const runtime = memoryRuntime(RESOURCES, {
    workspaces: [{ id: '1', name: 'One' }],
    tasks: [
      { id: TASK, title: 'Boot', done: false, workspace: '1', parent: null },
    ],
  });

  it('fails a request for a resource its domain lacks', async () => {
    expect(await failure({ ...runtime, as: () => ({}) }, '/api/tasks')).toEqual(
      {
        status: 500,
        error: new TypeError(
          "jsonApiRoutes: the runtime's domain has no tasks, which it lists in resources",
        ),
      },
    );
  });

  it.each([
    ['list', '/api/tasks', {}],
    ['get', `/api/tasks/${TASK}`, {}],
    ['remove', `/api/tasks/${TASK}`, { method: 'DELETE' }],
    [
      'create',
      '/api/tasks',
      {
        method: 'POST',
        body: JSON.stringify({
          data: { type: 'tasks', attributes: { title: 'A' } },
        }),
      },
    ],
    [
      'update',
      `/api/tasks/${TASK}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          data: { type: 'tasks', id: TASK, attributes: {} },
        }),
      },
    ],
  ])(
    'fails a request for an operation it lacks: %s',
    async (name, path, init) => {
      const lacking = { ...runtime, as: () => ({ tasks: {} }) };
      expect(await failure(lacking, path, init)).toEqual({
        status: 500,
        error: new TypeError(
          `jsonApiRoutes: the runtime runs no ${name} of tasks, which its declaration declares`,
        ),
      });
    },
  );

  it('fails an include it lacks', async () => {
    const lacking = {
      ...runtime,
      as: (actor: TestDomain['actor']) => {
        const { include: _include, ...tasks } =
          runtime.as(actor)['tasks'] ?? {};
        return { tasks };
      },
    };
    expect(await failure(lacking, `/api/tasks/${TASK}?include=parent`)).toEqual(
      {
        status: 500,
        error: new TypeError(
          'jsonApiRoutes: the runtime runs no include of tasks, which its declaration declares',
        ),
      },
    );
  });
});
