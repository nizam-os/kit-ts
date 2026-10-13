/**
 * `columnFilters` and `withColumnFilters` (resource SPEC 20.7): a state's
 * `filter` as TanStack Table's column filters and back, a bare value as
 * `eq`, `or` kept as the state holds it, Table's updaters, the cursors a
 * filter change drops, a filter emptied by `undefined` or an empty list
 * removed, and the
 * `TypeError` of each mistake, none quoting the name or value.
 */
import { describe, expect, it } from 'vitest';

import { serializeQuery } from '@nizam-os/jsonapi-client';

import { messages } from '../test-support/messages';
import { Contacts } from '../test-support/resources';
import { resourceList } from './resource-list';

const contacts = resourceList(Contacts, messages);

const OR = [{ name: { startsWithi: 'a' } }, { vip: true }];

/** `column.setFilterValue(value)` as Table v9 hands it: a function of the column filters it shows. */
function setFilterValue(id: string, value: unknown) {
  return (current: ReadonlyArray<{ id: string; value: unknown }>) => [
    ...current.filter((filter) => filter.id !== id),
    ...(value === undefined ? [] : [{ id, value }]),
  ];
}

describe('columnFilters: a state as Table v9 column filters (resource SPEC 20.7)', () => {
  it('reads each condition but or as { id, value }, a bare value as eq', () => {
    expect(
      contacts.columnFilters({
        filter: {
          status: { in: ['active', 'archived'] },
          email: 'ada@example.com',
          priority: { gte: 2, lte: 4 },
          kind: ['person'],
          or: OR,
        },
      }),
    ).toEqual([
      { id: 'status', value: { in: ['active', 'archived'] } },
      { id: 'email', value: { eq: 'ada@example.com' } },
      { id: 'priority', value: { gte: 2, lte: 4 } },
      { id: 'kind', value: { eq: ['person'] } },
    ]);
  });

  it('is empty for a state without filter, and skips a condition set to undefined', () => {
    expect(contacts.columnFilters({})).toEqual([]);
    expect(
      contacts.columnFilters({ filter: { name: undefined, vip: false } }),
    ).toEqual([{ id: 'vip', value: { eq: false } }]);
  });
});

describe('withColumnFilters: Table v9 column filters written back as filter (resource SPEC 20.7)', () => {
  it('writes each filter under its member, keeps or, and drops the cursors but keeps the page size', () => {
    const state = {
      filter: { name: { eq: 'Ada' }, or: OR },
      page: { size: 5, after: 'c1' },
      sort: ['name'],
    };
    const next = contacts.withColumnFilters(state, [
      { id: 'status', value: { in: ['active'] } },
      { id: 'priority', value: { gte: '2', lte: undefined } },
    ]);
    expect(next).toStrictEqual({
      filter: { status: { in: ['active'] }, priority: { gte: '2' }, or: OR },
      page: { size: 5 },
      sort: ['name'],
    });
    expect(serializeQuery(Contacts.resource, next).toString()).toBe(
      'sort=name&page%5Bsize%5D=5&filter%5Bstatus%5D%5Bin%5D=active&filter%5Bpriority%5D%5Bgte%5D=2&filter%5Bor%5D%5B0%5D%5Bname%5D%5BstartsWithi%5D=a&filter%5Bor%5D%5B1%5D%5Bvip%5D=true',
    );
  });

  it('removes a filter whose value or every operator is undefined, and filter once none is left', () => {
    expect(
      contacts.withColumnFilters({ filter: { name: { eq: 'Ada' } } }, [
        { id: 'name', value: undefined },
        { id: 'priority', value: { gte: undefined, lte: undefined } },
      ]),
    ).toStrictEqual({});
    expect(
      contacts.withColumnFilters({ filter: { name: 'Ada', or: OR } }, []),
    ).toStrictEqual({ filter: { or: OR } });
  });

  it('leaves out an operator set to an empty list, which no parameter repeats, as Table removes an emptied list filter', () => {
    const next = contacts.withColumnFilters({}, [
      { id: 'status', value: { in: [] } },
      { id: 'tags', value: { contains: ['vip'], overlaps: [] } },
    ]);
    expect(next).toStrictEqual({ filter: { tags: { contains: ['vip'] } } });
    expect(serializeQuery(Contacts.resource, next).toString()).toBe(
      'filter%5Btags%5D%5Bcontains%5D=vip',
    );
    expect(
      contacts.withColumnFilters(
        next,
        setFilterValue('tags', { contains: [] }),
      ),
    ).toStrictEqual({});
  });

  it("applies Table's updater to the column filters the table shows", () => {
    const state = { filter: { status: 'active' } };
    const added = contacts.withColumnFilters(
      state,
      setFilterValue('name', { startsWithi: 'Ad' }),
    );
    expect(added).toStrictEqual({
      filter: { status: { eq: 'active' }, name: { startsWithi: 'Ad' } },
    });
    expect(
      contacts.withColumnFilters(added, setFilterValue('status', undefined)),
    ).toStrictEqual({ filter: { name: { startsWithi: 'Ad' } } });
  });

  it('never changes the state it is given', () => {
    const state = Object.freeze({
      filter: Object.freeze({ status: Object.freeze({ in: ['active'] }) }),
    });
    contacts.withColumnFilters(state, setFilterValue('vip', { eq: true }));
    expect(state).toEqual({ filter: { status: { in: ['active'] } } });
  });

  it.each([
    [
      'filters that are not a list',
      { status: 'active' },
      'filters must be a list of { id, value }',
    ],
    [
      'an entry without an id',
      [{ value: { eq: 'x' } }],
      'filters must be a list of { id, value }',
    ],
    [
      'an entry that is null',
      [null],
      'filters must be a list of { id, value }',
    ],
    [
      'an updater that returns no list',
      () => null,
      'filters must be a list of { id, value }',
    ],
    [
      'a member without filter',
      [{ id: 'nickname', value: { eq: 'x' } }],
      'a filter of contacts names a member that does not filter',
    ],
    [
      'the or member',
      [{ id: 'or', value: { eq: 'x' } }],
      'a filter of contacts names a member that does not filter',
    ],
    [
      'a public name nothing has',
      [{ id: 'toString', value: { eq: 'x' } }],
      'a filter of contacts names a member that does not filter',
    ],
    [
      'an operator the member does not declare',
      [{ id: 'name', value: { containsi: 'x' } }],
      'a filter of contacts has an operator its member does not declare',
    ],
    [
      'an undeclared operator set to undefined',
      [{ id: 'name', value: { lt: undefined } }],
      'a filter of contacts has an operator its member does not declare',
    ],
    [
      'a bare value',
      [{ id: 'name', value: 'Ada' }],
      "a column filter's value must be an object of operators",
    ],
    [
      'a list',
      [{ id: 'status', value: ['active'] }],
      "a column filter's value must be an object of operators",
    ],
  ])('throws TypeError for %s', (_case, filters, message) => {
    expect(() =>
      Reflect.apply(contacts.withColumnFilters, undefined, [{}, filters]),
    ).toThrow(new TypeError(`resourceList.withColumnFilters: ${message}`));
  });
});
