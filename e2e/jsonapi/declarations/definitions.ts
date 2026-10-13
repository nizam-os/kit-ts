/**
 * Definitions a shared module exports, compiled with `declaration: true`
 * by `declarations.e2e.test.ts`: the raw definer with every member whose
 * type the client types record (a validator, writable lists, client ids,
 * a query), and a configured definer's resource.
 */
import { z } from 'zod';

import { createDefineResource, defineResource } from '@nizam-os/jsonapi-core';

const defineLinked = createDefineResource({ links: { base: '/api' } });

interface TaskRow {
  readonly id: string;
  readonly title: string;
  readonly dueAt: Date | null;
  readonly ownerId: string;
}

export const Tasks = defineResource({
  type: 'tasks',
  attributes: ['title', 'dueAt'],
  relationships: { owner: { type: 'people', cardinality: 'one' } },
  serialize: (row: TaskRow) => ({
    id: row.id,
    attributes: { title: row.title, dueAt: row.dueAt },
    relationships: { owner: row.ownerId },
  }),
  query: {
    sort: ['title'],
    filter: { title: ['eq', 'like'] },
    include: ['owner'],
    page: { default: 10, max: 50 },
    search: 'filter[q]',
    custom: ['highlightMode'],
  },
  validate: {
    create: z.object({
      title: z.string().min(1),
      dueAt: z.iso.datetime().nullable(),
    }),
  },
  writable: { create: ['title', 'dueAt', 'owner'], update: ['title', 'dueAt'] },
  clientIds: true,
});

export const Labels = defineLinked({
  type: 'labels',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
});
