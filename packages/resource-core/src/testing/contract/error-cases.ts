/**
 * The cases of obligation 6 (SPEC 12.8): a PostgreSQL error raised inside
 * an operation reaches the runtime with its fields, as thrown or as the
 * `cause` of what is thrown, after the transaction rolled back, so
 * `constraintError` (SPEC 9.5) gives the declared error: the code, its
 * status, and an item per member under `/data`.
 * @packageDocumentation
 */
import type { BanError } from '@nizam-os/ban-core';

import type { DeclaredResource } from '../../declare/declared-resource';
import type { Operation } from '../../declare/types';
import type { Contract } from './context';
import type { ContractCase } from './types';

import { constraintError } from '../../server/constraint-error';
import { assertEqual, assertThat, ContractFailure, rejection } from './assert';
import { MISSING, taskCreate, taskUpdate } from './context';

/** What a case expects of the error: the code, the status, and each item's path. */
interface Expected {
  readonly code: string;
  readonly status: number;
  readonly paths: ReadonlyArray<ReadonlyArray<string>>;
}

const TITLE_CHECK: Expected = {
  code: 'TASKS_TITLE_CHECK',
  status: 422,
  paths: [['data', 'attributes', 'title']],
};

/** Checks that `thrown` maps to `expected` for `operation` on `tasks`. */
function assertDeclared(
  tasks: DeclaredResource,
  thrown: unknown,
  operation: Operation,
  expected: Expected,
): void {
  const error: BanError | undefined = constraintError(thrown, {
    resource: tasks,
    operation,
  });
  if (error === undefined) {
    throw new ContractFailure(
      `constraintError found no declared error in what the ${operation} rejected with`,
      { cause: thrown },
    );
  }
  assertEqual(
    {
      code: error.code,
      status: error.status,
      paths: error.errors?.map((item) => item.path) ?? [],
    },
    expected,
    `the error of the ${operation}`,
  );
}

/** The cases of obligation 6. */
export function errorCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const { harness, tasks, within } = contract;
  const { adapter } = harness;
  const failedCreate = async (
    workspace: string,
    write: Parameters<typeof taskCreate>[0],
  ): Promise<unknown> =>
    rejection(
      within(workspace, async (tx) =>
        adapter.create(tx, tasks, taskCreate(write)),
      ),
      'a create the database refuses',
    );
  return [
    {
      name: 'obligation 6: a CHECK violation reaches constraintError',
      run: async () => {
        const thrown = await failedCreate('1', { attributes: { title: '' } });
        assertDeclared(tasks, thrown, 'create', TITLE_CHECK);
        const task = await contract.createTask('1', {
          attributes: { title: 'Titled' },
        });
        const updated = await rejection(
          within('1', async (tx) =>
            adapter.update(
              tx,
              tasks,
              task.id,
              taskUpdate({ attributes: { title: '' } }),
            ),
          ),
          'an update the database refuses',
        );
        assertDeclared(tasks, updated, 'update', TITLE_CHECK);
      },
    },
    {
      name: 'obligation 6: a unique violation reaches constraintError, within the scope',
      run: async () => {
        await contract.createTask('1', { attributes: { title: 'Twice' } });
        const thrown = await failedCreate('1', {
          attributes: { title: 'Twice' },
        });
        assertDeclared(tasks, thrown, 'create', {
          code: 'TASKS_WORKSPACE_ID_TITLE_KEY',
          status: 409,
          paths: [['data', 'attributes', 'title']],
        });
        const elsewhere = await contract.createTask('2', {
          attributes: { title: 'Twice' },
        });
        assertEqual(
          elsewhere['title'],
          'Twice',
          'the same title in workspace 2',
        );
      },
    },
    {
      name: 'obligation 6: a duplicate client id reaches constraintError',
      run: async () => {
        const id = '7d444840-9dc0-41a5-8e6a-2b1f3c4d5e6f';
        await contract.createTask('1', {
          id,
          attributes: { title: 'Original' },
        });
        const thrown = await failedCreate('1', {
          id,
          attributes: { title: 'Copy' },
        });
        assertDeclared(tasks, thrown, 'create', {
          code: 'TASKS_PKEY',
          status: 409,
          paths: [['data', 'id']],
        });
      },
    },
    {
      name: 'obligation 6: a foreign key violation reaches constraintError',
      run: async () => {
        const thrown = await failedCreate('1', {
          attributes: { title: 'Orphan' },
          relationships: { parent: MISSING },
        });
        assertDeclared(tasks, thrown, 'create', {
          code: 'TASKS_PARENT_ID_FKEY',
          status: 404,
          paths: [['data', 'relationships', 'parent']],
        });
      },
    },
    {
      name: 'obligation 6: removing a referenced row reaches constraintError as CONFLICT',
      run: async () => {
        const parent = await contract.createTask('1', {
          attributes: { title: 'Parent' },
        });
        await contract.createTask('1', {
          attributes: { title: 'Child' },
          relationships: { parent: parent.id },
        });
        const thrown = await rejection(
          within('1', async (tx) => adapter.remove(tx, tasks, parent.id)),
          'a remove of a task another task references',
        );
        const error = constraintError(thrown, {
          resource: tasks,
          operation: 'remove',
        });
        assertEqual(
          { code: error?.code, status: error?.status },
          { code: 'CONFLICT', status: 409 },
          'the error of the remove',
        );
        assertEqual(
          await contract.getTask('1', parent.id),
          parent,
          'the referenced task afterwards',
        );
      },
    },
    {
      name: "obligation 6: a refused statement rejects its transaction and rolls back the transaction's earlier writes",
      run: async () => {
        const created: Array<string> = [];
        const thrown = await rejection(
          within('1', async (tx) => {
            const row = await adapter.create(
              tx,
              tasks,
              taskCreate({ attributes: { title: 'Earlier' } }),
            );
            created.push(row.id);
            return adapter.create(
              tx,
              tasks,
              taskCreate({ attributes: { title: '' } }),
            );
          }),
          'a transaction whose second create the database refuses',
        );
        assertDeclared(tasks, thrown, 'create', TITLE_CHECK);
        assertThat(created.length === 1, 'the first create succeeded');
        for (const id of created) {
          assertEqual(
            await contract.getTask('1', id),
            undefined,
            'the task the transaction created before the refused statement',
          );
        }
      },
    },
  ];
}
