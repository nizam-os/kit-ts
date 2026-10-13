/**
 * The models against the mutations a screen sends them through (resource
 * SPEC 21.2, 21.3), read through query-core's `MutationObserver`, which
 * every adapter's `useMutation` is made of: an update action's `variables`
 * go to `resourceQueries`' `update` and a removal's to its `remove` (jsonapi
 * SPEC 16.2), each called on the action itself, while code that runs any
 * action narrows on `call`; a bulk action's `operations` go to
 * `operationsMutation`, typed as the definition's builders type them
 * (jsonapi SPEC 17.4).
 */
import type { ActionRecord, BulkAction, RecordAction } from './action-types';

import { MutationObserver, QueryClient } from '@tanstack/query-core';
import { describe, expectTypeOf, it } from 'vitest';

import {
  createClients,
  createTransport,
  operationsOf,
} from '@nizam-os/jsonapi-client';
import { createDeclareResource } from '@nizam-os/resource-core';
import {
  operationsMutation,
  resourceQueries,
} from '@nizam-os/tanstack-query-jsonapi';

import { publicCatalog } from '../test-support/public-catalog';
import { FIXTURE_REGISTRIES } from '../test-support/registries';
import { bulkActions } from './bulk-actions';
import { recordActions } from './record-actions';

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  ...FIXTURE_REGISTRIES,
  links: { base: '/api' },
});

const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'update', 'remove'],
  fields: {
    name: { access: 'readWrite', sort: true },
    status: { access: 'readWrite', filter: ['eq'] },
  },
});

const transport = createTransport({ origin: 'https://api.example.test' });
const clients = createClients({ contacts: Contacts.resource }, transport);
const contacts = resourceQueries(clients.contacts);
const queryClient = new QueryClient();
const label = (): string => 'Archive';
const tooMany = ({ max }: { readonly max: number }): string => `At most ${max}`;

const rows = recordActions(Contacts, {
  actions: {
    archive: { label, update: { attributes: { status: 'archived' } } },
    remove: { label, tone: 'danger', remove: true },
  },
});
const selection = bulkActions(Contacts, {
  tooMany,
  actions: {
    restore: { label, update: { attributes: { status: 'active' } } },
    remove: { label, remove: true },
  },
});

describe('the mutations a screen sends them through (jsonapi SPEC 16.2, 17.4)', () => {
  it("gives a record action's variables to the mutation its call names", () => {
    const update = new MutationObserver(queryClient, contacts.update());
    const remove = new MutationObserver(queryClient, contacts.remove());
    const archive = async (
      contact: ActionRecord<typeof Contacts>,
    ): Promise<void> => {
      await update.mutate(rows.archive.variables(contact));
    };
    const drop = async (
      contact: ActionRecord<typeof Contacts>,
    ): Promise<void> => {
      await remove.mutate(rows.remove.variables(contact));
    };

    expectTypeOf<ReturnType<typeof rows.remove.variables>>().toEqualTypeOf<
      Parameters<typeof remove.mutate>[0]
    >();
    expectTypeOf(archive).toBeFunction();
    expectTypeOf(drop).toBeFunction();
  });

  it('runs any record action after narrowing on its call', () => {
    const update = new MutationObserver(queryClient, contacts.update());
    const remove = new MutationObserver(queryClient, contacts.remove());
    const run = async (
      action: RecordAction<typeof Contacts>,
      contact: ActionRecord<typeof Contacts>,
    ): Promise<void> => {
      await (action.call === 'update'
        ? update.mutate(action.variables(contact))
        : remove.mutate(action.variables(contact)));
    };

    expectTypeOf(rows.archive).toExtend<RecordAction<typeof Contacts>>();
    expectTypeOf(rows.remove).toExtend<RecordAction<typeof Contacts>>();
    expectTypeOf(run).toBeFunction();
  });

  it("gives a bulk action's operations to operationsMutation, typed as the definition's builders type them", () => {
    const operations = new MutationObserver(
      queryClient,
      operationsMutation(transport),
    );
    const builders = operationsOf(Contacts.resource);

    void operations.mutate(selection.restore.operations(['c1']));
    void operations.mutate(selection.remove.operations(['c1']));
    expectTypeOf(selection.restore.operations(['c1'])).toEqualTypeOf<
      ReadonlyArray<ReturnType<typeof builders.update>>
    >();
    expectTypeOf(selection.remove.operations(['c1'])).toEqualTypeOf<
      ReadonlyArray<ReturnType<typeof builders.remove>>
    >();
    expectTypeOf(selection.restore).toExtend<BulkAction<typeof Contacts>>();
  });
});
