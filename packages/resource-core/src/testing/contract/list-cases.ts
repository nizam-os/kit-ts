/**
 * The cases of obligation 5 (SPEC 12.8) about what `list` holds: pages by
 * the declared resource's keyset definition and `@nizam-os/keyset-core`'s
 * planner, filters and sorts addressed by public names. Over the tasks of
 * `list-data.ts`, each request walked through every page both ways: the
 * declared default sort; each sortable field in both directions, nulls
 * last, ties broken by the key; each declared operator on its keyset type;
 * and search through the generated `tsvector` in websearch mode, with a
 * filter. Over logs, a relationship filtered by its foreign key.
 * @packageDocumentation
 */
import type { StorageListRequest } from '../../server/storage';
import type { Contract } from './context';
import type { Listed } from './list-requests';
import type { ContractCase } from './types';

import { assertEqual } from './assert';
import { createListLogs, createListTasks, DEFAULT_ORDER } from './list-data';
import { FILTERS, SORTS } from './list-requests';
import { logListing, taskListing, walk } from './list-walk';

const SEARCHES: ReadonlyArray<Listed<StorageListRequest>> = [
  { request: { search: 'alpha' }, titles: ['alpha', 'echo alpha'] },
  { request: { search: 'alpha -echo' }, titles: ['alpha'] },
  {
    request: {
      search: 'alpha',
      filter: { field: 'priority', op: 'eq', value: 'normal' },
    },
    titles: ['echo alpha'],
  },
];

/** The cases of obligation 5 about what a page holds. */
export function listCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const inOne = taskListing(contract);
  const allLogs = logListing(contract);
  return [
    {
      name: 'obligation 5: lists in the declared default sort, then by the key',
      run: async () => {
        await createListTasks(contract);
        const what = 'tasks in the default sort';
        assertEqual(await walk(inOne, {}, what), DEFAULT_ORDER, what);
      },
    },
    {
      name: 'obligation 5: sorts by each sortable field in both directions, nulls last, ties broken by the key',
      run: async () => {
        await createListTasks(contract);
        for (const { request, titles } of SORTS) {
          const what = `tasks sorted by ${request}`;
          assertEqual(
            await walk(inOne, { sort: [request] }, what),
            titles,
            what,
          );
        }
      },
    },
    {
      name: 'obligation 5: filters with each declared operator on its keyset type',
      run: async () => {
        await createListTasks(contract);
        for (const { request, titles } of FILTERS) {
          const what = `tasks filtered by ${request.field} ${request.op} ${JSON.stringify(request.value)}`;
          assertEqual(
            await walk(inOne, { filter: request }, what),
            titles,
            what,
          );
        }
      },
    },
    {
      name: 'obligation 5: filters a relationship by its foreign key column',
      run: async () => {
        await createListLogs(contract);
        const owned = [
          { value: '1', keys: ['7', '1007', '9007199254740993'] },
          { value: ['2'], keys: ['999', '9007199254740992'] },
        ];
        for (const { value, keys } of owned) {
          const op = Array.isArray(value) ? 'in' : 'eq';
          const what = `logs filtered by owner ${op} ${JSON.stringify(value)}`;
          const filter = { field: 'owner', op, value } as const;
          assertEqual(await walk(allLogs, { filter }, what), keys, what);
        }
      },
    },
    {
      name: 'obligation 5: searches the generated tsvector in websearch mode, with the filter',
      run: async () => {
        await createListTasks(contract);
        for (const { request, titles } of SEARCHES) {
          const what = `tasks searched with ${JSON.stringify(request)}`;
          assertEqual(await walk(inOne, request, what), titles, what);
        }
      },
    },
  ];
}
