/**
 * `keysetRequest` (SPEC 11.2): every query `parseQuery` accepts on a
 * declared resource becomes a request keyset-core plans, for every
 * operator of every keyset type, and a value keyset-core refuses stays its
 * own error.
 */
import type { FieldType } from '@nizam-os/keyset-core';

import type { StorageListRequest } from './storage';

import { describe, expect, it } from 'vitest';

import { parseQuery } from '@nizam-os/jsonapi-core';
import {
  createDefineKeyset,
  InvalidCursorError,
  InvalidFilterValueError,
  operatorsFor,
  UnsupportedFilterError,
} from '@nizam-os/keyset-core';

import { KIND_TYPES, Kinds, MOODS } from '../test-support/keyset-kinds';
import { keysetRequest } from './keyset-request';

const keyset = createDefineKeyset({
  cursor: { secret: 'a cursor secret of at least thirty-two bytes' },
})(Kinds.keyset);

/** Two values of each keyset type in their text form, as a query string carries them. */
const SAMPLES: Readonly<Record<string, readonly [string, string]>> = {
  text: ['a%b_c', 'z'],
  integer: ['-7', '42'],
  bigint: ['9007199254740993', '9007199254740995'],
  decimal: ['12.50', '99.99'],
  float: ['1.5e3', '2.5e3'],
  boolean: ['true', 'false'],
  uuid: [
    '018f3a2b-7c4d-7e8f-9a0b-1c2d3e4f5a6b',
    '018F3A2B-7C4D-7E8F-9A0B-1C2D3E4F5A6C',
  ],
  enum: MOODS,
  date: ['2024-02-29', '2024-03-01'],
  timestamp: ['2024-02-29 12:30:00.123456', '2024-03-01T00:00:00'],
  timestamptz: ['2024-02-29T12:30:00Z', '2024-03-01 00:00:00+02:00'],
  array: ['x', 'y, z'],
};

/** What a query sends for one operator, and the value keyset-core takes for it (keyset SPEC 4.2). */
interface Sent {
  readonly values: ReadonlyArray<string>;
  readonly value: unknown;
}

function sentFor(type: FieldType, op: string): ReadonlyArray<Sent> {
  const [low, high] = SAMPLES[type] ?? ['', ''];
  if (op === 'isNull') {
    return [
      { values: ['true'], value: true },
      { values: ['false'], value: false },
    ];
  }
  if (op === 'between') {
    return [{ values: [low, high], value: [low, high] }];
  }
  if (op === 'in' || op === 'nin' || type === 'array') {
    return [
      { values: [low], value: [low] },
      { values: [low, high], value: [low, high] },
    ];
  }
  return [{ values: [low], value: low }];
}

function filterQuery(
  name: string,
  op: string,
  values: ReadonlyArray<string>,
): string {
  const params = new URLSearchParams();
  for (const value of values) {
    params.append(`filter[${name}][${op}]`, value);
  }
  return params.toString();
}

/** The request a list route builds for a query string. */
function requestOf(query: string): StorageListRequest {
  return keysetRequest(Kinds, parseQuery(Kinds.resource, query));
}

describe('keysetRequest: filters (SPEC 11.2)', () => {
  it('maps every operator of every keyset type to a condition keyset-core plans', async () => {
    const mapped = new Set<string>();
    for (const [name, type] of Object.entries(KIND_TYPES)) {
      for (const op of operatorsFor(type, true)) {
        for (const { values, value } of sentFor(type, op)) {
          const request = requestOf(filterQuery(name, op, values));
          expect(request.filter).toEqual({ field: name, op, value });
          await expect(keyset.plan(request)).resolves.toBeDefined();
          mapped.add(`${name} ${op}`);
        }
      }
    }
    expect([...mapped]).toEqual(
      Object.entries(Kinds.resource.query.filter).flatMap(([name, ops]) =>
        ops.map((op) => `${name} ${op}`),
      ),
    );
  });

  it('plans isNull=false as IS NOT NULL and one list value as a list of one', async () => {
    const notNull = await keyset.plan(requestOf('filter[label][isNull]=false'));
    expect(notNull.filter).toMatchObject({ kind: 'null', negate: true });
    const one = await keyset.plan(requestOf('filter[mood][nin]=calm'));
    expect(one.filter).toMatchObject({
      kind: 'in',
      values: ['calm'],
      negate: true,
    });
  });

  it('joins the conditions and the filter[or][n] groups with and, a group with or', async () => {
    const request = requestOf(
      'filter[label]=a&filter[or][0][count][gt]=1&filter[or][0][count][isNull]=true&filter[or][1][mood][in]=calm',
    );
    expect(request.filter).toEqual({
      and: [
        { field: 'label', op: 'eq', value: 'a' },
        {
          or: [
            { field: 'count', op: 'gt', value: '1' },
            { field: 'count', op: 'isNull', value: true },
          ],
        },
        { field: 'mood', op: 'in', value: ['calm'] },
      ],
    });
    const plan = await keyset.plan(request);
    expect(plan.filter).toMatchObject({
      kind: 'and',
      items: [{ kind: 'compare' }, { kind: 'or' }, { kind: 'in' }],
    });
  });

  it('keeps a lone condition or group as it is, and gives no filter without one', () => {
    expect(requestOf('filter[or][0][label]=a').filter).toEqual({
      field: 'label',
      op: 'eq',
      value: 'a',
    });
    expect(
      requestOf('filter[or][3][label]=a&filter[or][3][label][ne]=b').filter,
    ).toEqual({
      or: [
        { field: 'label', op: 'eq', value: 'a' },
        { field: 'label', op: 'ne', value: 'b' },
      ],
    });
    expect(requestOf('sort=label').filter).toBeUndefined();
  });

  it.each([
    ['filter[label][isNull]=yes', 'label', 'isNull', 'boolean'],
    [
      'filter[label][isNull]=true&filter[label][isNull]=true',
      'label',
      'isNull',
      'boolean',
    ],
    ['filter[label][between]=a', 'label', 'between', '[low, high]'],
    ['filter[label]=a&filter[label]=b', 'label', 'eq', 'text'],
    ['filter[count][gte]=many', 'count', 'gte', 'integer'],
    ['filter[mood]=angry', 'mood', 'eq', 'one of "calm", "busy"'],
    ['filter[active]=yes', 'active', 'eq', 'boolean'],
  ])(
    "%s stays keyset-core's InvalidFilterValueError",
    async (query, field, operator, expected) => {
      const planned = keyset.plan(requestOf(query));
      await expect(planned).rejects.toBeInstanceOf(InvalidFilterValueError);
      await expect(planned).rejects.toMatchObject({
        values: [{ field, operator, expected }],
      });
    },
  );

  it('leaves every refused value to keyset-core, the conditions before the groups', async () => {
    const planned = keyset.plan(
      requestOf(
        'filter[or][0][mood]=angry&filter[or][0][active]=yes&filter[count][gte]=many',
      ),
    );
    await expect(planned).rejects.toMatchObject({
      values: [
        { field: 'count', operator: 'gte', expected: 'integer' },
        { field: 'mood', operator: 'eq', expected: 'one of "calm", "busy"' },
        { field: 'active', operator: 'eq', expected: 'boolean' },
      ],
    });
  });

  it("throws keyset-core's UnsupportedFilterError for an operator it does not have", () => {
    const query = {
      ...parseQuery(Kinds.resource, ''),
      filter: {
        conditions: [
          {
            field: 'label',
            operator: 'like',
            value: 'a%',
            parameter: 'filter[label][like]',
          },
        ],
        anyOf: [],
      },
    };
    expect(() => keysetRequest(Kinds, query)).toThrow(UnsupportedFilterError);
  });
});

describe('keysetRequest: sort, search, and page (SPEC 11.2)', () => {
  it('passes them as parseQuery gives them', async () => {
    const request = requestOf(
      'sort=-label,count&filter[q]=ada%20lovelace&page[size]=3',
    );
    const sort = [
      { field: 'label', direction: 'desc' },
      { field: 'count', direction: 'asc' },
    ];
    expect(request).toEqual({
      sort,
      search: 'ada lovelace',
      page: { size: 3, after: undefined, before: undefined },
    });
    const plan = await keyset.plan(request);
    expect(plan.sort).toEqual([...sort, { field: 'id', direction: 'asc' }]);
    expect(plan.size).toBe(3);
    expect(plan.filter).toMatchObject({ kind: 'textSearch' });
  });

  it('leaves sort out of a query without one, so the declared default applies', async () => {
    const request = requestOf('');
    expect(request.sort).toBeUndefined();
    const key = { field: 'id', direction: 'asc' };
    const plan = await keyset.plan(request);
    expect(plan.sort).toEqual([{ field: 'count', direction: 'desc' }, key]);
    // An empty sort is the key alone to keyset-core.
    const keyOnly = await keyset.plan({ ...request, sort: [] });
    expect(keyOnly.sort).toEqual([key]);
  });

  it('builds the same request for the next page of the same query, so its cursor resumes', async () => {
    const query =
      'filter[or][0][label]=a&filter[mood][in]=calm&sort=-count&page[size]=1';
    const first = await keyset.plan(requestOf(query));
    const rows = [
      ['3', '018f3a2b-7c4d-7e8f-9a0b-1c2d3e4f5a6b'],
      ['2', '018f3a2b-7c4d-7e8f-9a0b-1c2d3e4f5a6c'],
    ];
    const page = await keyset.page(first, rows, (row) => row);
    expect(page.next).toBeTypeOf('string');
    const after = `page[after]=${encodeURIComponent(String(page.next))}`;
    const next = await keyset.plan(requestOf(`${query}&${after}`));
    expect(next.seek).not.toHaveLength(0);
    const other = 'filter[mood][in]=busy&sort=-count&page[size]=1';
    const elsewhere = keyset.plan(requestOf(`${other}&${after}`));
    await expect(elsewhere).rejects.toBeInstanceOf(InvalidCursorError);
    await expect(elsewhere).rejects.toMatchObject({ reason: 'context' });
  });
});
