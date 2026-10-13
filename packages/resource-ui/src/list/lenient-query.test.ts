/**
 * `lenientQuery`, which `query(search)` reads with (resource SPEC 20.7): a
 * route's search read back against the definition, as JSON and as the
 * API's own parameters. What `parseQuery` refuses is dropped parameter by
 * parameter, so a stale or edited link opens the list with the rest;
 * `include`, `fields`, and custom parameters are never read; JSON of
 * another shape is dropped member by member; and the state reads back to
 * the parameters it came from.
 */
import type { AnyResource } from '@nizam-os/jsonapi-core';

import { describe, expect, it } from 'vitest';

import { createDefineResource } from '@nizam-os/jsonapi-core';

import { messages } from '../test-support/messages';
import { Contacts, Organizations } from '../test-support/resources';
import { lenientQuery } from './lenient-query';
import { resourceList } from './resource-list';

const contacts = resourceList(Contacts, messages);

const read = (search: unknown) => lenientQuery(Contacts.resource, search);
const organizations = (search: unknown) =>
  lenientQuery(Organizations.resource, search);

/** The state the JSON and parameter forms below both hold. */
const STATE = {
  sort: ['-priority', 'name'],
  filter: {
    status: { in: ['active', 'archived'] },
    name: { startsWithi: 'Ad' },
    or: [{ vip: { eq: 'true' } }, { priority: { gte: '3' } }],
  },
  page: { size: 5, after: 'c2' },
  search: 'ada',
};

/** `STATE` as the client sends it: `contacts.params(STATE)`. */
const PARAMS = [
  'sort=-priority%2Cname',
  'page%5Bsize%5D=5',
  'page%5Bafter%5D=c2',
  'filter%5Bstatus%5D%5Bin%5D=active',
  'filter%5Bstatus%5D%5Bin%5D=archived',
  'filter%5Bname%5D%5BstartsWithi%5D=Ad',
  'filter%5Bor%5D%5B0%5D%5Bvip%5D%5Beq%5D=true',
  'filter%5Bor%5D%5B1%5D%5Bpriority%5D%5Bgte%5D=3',
  'filter%5Bq%5D=ada',
].join('&');

describe('query: a valid search in either form (resource SPEC 20.7)', () => {
  it('reads the state as JSON, each member in its own form, so a router reading it back after a navigation reads what it was given', () => {
    const json = {
      sort: ['name'],
      filter: {
        status: { in: ['active'] },
        vip: true,
        priority: { gte: 3 },
        or: [{ vip: { eq: false } }, { name: 'Ada' }],
      },
      page: { size: 5, after: 'c2' },
      search: 'ada',
    };
    expect(read(json)).toStrictEqual(json);
    expect(read(JSON.parse(JSON.stringify(json)))).toStrictEqual(json);
    expect(read(STATE)).toStrictEqual(STATE);
  });

  it('reads the API parameters as URLSearchParams and as a string, with or without ?', () => {
    expect(read(new URLSearchParams(PARAMS))).toStrictEqual(STATE);
    expect(read(PARAMS)).toStrictEqual(STATE);
    expect(read(`?${PARAMS}`)).toStrictEqual(STATE);
  });

  it('gives back the parameters it read, and reads back the state they make', () => {
    expect(contacts.params(read(PARAMS)).toString()).toBe(PARAMS);
    expect(read(contacts.params(STATE))).toStrictEqual(STATE);
    expect(read(read(STATE))).toStrictEqual(STATE);
  });

  it('reads a bare value as eq, a repeated parameter as a list, and an empty search as it is', () => {
    expect(
      read(
        'filter[email]=ada@example.com&filter[kind][in]=person&filter[kind][in]=organization&filter[q]=',
      ),
    ).toStrictEqual({
      filter: {
        email: { eq: 'ada@example.com' },
        kind: { in: ['person', 'organization'] },
      },
      search: '',
    });
  });

  it('keeps page.size only when the search held it', () => {
    expect(read('page[after]=c2')).toStrictEqual({
      page: { after: 'c2' },
    });
    expect(read('sort=')).toStrictEqual({});
  });
});

describe('query: what the definition refuses is dropped, parameter by parameter (resource SPEC 20.7)', () => {
  it.each([
    [
      'an unknown filter member',
      'filter[nickname][eq]=x&sort=name',
      { sort: ['name'] },
    ],
    [
      'an operator the member does not declare',
      'filter[name][containsi]=x&filter[status]=active',
      { filter: { status: { eq: 'active' } } },
    ],
    [
      'a member that does not sort, which drops the whole sort',
      'sort=nickname,name&page[size]=5',
      { page: { size: 5 } },
    ],
    [
      'a sort sent twice',
      'sort=name&sort=-name&filter[q]=ada',
      { search: 'ada' },
    ],
    [
      'a page size above the maximum',
      'page[size]=500&page[after]=c2',
      { page: { after: 'c2' } },
    ],
    ['a page size of zero', 'page[size]=0&sort=name', { sort: ['name'] }],
    ['an empty cursor', 'page[after]=&page[size]=5', { page: { size: 5 } }],
    [
      'a range request the definition refuses',
      'page[after]=c1&page[before]=c9',
      { page: { after: 'c1' } },
    ],
    [
      'an unknown page member',
      'page[number]=2&page[size]=5',
      { page: { size: 5 } },
    ],
    [
      'a malformed or group',
      'filter[or][x][vip]=true&filter[vip]=false',
      { filter: { vip: { eq: 'false' } } },
    ],
  ])('drops %s and keeps the rest', (_case, search, state) => {
    expect(read(search)).toStrictEqual(state);
  });

  it("never reads include, fields, or custom parameters: they are the screen's", () => {
    expect(
      read(
        'include=organization&fields[contacts]=name&sorting=name&q=ada&sort=name',
      ),
    ).toStrictEqual({ sort: ['name'] });
    expect(
      read({
        include: ['organization'],
        fields: { contacts: ['name'] },
        custom: { q: 'ada' },
        sort: ['name'],
      }),
    ).toStrictEqual({ sort: ['name'] });
  });

  it('drops an empty JSON cursor, which the definition refuses', () => {
    expect(read({ page: { size: 5, after: '' } })).toStrictEqual({
      page: { size: 5 },
    });
  });

  it('drops search on a definition without one, and what it refuses beside it', () => {
    expect(organizations({ sort: ['verified'], search: 'acme' })).toStrictEqual(
      {},
    );
    expect(organizations({ search: 'acme', sort: ['name'] })).toStrictEqual({
      sort: ['name'],
    });
    expect(organizations('filter[q]=acme&sort=name')).toStrictEqual({
      sort: ['name'],
    });
  });
});

describe('query: JSON of another shape is dropped member by member (resource SPEC 20.7)', () => {
  it.each([
    ['sort not a list', { sort: 'name' }],
    ['sort with an entry that is no string', { sort: ['name', 1] }],
    ['filter not an object', { filter: 'status' }],
    ['filter a list', { filter: [{ status: 'active' }] }],
    ['a condition that is null', { filter: { name: null } }],
    [
      'a condition of no operator left',
      { filter: { name: { startsWithi: {} } } },
    ],
    ['an empty list', { filter: { status: { in: [] } } }],
    [
      'a list holding an object',
      { filter: { status: { in: ['active', {}] } } },
    ],
    [
      'a value that is not finite',
      { filter: { priority: { gte: Number.POSITIVE_INFINITY } } },
    ],
    ['or not a list', { filter: { or: { vip: true } } }],
    ['or holding a value', { filter: { or: [{ vip: true }, 1] } }],
    ['or holding an empty group', { filter: { or: [{}] } }],
    ['page not an object', { page: 5 }],
    ['page.size zero', { page: { size: 0 } }],
    ['page.size not an integer', { page: { size: 2.5 } }],
    ['page.size as text', { page: { size: '5' } }],
    ['page.size beyond a safe integer', { page: { size: 2 ** 53 } }],
    ['a cursor that is no string', { page: { after: 3 } }],
    ['search not a string', { search: 5 }],
  ])('drops %s', (_case, search) => {
    expect(read(search)).toStrictEqual({});
  });

  it('keeps a JSON page at either cursor', () => {
    expect(read({ page: { size: 5, before: 'c9' } })).toStrictEqual({
      page: { size: 5, before: 'c9' },
    });
  });

  it('reads a definition without pages, which no parameter pages, in either form', () => {
    const tags: AnyResource = createDefineResource({
      links: { base: 'https://api.example.test' },
    })({
      type: 'tags',
      attributes: ['name'],
      query: { sort: ['name'] },
      serialize: (row: { readonly id: string }) => ({ id: row.id }),
    });
    expect(
      lenientQuery(tags, { sort: ['name'], page: { size: 5 } }),
    ).toStrictEqual({ sort: ['name'] });
    expect(lenientQuery(tags, 'sort=name&page[size]=5')).toStrictEqual({
      sort: ['name'],
    });
  });

  it('keeps the members of the right shape beside one of another', () => {
    expect(
      read({
        sort: ['name'],
        filter: {
          name: { startsWithi: 'Ad', eq: null },
          vip: true,
          status: { in: [] },
          or: [{ vip: false }, { name: 7 }, { priority: [] }],
        },
        page: { size: 2.5, after: 'c2', before: null },
        search: ['ada'],
      }),
    ).toStrictEqual({
      sort: ['name'],
      filter: {
        name: { startsWithi: 'Ad' },
        vip: true,
        or: [{ vip: false }, { name: 7 }],
      },
      page: { after: 'c2' },
    });
  });

  it('drops each JSON member whose parameter the definition refuses, and keeps the rest in its own form', () => {
    expect(
      read({
        sort: ['nickname', 'name'],
        filter: {
          name: { startsWithi: 'Ad', containsi: 'd' },
          nickname: 'Countess',
          priority: 3,
          status: { in: ['active'] },
          or: [{ vip: true, website: 'x' }, { email: { lt: 'b' } }],
        },
        page: { size: 500, after: 'c1', before: 'c9' },
        search: 'ada',
      }),
    ).toStrictEqual({
      filter: {
        name: { startsWithi: 'Ad' },
        status: { in: ['active'] },
        or: [{ vip: true }],
      },
      page: { after: 'c1' },
      search: 'ada',
    });
  });

  it.each([null, undefined, 5, true, [], [['sort', 'name']], () => ({})])(
    'is the empty state for a search that is not an object: %s',
    (search) => {
      expect(read(search)).toStrictEqual({});
    },
  );
});
