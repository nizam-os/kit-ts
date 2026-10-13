import type { Keyset } from '@nizam-os/keyset-core';

import { describe, expect, it } from 'vitest';

import {
  errorObjects,
  MAX_SIZE_EXCEEDED_TYPE,
  RANGE_PAGINATION_NOT_SUPPORTED_TYPE,
  UNSUPPORTED_SORT_TYPE,
} from '@nizam-os/jsonapi-core';
import { defineKeyset } from '@nizam-os/keyset-core';

import { keysetRefusal } from './keyset-refusal';

/** Untyped, so a test can send what a client may: names the keyset never declared. */
const contacts: Keyset = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text' },
    age: { column: 'age', type: 'integer', nullable: true },
  },
  page: { default: 5, max: 10 },
  cursor: { secret: 'the refusal tests sign their cursors with this' },
});

/** The error objects of what planning `request` is refused with. */
async function refused(request: Parameters<Keyset['plan']>[0]) {
  const thrown = await contacts.plan(request).then(
    () => null,
    (error: unknown) => error,
  );
  const error = keysetRefusal(thrown);
  if (error === undefined) {
    throw new Error('the request was not refused by the keyset');
  }
  return { status: error.status, objects: errorObjects(error) };
}

describe('keysetRefusal: the profile errors (resource SPEC 18.5)', () => {
  it('an unsupported sort: one UNSUPPORTED_SORT item per field, typed by the profile', async () => {
    const { status, objects } = await refused({ sort: ['nope', '-bad'] });
    expect(status).toBe(400);
    expect(
      objects.map(({ code, source, links }) => ({ code, source, links })),
    ).toEqual([
      {
        code: 'UNSUPPORTED_SORT',
        source: { parameter: 'sort' },
        links: { type: UNSUPPORTED_SORT_TYPE },
      },
      {
        code: 'UNSUPPORTED_SORT',
        source: { parameter: 'sort' },
        links: { type: UNSUPPORTED_SORT_TYPE },
      },
    ]);
  });

  it('a page size over the maximum: MAX_PAGE_SIZE_EXCEEDED with the maximum in meta', async () => {
    const { status, objects } = await refused({ page: { size: 11 } });
    expect(status).toBe(400);
    expect(objects).toMatchObject([
      {
        code: 'MAX_PAGE_SIZE_EXCEEDED',
        source: { parameter: 'page[size]' },
        meta: { page: { maxSize: 10 } },
        links: { type: MAX_SIZE_EXCEEDED_TYPE },
      },
    ]);
  });

  it('both cursors where ranges are off: RANGE_PAGINATION_NOT_SUPPORTED', async () => {
    const { objects } = await refused({ page: { after: 'a', before: 'b' } });
    expect(objects).toMatchObject([
      {
        code: 'RANGE_PAGINATION_NOT_SUPPORTED',
        links: { type: RANGE_PAGINATION_NOT_SUPPORTED_TYPE },
      },
    ]);
  });

  it('a cursor the keyset did not issue: INVALID_QUERY_PARAMETER at the parameter it came in', async () => {
    for (const [page, parameter] of [
      [{ after: 'forged' }, 'page[after]'],
      [{ before: 'forged' }, 'page[before]'],
    ] as const) {
      const { status, objects } = await refused({ page });
      expect(status).toBe(400);
      expect(objects).toMatchObject([
        { code: 'INVALID_QUERY_PARAMETER', source: { parameter } },
      ]);
    }
  });
});

describe('keysetRefusal: the refusals the profile leaves to the server', () => {
  it('a value its field does not accept: at filter[field][operator], without the value', async () => {
    const { objects } = await refused({
      filter: { field: 'age', op: 'gte', value: 'very-old' },
    });
    expect(objects).toMatchObject([
      {
        code: 'INVALID_QUERY_PARAMETER',
        source: { parameter: 'filter[age][gte]' },
      },
    ]);
    expect(objects[0]?.detail).not.toContain('very-old');
  });

  it('every value its field does not accept: one object each, in the order of the conditions', async () => {
    const { status, objects } = await refused({
      filter: {
        and: [
          { field: 'age', op: 'gte', value: 'very-old' },
          { field: 'name', op: 'eq', value: 'Ada' },
          {
            or: [
              { field: 'age', op: 'lte', value: 'young' },
              { field: 'id', op: 'eq', value: 'not-a-uuid' },
            ],
          },
        ],
      },
    });
    expect(status).toBe(400);
    expect(objects.map(({ code, source }) => ({ code, source }))).toEqual([
      {
        code: 'INVALID_QUERY_PARAMETER',
        source: { parameter: 'filter[age][gte]' },
      },
      {
        code: 'INVALID_QUERY_PARAMETER',
        source: { parameter: 'filter[age][lte]' },
      },
      {
        code: 'INVALID_QUERY_PARAMETER',
        source: { parameter: 'filter[id][eq]' },
      },
    ]);
    expect(JSON.stringify(objects)).not.toMatch(/very-old|young|not-a-uuid/u);
  });

  it('an undeclared field or a malformed filter: at filter, naming nothing the client sent', async () => {
    for (const filter of [
      { field: 'secret-column', op: 'eq', value: 1 },
      { and: 'not-a-list' },
    ]) {
      const { objects } = await refused({ filter } as never);
      expect(objects).toMatchObject([
        { code: 'INVALID_QUERY_PARAMETER', source: { parameter: 'filter' } },
      ]);
      expect(objects[0]?.detail).not.toMatch(/secret-column|not-a-list/u);
    }
  });

  it('a search where none is declared: at filter[q]', async () => {
    const { objects } = await refused({ search: 'ada' });
    expect(objects).toMatchObject([
      { code: 'INVALID_QUERY_PARAMETER', source: { parameter: 'filter[q]' } },
    ]);
  });

  it('a page size that is not a positive integer: at page[size]', async () => {
    for (const size of [0, 2.5, -1]) {
      const { objects } = await refused({ page: { size } });
      expect(objects).toMatchObject([
        {
          code: 'INVALID_QUERY_PARAMETER',
          source: { parameter: 'page[size]' },
        },
      ]);
      expect(objects[0]?.detail).not.toContain(String(size));
    }
  });

  it('anything else is not a refusal', async () => {
    const misuse = await contacts
      .plan({}, { context: { tenant: { nested: true } } } as never)
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(misuse).toBeInstanceOf(TypeError);
    expect(keysetRefusal(misuse)).toBeUndefined();
    expect(keysetRefusal(new Error('lost connection'))).toBeUndefined();
    expect(keysetRefusal(null)).toBeUndefined();
  });
});
