/**
 * `resourceList` (resource SPEC 20.7): the columns a read returns, the
 * page sizes and search of the definition, the cursors every change but
 * paging drops, `next` and `previous` from the links jsonapi-core's
 * `paginationLinks` makes for the request `params` describes, a page
 * without records, `first`, and the `TypeError`s of each argument a
 * JavaScript caller can get wrong.
 */
import { describe, expect, it } from 'vitest';

import { paginationLinks } from '@nizam-os/jsonapi-core';
import { defaultMessages } from '@nizam-os/resource-core';

import { messages } from '../test-support/messages';
import { Contacts, Organizations, Plans } from '../test-support/resources';
import { resourceList } from './resource-list';

const contacts = resourceList(Contacts, messages);

/** A link object to the page after `cursor`. */
function href(cursor: string) {
  return { href: `/api/contacts?page%5Bafter%5D=${cursor}` };
}

/** `fn` called with `args` as JavaScript would, types erased. */
function call(
  fn: (...args: never) => unknown,
  ...args: ReadonlyArray<unknown>
) {
  return () => Reflect.apply(fn, undefined, args);
}

/** A list result for the request `state` makes, with `count` records and the links its cursors make. */
function result(
  state: Parameters<typeof contacts.params>[0],
  count: number,
  cursors: { readonly next: string | null; readonly prev: string | null },
) {
  const url = `https://api.example.test/api/contacts?${contacts.params(state).toString()}`;
  return {
    data: Array.from({ length: count }, (_, index) => ({ id: String(index) })),
    links: paginationLinks(url, cursors, { relative: true }),
  };
}

describe('resourceList: the columns, page sizes, and search of a definition (resource SPEC 20.7)', () => {
  it('holds the descriptor of every member a read returns, in declaration order, without write members', () => {
    expect(contacts.columns.map(({ name }) => name)).toEqual(
      Object.keys(Contacts.fields),
    );
    const organizations = resourceList(Organizations, messages);
    expect(organizations.columns.map(({ name }) => name)).toEqual([
      'name',
      'verified',
      'marketingOptIn',
      'openDays',
      'foundedOn',
      'createdAt',
      'plan',
    ]);
    expect(organizations.columns[0]?.label()).toBe('Name');
    expect(Object.isFrozen(organizations.columns)).toBe(true);
  });

  it("holds the definition's page sizes and whether it searches, frozen", () => {
    expect(contacts.page).toEqual({ default: 20, max: 100 });
    expect(contacts.searchable).toBe(true);
    expect(resourceList(Organizations, messages).searchable).toBe(false);
    expect(Object.isFrozen(contacts)).toBe(true);
    expect(Object.isFrozen(contacts.page)).toBe(true);
  });

  it("serializes a state as the client sends it, with the screen's own members", () => {
    const state = {
      sort: ['-name'],
      page: { size: 5, after: 'c1' },
      search: 'ada',
      include: ['organization'],
    };
    expect(contacts.params(state).toString()).toBe(
      'include=organization&sort=-name&page%5Bsize%5D=5&page%5Bafter%5D=c1&filter%5Bq%5D=ada',
    );
  });
});

describe('resourceList.query: a state naming every member of a list query (resource SPEC 20.7)', () => {
  it("keeps nothing of the URL's search a router spreads the state over that the state does not hold", () => {
    const url = {
      sort: ['nickname'],
      include: ['organization'],
      fields: { contacts: ['name'] },
      filter: { status: { in: ['archived'] }, vip: { gte: 1 } },
      tab: 'details',
    };
    const state = contacts.query(url);
    expect(Object.keys(state)).toEqual([
      'include',
      'fields',
      'sort',
      'filter',
      'page',
      'search',
      'custom',
    ]);
    // TanStack Router hands the route the URL's search with the validated one spread over it.
    const routed = { ...url, ...state };
    expect(contacts.params(routed).toString()).toBe(
      'filter%5Bstatus%5D%5Bin%5D=archived',
    );
    expect(JSON.parse(JSON.stringify(routed))).toStrictEqual({
      filter: { status: { in: ['archived'] } },
      tab: 'details',
    });
  });
});

describe('resourceList: changes and paging (resource SPEC 20.7)', () => {
  const paged = {
    sort: ['name'],
    page: { size: 5, after: 'c1', before: 'c9' },
  };

  it('drops the cursors on every change but paging, and keeps the page size', () => {
    expect(contacts.withSearch(paged, 'ada')).toStrictEqual({
      sort: ['name'],
      page: { size: 5 },
      search: 'ada',
    });
    expect(contacts.withSearch({ ...paged, search: 'ada' }, '')).toStrictEqual({
      sort: ['name'],
      page: { size: 5 },
    });
    expect(contacts.withPageSize(paged, 10)).toStrictEqual({
      sort: ['name'],
      page: { size: 10 },
    });
    expect(contacts.first(paged)).toStrictEqual({
      sort: ['name'],
      page: { size: 5 },
    });
    expect(contacts.first({ page: { after: 'c1' } })).toStrictEqual({});
  });

  it("pages by the result's links, the other cursor removed", () => {
    const state = { sort: ['name'], page: { size: 2, after: 'c2' } };
    const page = result(state, 2, { next: 'c4', prev: 'c3' });
    expect(contacts.next(state, page)).toStrictEqual({
      sort: ['name'],
      page: { size: 2, after: 'c4' },
    });
    expect(contacts.previous(state, page)).toStrictEqual({
      sort: ['name'],
      page: { size: 2, before: 'c3' },
    });
  });

  it('reads link objects as their href, and is undefined without a link or a cursor in it', () => {
    expect(
      contacts.next({}, { data: [{}], links: { next: href('c2') } }),
    ).toStrictEqual({
      page: { after: 'c2' },
    });
    expect(
      contacts.next({}, result({}, 1, { next: null, prev: null })),
    ).toBeUndefined();
    expect(
      contacts.previous({}, result({}, 1, { next: null, prev: null })),
    ).toBeUndefined();
    expect(contacts.next({}, { data: [{}] })).toBeUndefined();
    expect(
      contacts.next({}, { data: [{}], links: { next: '/api/contacts' } }),
    ).toBeUndefined();
  });

  it('ends the list at a page without records in the direction it was reached, the first page going forward', () => {
    const empty = (state: Parameters<typeof contacts.params>[0]) =>
      result(state, 0, { next: 'c5', prev: 'c4' });
    const forward = { page: { after: 'c4' } };
    expect(contacts.next(forward, empty(forward))).toBeUndefined();
    expect(contacts.previous(forward, empty(forward))).toStrictEqual({
      page: { before: 'c4' },
    });
    expect(contacts.next({}, empty({}))).toBeUndefined();
    const backward = { page: { before: 'c5' } };
    expect(contacts.previous(backward, empty(backward))).toBeUndefined();
    expect(contacts.next(backward, empty(backward))).toStrictEqual({
      page: { after: 'c5' },
    });
  });
});

describe('resourceList: the TypeError of each argument a JavaScript caller can get wrong (resource SPEC 20.1, 20.7)', () => {
  it('refuses a resource no declareResource returned, and messages that do not label it', () => {
    expect(call(resourceList, { names: Contacts.names }, messages)).toThrow(
      new TypeError(
        'resourceList: resource must be what a declareResource returned',
      ),
    );
    expect(call(resourceList, Contacts, {})).toThrow(
      new TypeError(
        'resourceList: messages must be what defineMessages or defaultMessages returned',
      ),
    );
    expect(call(resourceList, Contacts, defaultMessages([Plans]))).toThrow(
      new TypeError('resourceList: the messages label no member of contacts'),
    );
    const flat = {
      ...Contacts,
      resource: {
        ...Contacts.resource,
        query: { ...Contacts.resource.query, page: undefined },
      },
    };
    expect(call(resourceList, flat, messages)).toThrow(
      new TypeError(
        'resourceList: resource must be what a declareResource returned',
      ),
    );
  });

  it.each([
    ['params', [null]],
    ['sorting', ['sort=name']],
    ['withSorting', [{ sort: 'name' }, []]],
    ['columnFilters', [{ filter: [] }]],
    ['withColumnFilters', [{ page: 2 }, []]],
    ['withSearch', [[], 'ada']],
    ['withPageSize', [undefined, 5]],
    ['next', [{ sort: [1] }, { data: [] }]],
    ['previous', [{ filter: 'x' }, { data: [] }]],
    ['first', [0]],
  ] as const)('refuses a state that is not one in %s', (member, args) => {
    expect(call(contacts[member], ...args)).toThrow(
      new TypeError(`resourceList.${member}: state must be a list state`),
    );
  });

  it.each([
    ['next', undefined],
    ['previous', { links: {} }],
    ['next', { data: {} }],
  ] as const)(
    'refuses a result that is no list result in %s',
    (member, value) => {
      expect(call(contacts[member], {}, value)).toThrow(
        new TypeError(
          `resourceList.${member}: result must be what a list call returned`,
        ),
      );
    },
  );

  it('refuses a search on a resource without one, and text that is not a string', () => {
    const organizations = resourceList(Organizations, messages);
    expect(call(organizations.withSearch, {}, 'acme')).toThrow(
      new TypeError(
        'resourceList.withSearch: organizations has no search parameter',
      ),
    );
    expect(call(contacts.withSearch, {}, 5)).toThrow(
      new TypeError('resourceList.withSearch: text must be a string'),
    );
  });

  it.each([0, -1, 2.5, 101, Number.NaN, '5', 2 ** 53])(
    'refuses the page size %s',
    (size) => {
      expect(call(contacts.withPageSize, {}, size)).toThrow(
        new TypeError(
          'resourceList.withPageSize: size must be a positive safe integer at most 100',
        ),
      );
    },
  );

  it('takes a definition without a default sort or filters', () => {
    const plans = resourceList(Plans, messages);
    expect(plans.sorting({})).toEqual([]);
    expect(plans.withColumnFilters({}, [])).toStrictEqual({});
  });
});
