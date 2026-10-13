import type {
  ColumnFiltersState,
  OnChangeFn,
  SortingState,
  Updater,
} from '@tanstack/table-core';

import type { DeclaredResource } from '@nizam-os/resource-core';

import type { ListColumnFilters, ListSorting, ListState } from './list-types';

import { describe, expectTypeOf, it } from 'vitest';

import { createClients, createTransport } from '@nizam-os/jsonapi-client';
import { createDeclareResource } from '@nizam-os/resource-core';

import { messages } from '../test-support/messages';
import { publicCatalog } from '../test-support/public-catalog';
import { FIXTURE_REGISTRIES } from '../test-support/registries';
import { resourceList } from './resource-list';

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  ...FIXTURE_REGISTRIES,
  links: { base: '/api' },
});

const Organizations = declareResource('organizations', {
  operations: ['list', 'get', 'create'],
  fields: {
    name: { access: 'read', sort: true },
    invite_code: { access: 'write' },
  },
});

const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update'],
  fields: {
    name: { access: 'readWrite', filter: ['eq', 'startsWithi'], sort: true },
    status: { access: 'readWrite', filter: ['eq', 'in'] },
    priority: { access: 'readWrite', filter: ['gte', 'lte'], sort: true },
    nickname: { access: 'readWrite' },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'readWrite',
      filter: ['in'],
      include: true,
    },
  },
  search: { column: 'search', mode: 'websearch' },
});

const contactsList = resourceList(Contacts, messages);
const organizationsList = resourceList(Organizations, messages);
const state = contactsList.query({});

type ContactState = ListState<typeof Contacts>;

/** A route's `validateSearch`, as TanStack Router calls it. */
function validateSearch(search: Record<string, unknown>) {
  return contactsList.query(search);
}

describe('ListState: typed by the definition (resource SPEC 20.7)', () => {
  it("types sort by the definition's sort names, - for descending", () => {
    expectTypeOf<NonNullable<ContactState['sort']>[number]>().toEqualTypeOf<
      'name' | 'priority' | '-name' | '-priority'
    >();
    const unsorted: ContactState = {
      // @ts-expect-error -- nickname does not sort
      sort: ['nickname'],
    };
    expectTypeOf(unsorted).toExtend<ContactState>();
  });

  it('types filter by member and the operators it declares, a bare value where it declares eq', () => {
    const filtered: ContactState = {
      filter: {
        name: 'Ada',
        status: { in: ['active', 'archived'] },
        priority: { gte: 2, lte: '4' },
        organization: { in: ['1'] },
        or: [{ name: { startsWithi: 'A' } }],
      },
    };
    const refused: ReadonlyArray<ContactState> = [
      // @ts-expect-error -- name declares no containsi
      { filter: { name: { containsi: 'x' } } },
      // @ts-expect-error -- organization declares no eq, so it takes no bare value
      { filter: { organization: '1' } },
      // @ts-expect-error -- nickname declares no filter
      { filter: { nickname: 'Ada' } },
    ];
    expectTypeOf([filtered, ...refused]).toExtend<
      ReadonlyArray<ContactState>
    >();
  });

  it('types search where the definition has one and page where it pages', () => {
    expectTypeOf<ContactState['search']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<
      ListState<typeof Organizations>['search']
    >().toEqualTypeOf<undefined>();
    expectTypeOf<ContactState['page']>().toEqualTypeOf<
      | {
          readonly size?: number | undefined;
          readonly after?: string | undefined;
          readonly before?: string | undefined;
        }
      | undefined
    >();
  });

  it('is what a route reads its search back as, and what a list query takes', () => {
    expectTypeOf(validateSearch).returns.toEqualTypeOf<ContactState>();
    const clients = createClients(
      { organizations: Organizations.resource, contacts: Contacts.resource },
      createTransport({ origin: 'https://api.example.test' }),
    );
    async function rowsOf() {
      const result = await clients.contacts.list({
        ...state,
        include: ['organization'],
      });
      return result.data;
    }
    expectTypeOf(rowsOf).returns.resolves.not.toBeAny();
    async function nextOf() {
      return contactsList.next(state, await clients.contacts.list(state));
    }
    expectTypeOf(nextOf).returns.resolves.toEqualTypeOf<
      ContactState | undefined
    >();
  });

  it('types a declaration TypeScript does not know wide', () => {
    expectTypeOf<
      NonNullable<ListState<DeclaredResource>['sort']>
    >().toEqualTypeOf<ReadonlyArray<string>>();
  });
});

describe('ListModel: TanStack Table v9 state both ways (resource SPEC 20.7)', () => {
  it("types sorting by the definition's sort names, as Table's SortingState takes it", () => {
    expectTypeOf(contactsList.sorting(state)).toEqualTypeOf<
      ListSorting<typeof Contacts>
    >();
    expectTypeOf<ListSorting<typeof Contacts>[number]['id']>().toEqualTypeOf<
      'name' | 'priority'
    >();
    expectTypeOf(contactsList.sorting(state)).toExtend<SortingState>();
  });

  it("types each column filter's value by its member's operators, as Table's ColumnFiltersState takes it", () => {
    type Status = Extract<
      ListColumnFilters<typeof Contacts>[number],
      { id: 'status' }
    >;
    expectTypeOf<keyof Status['value']>().toEqualTypeOf<'eq' | 'in'>();
    expectTypeOf<
      ListColumnFilters<typeof Contacts>[number]['id']
    >().toEqualTypeOf<'name' | 'status' | 'priority' | 'organization'>();
    expectTypeOf(
      contactsList.columnFilters(state),
    ).toExtend<ColumnFiltersState>();
  });

  it("takes the updaters Table's onSortingChange and onColumnFiltersChange hand", () => {
    const onSortingChange: OnChangeFn<SortingState> = (updater) => {
      expectTypeOf(
        contactsList.withSorting(state, updater),
      ).toEqualTypeOf<ContactState>();
    };
    const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (updater) => {
      expectTypeOf(
        contactsList.withColumnFilters(state, updater),
      ).toEqualTypeOf<ContactState>();
    };
    expectTypeOf<Updater<SortingState>>().toExtend<
      Parameters<typeof contactsList.withSorting>[1]
    >();
    expectTypeOf([onSortingChange, onColumnFiltersChange]).toBeArray();
  });

  it('types the columns by the members a read returns', () => {
    expectTypeOf<
      (typeof organizationsList.columns)[number]['name']
    >().toEqualTypeOf<'name'>();
    expectTypeOf<(typeof contactsList.columns)[number]['name']>().toEqualTypeOf<
      'name' | 'status' | 'priority' | 'nickname' | 'organization'
    >();
  });

  it('has withSearch only where the definition has a search parameter, and paging everywhere', () => {
    expectTypeOf(contactsList.withSearch).parameters.toEqualTypeOf<
      [ContactState, string]
    >();
    expectTypeOf(organizationsList.withSearch).toBeNever();
    expectTypeOf(contactsList.next).returns.toEqualTypeOf<
      ContactState | undefined
    >();
    expectTypeOf(contactsList.params(state)).toEqualTypeOf<URLSearchParams>();
  });
});
