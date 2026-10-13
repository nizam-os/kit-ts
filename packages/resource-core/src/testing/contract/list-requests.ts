/**
 * The requests of the list cases (SPEC 12.8, obligation 5), each with the
 * titles of workspace 1 it lists from the tasks of `list-data.ts`, in the
 * order its pages hold them: every sortable field in both directions, and
 * every operator tasks declares on a value of its member's keyset type.
 * @packageDocumentation
 */
import type { FilterCondition } from '@nizam-os/keyset-core';

import { MISSING } from './context';
import { LIST_IDS } from './list-data';

/** A request's titles, in the order its pages hold them. */
export interface Listed<TRequest> {
  readonly request: TRequest;
  readonly titles: ReadonlyArray<string>;
}

/** Each sortable field of tasks in both directions: nulls last, ties broken by the key ascending. */
export const SORTS: ReadonlyArray<Listed<string>> = [
  {
    request: 'title',
    titles: ['alpha', 'bravo', 'charlie', 'delta', 'echo alpha'],
  },
  {
    request: '-title',
    titles: ['echo alpha', 'delta', 'charlie', 'bravo', 'alpha'],
  },
  {
    request: 'estimate',
    titles: ['echo alpha', 'delta', 'alpha', 'charlie', 'bravo'],
  },
  {
    request: '-estimate',
    titles: ['bravo', 'charlie', 'delta', 'alpha', 'echo alpha'],
  },
  {
    request: 'points',
    titles: ['charlie', 'delta', 'echo alpha', 'bravo', 'alpha'],
  },
  {
    request: '-points',
    titles: ['alpha', 'bravo', 'echo alpha', 'delta', 'charlie'],
  },
  {
    request: 'dueOn',
    titles: ['echo alpha', 'charlie', 'alpha', 'delta', 'bravo'],
  },
  {
    request: '-dueOn',
    titles: ['alpha', 'charlie', 'echo alpha', 'delta', 'bravo'],
  },
  {
    request: 'startsAt',
    titles: ['echo alpha', 'delta', 'bravo', 'alpha', 'charlie'],
  },
  {
    request: '-startsAt',
    titles: ['alpha', 'delta', 'bravo', 'echo alpha', 'charlie'],
  },
  {
    request: 'priority',
    titles: ['bravo', 'echo alpha', 'charlie', 'delta', 'alpha'],
  },
  {
    request: '-priority',
    titles: ['delta', 'alpha', 'echo alpha', 'charlie', 'bravo'],
  },
  {
    request: 'rank',
    titles: ['echo alpha', 'delta', 'alpha', 'charlie', 'bravo'],
  },
  {
    request: '-rank',
    titles: ['charlie', 'delta', 'alpha', 'echo alpha', 'bravo'],
  },
  {
    request: 'id',
    titles: ['echo alpha', 'delta', 'charlie', 'bravo', 'alpha'],
  },
  {
    request: '-id',
    titles: ['alpha', 'bravo', 'charlie', 'delta', 'echo alpha'],
  },
];

/** Each operator tasks declares, on a value of its member's keyset type, listed in the default sort. */
export const FILTERS: ReadonlyArray<Listed<FilterCondition>> = [
  { request: { field: 'title', op: 'eq', value: 'bravo' }, titles: ['bravo'] },
  {
    request: { field: 'title', op: 'ne', value: 'bravo' },
    titles: ['alpha', 'delta', 'echo alpha', 'charlie'],
  },
  {
    request: { field: 'title', op: 'in', value: ['alpha', 'delta'] },
    titles: ['alpha', 'delta'],
  },
  {
    request: { field: 'title', op: 'nin', value: ['alpha', 'delta'] },
    titles: ['echo alpha', 'charlie', 'bravo'],
  },
  {
    request: { field: 'title', op: 'gte', value: 'charlie' },
    titles: ['delta', 'echo alpha', 'charlie'],
  },
  {
    request: { field: 'title', op: 'lt', value: 'charlie' },
    titles: ['alpha', 'bravo'],
  },
  {
    request: { field: 'title', op: 'startsWith', value: 'ch' },
    titles: ['charlie'],
  },
  {
    request: { field: 'title', op: 'containsi', value: 'ALPHA' },
    titles: ['alpha', 'echo alpha'],
  },
  {
    request: { field: 'estimate', op: 'eq', value: '1.250' },
    titles: ['alpha', 'delta'],
  },
  {
    request: { field: 'estimate', op: 'between', value: ['1', '9.5'] },
    titles: ['alpha', 'delta', 'charlie'],
  },
  {
    request: { field: 'points', op: 'eq', value: '9007199254740993' },
    titles: ['alpha'],
  },
  {
    request: { field: 'points', op: 'gt', value: '9007199254740992' },
    titles: ['alpha'],
  },
  {
    request: { field: 'points', op: 'in', value: ['42', '9007199254740992'] },
    titles: ['delta', 'bravo'],
  },
  {
    request: { field: 'dueOn', op: 'lt', value: '2026-01-15' },
    titles: ['echo alpha'],
  },
  {
    request: { field: 'dueOn', op: 'isNull', value: true },
    titles: ['delta', 'bravo'],
  },
  {
    request: { field: 'dueOn', op: 'isNull', value: false },
    titles: ['alpha', 'echo alpha', 'charlie'],
  },
  {
    request: {
      field: 'startsAt',
      op: 'gt',
      value: '2026-10-10T10:30:00.123456Z',
    },
    titles: ['alpha'],
  },
  {
    request: {
      field: 'startsAt',
      op: 'lte',
      value: '2026-10-10T12:30:00.123456+02:00',
    },
    titles: ['delta', 'echo alpha', 'bravo'],
  },
  {
    request: { field: 'tags', op: 'contains', value: ['x'] },
    titles: ['alpha', 'delta'],
  },
  {
    request: { field: 'tags', op: 'containedBy', value: ['x', 'y'] },
    titles: ['alpha', 'charlie', 'bravo'],
  },
  {
    request: { field: 'tags', op: 'overlaps', value: ['NULL', 'z, w'] },
    titles: ['delta', 'echo alpha'],
  },
  { request: { field: 'done', op: 'eq', value: true }, titles: ['alpha'] },
  {
    request: { field: 'priority', op: 'eq', value: 'normal' },
    titles: ['echo alpha', 'charlie'],
  },
  {
    request: { field: 'priority', op: 'in', value: ['low', 'high'] },
    titles: ['alpha', 'delta', 'bravo'],
  },
  {
    request: { field: 'priority', op: 'nin', value: ['high'] },
    titles: ['echo alpha', 'charlie', 'bravo'],
  },
  {
    request: { field: 'rank', op: 'gte', value: 2 },
    titles: ['alpha', 'delta', 'charlie'],
  },
  {
    request: { field: 'rank', op: 'between', value: [1, 2] },
    titles: ['alpha', 'delta', 'echo alpha'],
  },
  {
    request: { field: 'parent', op: 'eq', value: LIST_IDS.alpha },
    titles: ['charlie', 'bravo'],
  },
  {
    request: { field: 'parent', op: 'in', value: [LIST_IDS.alpha, MISSING] },
    titles: ['charlie', 'bravo'],
  },
  {
    request: { field: 'parent', op: 'isNull', value: true },
    titles: ['alpha', 'delta', 'echo alpha'],
  },
];
