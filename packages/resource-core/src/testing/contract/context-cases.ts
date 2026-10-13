/**
 * The case of obligation 12 (SPEC 12.8): `list` binds its cursors to the
 * transaction's scope values. Two workspaces asking for the same page send
 * the same request, so only the context tells their cursors apart: a
 * cursor of workspace 1's pages, sent in workspace 2 with the same
 * request, must be refused with keyset-core's `INVALID_CURSOR`, reason
 * `context`, and still page in workspace 1.
 * @ref https://github.com/nizam-os/kit/blob/main/docs/keyset/adr/0015-cursors-bound-to-a-caller-context.md
 * @packageDocumentation
 */
import type { Contract } from './context';
import type { ContractCase } from './types';

import { assertEqual, rejection } from './assert';
import { createListTasks } from './list-data';
import {
  keysetCode,
  keysetReason,
  labels,
  listPage,
  present,
  taskListing,
} from './list-walk';

/** The case of obligation 12. */
export function contextCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const { harness, tasks, within } = contract;
  const inOne = taskListing(contract);
  return [
    {
      name: 'obligation 12: a cursor issued in one scope is refused in another',
      run: async () => {
        await createListTasks(contract);
        const first = await listPage(
          inOne,
          { page: { size: 2 } },
          'the first page of workspace 1',
        );
        const after = present(
          first.next,
          'next of the first page of workspace 1',
        );
        const what = "workspace 1's cursor in workspace 2";
        const error = await rejection(
          within('2', async (tx) =>
            harness.adapter.list(tx, tasks, { page: { size: 2, after } }),
          ),
          what,
        );
        assertEqual(keysetCode(error), 'INVALID_CURSOR', `the code of ${what}`);
        assertEqual(keysetReason(error), 'context', `the reason of ${what}`);
        const second = await listPage(
          inOne,
          { page: { size: 2, after } },
          "workspace 1's cursor in workspace 1",
        );
        assertEqual(
          labels(inOne, second),
          ['echo alpha', 'charlie'],
          "the page after workspace 1's cursor, in workspace 1",
        );
      },
    },
  ];
}
