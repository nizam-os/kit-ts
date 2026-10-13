/**
 * The types of record and bulk actions (resource SPEC 21.4): a write the
 * declaration does not serve is `never`, an update's values are the
 * definition's update input, each action of a model is typed by the call its
 * write makes, a member or an attribute no action takes is refused, and the
 * texts take the record or the count. A record the list reads, by the list
 * model's state or with includes, is an `ActionRecord`. The mutations a
 * screen sends the models through are `action-mutations.test-d.ts`'.
 */
import type { UpdateInput } from '@nizam-os/jsonapi-client';
import type { DeclaredResource } from '@nizam-os/resource-core';

import type { ListState } from '../list/list-types';
import type {
  ActionRecord,
  ActionValues,
  BulkActionInit,
  RecordActionInit,
  RecordActionsOptions,
} from './action-types';

import { describe, expectTypeOf, it } from 'vitest';

import { createClients, createTransport } from '@nizam-os/jsonapi-client';
import { createDeclareResource } from '@nizam-os/resource-core';

import { publicCatalog } from '../test-support/public-catalog';
import { FIXTURE_REGISTRIES } from '../test-support/registries';
import { Contacts as WideContacts } from '../test-support/resources';
import { bulkActions } from './bulk-actions';
import { recordActions } from './record-actions';

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  ...FIXTURE_REGISTRIES,
  links: { base: '/api' },
});

const Plans = declareResource('plans', {
  operations: ['list', 'get'],
  fields: { seats: { access: 'read' } },
});

const Organizations = declareResource('organizations', {
  operations: ['list', 'get', 'create', 'update'],
  fields: {
    name: { access: 'readWrite' },
    verified: { access: 'readWrite' },
  },
  relationships: { plan_id: { target: () => Plans, access: 'readWrite' } },
  rules: {
    organizations_enterprise_verified: { validator: 'enterpriseVerified' },
  },
});

const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  fields: {
    kind: { access: 'immutable' },
    name: { access: 'readWrite', sort: true },
    status: { access: 'readWrite', filter: ['eq'] },
    created_at: { access: 'read' },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'readWrite',
      include: true,
    },
  },
});

const transport = createTransport({ origin: 'https://api.example.test' });
const clients = createClients(
  {
    plans: Plans.resource,
    organizations: Organizations.resource,
    contacts: Contacts.resource,
  },
  transport,
);
const listState: ListState<typeof Contacts> = {};
/** A page of contacts read by the list model's state, as the screens of SPEC 20.8 read it. */
const listedByState = async () => clients.contacts.list(listState);
/** A page of contacts read with their organizations. */
const listedWithOrganizations = async () =>
  clients.contacts.list({ include: ['organization'] });
const label = (): string => 'Archive';
const tooMany = ({ max }: { readonly max: number }): string => `At most ${max}`;

describe('the writes an action makes (resource SPEC 21.4)', () => {
  it('types an action whose write the declaration does not serve as never', () => {
    expectTypeOf<RecordActionInit<typeof Plans>>().toBeNever();
    expectTypeOf<BulkActionInit<typeof Plans>>().toBeNever();
    recordActions(Organizations, {
      // @ts-expect-error -- organizations does not serve remove
      actions: { remove: { label, remove: true } },
    });
    bulkActions(Organizations, {
      tooMany,
      // @ts-expect-error -- organizations does not serve remove
      actions: { remove: { label, remove: true } },
    });
  });

  it("types an update's values by the definition's update input", () => {
    expectTypeOf<ActionValues<typeof Contacts>>().toEqualTypeOf<
      UpdateInput<typeof Contacts.resource>
    >();
    recordActions(Contacts, {
      actions: {
        // @ts-expect-error -- deleted is no status
        archive: { label, update: { attributes: { status: 'deleted' } } },
      },
    });
    recordActions(Contacts, {
      actions: {
        // @ts-expect-error -- kind is immutable, which no update writes
        archive: { label, update: { attributes: { kind: 'company' } } },
      },
    });
    recordActions(Contacts, {
      actions: {
        move: { label, update: { relationships: { organization: '7' } } },
      },
    });
  });

  it('refuses both writes and neither', () => {
    recordActions(Contacts, {
      actions: {
        // @ts-expect-error -- an action makes one write
        both: { label, remove: true, update: { attributes: { name: 'A' } } },
      },
    });
    recordActions(Contacts, {
      actions: {
        // @ts-expect-error -- an action makes a write
        neither: { label },
      },
    });
  });

  it('types each action by the call its write makes', () => {
    const rows = recordActions(Contacts, {
      actions: {
        archive: { label, update: { attributes: { status: 'archived' } } },
        undo: {
          label,
          update: { attributes: { status: 'active' } },
          remove: undefined,
        },
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

    expectTypeOf(rows.archive.call).toEqualTypeOf<'update'>();
    expectTypeOf(rows.undo.call).toEqualTypeOf<'update'>();
    expectTypeOf(rows.remove.call).toEqualTypeOf<'remove'>();
    expectTypeOf(selection.restore.call).toEqualTypeOf<'update'>();
    expectTypeOf(selection.remove.call).toEqualTypeOf<'remove'>();
  });

  it('gives either call to an action typed as its init before it reached the function', () => {
    const options: RecordActionsOptions<typeof Contacts> = {
      actions: {
        archive: { label, update: { attributes: { status: 'archived' } } },
      },
    };
    const rows = recordActions(Contacts, options);

    expectTypeOf<(typeof rows)[string]['call']>().toEqualTypeOf<
      'update' | 'remove'
    >();
  });

  it('refuses a member no action has and an attribute no update writes', () => {
    recordActions(Contacts, {
      actions: {
        archive: {
          label,
          update: { attributes: { status: 'archived' } },
          // @ts-expect-error -- tonee is no member of an action
          tonee: 'danger',
        },
      },
    });
    bulkActions(Contacts, {
      tooMany,
      actions: {
        restore: {
          label,
          update: {
            // @ts-expect-error -- nmae is no attribute of contacts
            attributes: { status: 'active', nmae: 'Ada' },
          },
        },
      },
    });
  });

  it('serves every write of a resource TypeScript does not know, its values wide', () => {
    const wide = recordActions(WideContacts, {
      actions: {
        archive: { label, update: { attributes: { any: 1 } } },
        remove: { label, remove: true },
      },
    });

    expectTypeOf<RecordActionInit<DeclaredResource>>().not.toBeNever();
    expectTypeOf(wide.archive.call).toEqualTypeOf<'update'>();
    expectTypeOf(wide.remove.call).toEqualTypeOf<'remove'>();
  });
});

describe('the texts and names of the models (resource SPEC 21.2, 21.3)', () => {
  it("names the model's actions, and what can takes, by the names given, before functions typed from context", () => {
    const named = recordActions(Contacts, {
      can: (name) => {
        expectTypeOf(name).toEqualTypeOf<'archive' | 'remove'>();
        return true;
      },
      actions: {
        archive: {
          label,
          update: { attributes: { status: 'archived' } },
          hidden: (contact) => {
            expectTypeOf(contact).toEqualTypeOf<
              ActionRecord<typeof Contacts>
            >();
            return contact.status === 'archived';
          },
        },
        remove: {
          label,
          remove: true,
          confirm: { title: (contact) => `Remove ${contact.name}?` },
        },
      },
    });

    expectTypeOf<keyof typeof named>().toEqualTypeOf<'archive' | 'remove'>();
    expectTypeOf(named.archive.name).toEqualTypeOf<'archive'>();
    expectTypeOf(named.archive.call).toEqualTypeOf<'update'>();
    expectTypeOf(named.remove.call).toEqualTypeOf<'remove'>();
  });

  it("types a record action's texts by the record, and a bulk action's by the count", () => {
    recordActions(Contacts, {
      actions: {
        archive: {
          label,
          update: { attributes: { status: 'archived' } },
          hidden: (contact) => contact.status === 'archived',
          disabled: (contact) => contact.name === '' && 'No name',
          confirm: { title: (contact) => `Archive ${contact.name}?` },
          done: (contact) => `${contact.name} archived`,
        },
      },
    });
    bulkActions(Contacts, {
      tooMany,
      actions: {
        remove: {
          label,
          remove: true,
          disabled: (ids) => ids.length > 3,
          confirm: { title: ({ count }) => `Remove ${count}?` },
          done: ({ count }) => `${count} removed`,
        },
      },
    });
  });

  it('takes the records the list reads, by the list model state or with includes', () => {
    type Listed = Awaited<ReturnType<typeof listedByState>>['data'][number];
    type Included = Awaited<
      ReturnType<typeof listedWithOrganizations>
    >['data'][number];

    expectTypeOf<Listed>().toExtend<ActionRecord<typeof Contacts>>();
    expectTypeOf<Included>().toExtend<ActionRecord<typeof Contacts>>();
  });
});
