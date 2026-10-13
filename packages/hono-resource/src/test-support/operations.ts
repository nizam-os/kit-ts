/**
 * Requests to the operations endpoint of the tests' host (resource SPEC
 * 19.4), and the seeded rows they run over: two tasks of workspace 1 and
 * one of workspace 2. Not published with the package.
 */
import type { Hono } from 'hono';

import type { DeclaredResource } from '@nizam-os/resource-core';

import type { TestEnv } from './app';
import type { MemoryRuntime } from './memory-runtime';

import { ATOMIC_OPERATIONS_EXTENSION } from '@nizam-os/hono-jsonapi';

import { memoryRuntime } from './memory-runtime';
import { RESOURCES } from './resources';

/** The media type of an operations request and its response. */
export const ATOMIC: string = `application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"`;
export const TASK = '0b5a2d4e-6f0c-4f3e-9a1b-2c3d4e5f6a7b';
export const CHILD = '2d7c4f6a-8b2e-4b5a-9c3d-4e5f6a7b8c9d';
export const OTHER = '1c6b3e5f-7a1d-4a4f-8b2c-3d4e5f6a7b8c';
export const MISSING = '9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f';

/** The runtime of `resources` over the seeded rows. */
export function seeded(
  resources: ReadonlyArray<DeclaredResource> = RESOURCES,
): MemoryRuntime {
  return memoryRuntime(resources, {
    workspaces: [
      { id: '1', name: 'One' },
      { id: '2', name: 'Two' },
    ],
    tasks: [
      { id: TASK, title: 'Boot', done: false, workspace: '1', parent: null },
      { id: CHILD, title: 'Wire', done: false, workspace: '1', parent: TASK },
      { id: OTHER, title: 'Theirs', done: true, workspace: '2', parent: null },
    ],
  });
}

/** `POST /api/operations` of `operations`, as the member `name`, or as no member for `null`. */
export async function postOperations(
  app: Hono<TestEnv>,
  operations: ReadonlyArray<unknown>,
  name: string | null = 'ada',
): Promise<Response> {
  return app.request('/api/operations', {
    method: 'POST',
    headers: {
      'Content-Type': ATOMIC,
      Accept: ATOMIC,
      ...(name === null ? {} : { 'X-Member': name }),
    },
    body: JSON.stringify({ 'atomic:operations': operations }),
  });
}

/** An `update` of task `id`'s attributes. */
export function rename(
  id: string,
  title: string,
): Readonly<Record<string, unknown>> {
  return {
    op: 'update',
    ref: { type: 'tasks', id },
    data: { type: 'tasks', id, attributes: { title } },
  };
}

/** The status of `response`, and each error object's code and pointer. */
export async function refusal(
  response: Response,
): Promise<ReadonlyArray<unknown>> {
  const { errors } = (await response.json()) as {
    readonly errors: ReadonlyArray<{
      readonly code: string;
      readonly source?: { readonly pointer?: string };
    }>;
  };
  return [
    response.status,
    errors.map((error) => [error.code, error.source?.pointer]),
  ];
}

/** The title of each task the runtime holds, by id. */
export function titles(runtime: MemoryRuntime): Record<string, unknown> {
  return Object.fromEntries(
    [...(runtime.rows.get('tasks')?.values() ?? [])].map((row) => [
      row.id,
      row['title'],
    ]),
  );
}
