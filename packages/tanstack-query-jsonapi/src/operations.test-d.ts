/**
 * The types `operationsMutation` gives (SPEC 17.4), read through
 * query-core's `MutationObserver`, which every adapter's `useMutation` is
 * made of: any list of operations and `unknown` data by default, and the
 * operations of a type argument with their records' data when narrowed.
 * The adapters' hooks are checked against the built package in
 * `e2e/jsonapi/query/adapters/`.
 */
import type {
  Operation,
  OperationResult,
  OperationsResult,
  RecordOf,
} from '@nizam-os/jsonapi-client';

import type { OperationsOptions } from './query-types';

import { MutationObserver, QueryClient } from '@tanstack/query-core';
import { describe, expectTypeOf, it } from 'vitest';

import { createTransport, operationsOf } from '@nizam-os/jsonapi-client';
import { createDefineResource } from '@nizam-os/jsonapi-core';

import { operationsMutation } from './operations';

const defineResource = createDefineResource({ links: { base: '/api' } });

const Contacts = defineResource({
  type: 'contacts',
  attributes: ['name', 'status'],
  serialize: (row: {
    readonly id: string;
    readonly name: string;
    readonly status: 'active' | 'archived';
  }) => ({ id: row.id, attributes: { name: row.name, status: row.status } }),
  writable: { create: ['name'], update: ['name', 'status'] },
});

const Notes = defineResource({
  type: 'notes',
  attributes: ['text'],
  serialize: (row: { readonly id: string; readonly text: string }) => ({
    id: row.id,
    attributes: { text: row.text },
  }),
});

const transport = createTransport({ origin: 'https://api.example.test' });
const queryClient = new QueryClient();
const contacts = operationsOf(Contacts);
const notes = operationsOf(Notes);

type ContactUpdate = ReturnType<typeof contacts.update>;

describe('operationsMutation (SPEC 17.4)', () => {
  it('takes any list of operations, each result data unknown, by default', () => {
    const options = operationsMutation(transport);
    expectTypeOf(options).toEqualTypeOf<OperationsOptions>();
    const bulk = new MutationObserver(queryClient, options);
    expectTypeOf<typeof bulk.mutate>()
      .parameter(0)
      .toEqualTypeOf<ReadonlyArray<Operation>>();
    expectTypeOf<
      typeof bulk.mutate
    >().returns.resolves.toEqualTypeOf<OperationsResult>();
    expectTypeOf<
      Awaited<ReturnType<typeof bulk.mutate>>['results'][number]
    >().toEqualTypeOf<OperationResult>();
    void bulk.mutate([
      contacts.update('c1', { attributes: { status: 'archived' } }),
      notes.remove('n1'),
    ]);
  });

  it('types the operations and their results by a type argument', () => {
    const archive = new MutationObserver(
      queryClient,
      operationsMutation<ContactUpdate>(transport),
    );
    expectTypeOf<
      Awaited<ReturnType<typeof archive.mutate>>['results'][number]['data']
    >().toEqualTypeOf<RecordOf<never, typeof Contacts> | undefined>();
    void archive.mutate(
      ['c1', 'c2'].map((id) =>
        contacts.update(id, { attributes: { status: 'archived' } }),
      ),
    );
    // @ts-expect-error -- a removal is no contact update
    void archive.mutate([contacts.remove('c1')]);
    // @ts-expect-error -- another definition's operation
    void archive.mutate([notes.remove('n1')]);
  });

  it('invalidates any key', () => {
    operationsMutation(transport, { invalidates: [['notes'], ['contacts']] });
  });
});
