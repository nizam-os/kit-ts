/**
 * `query(search)` when `parseQuery` answers what jsonapi-core's own never
 * does (resource SPEC 20.7, step 3), for a search as parameters and as
 * JSON: a refusal one of whose error objects names no parameter, which
 * leaves nothing to drop and so reads as the empty state; a refusal naming
 * only parameters the search did not hold, which would read the same
 * parameters again; and an error that is no refusal, which is no reading
 * of the search and is thrown as it is. The double wraps jsonapi-core's
 * `parseQuery` and answers once.
 */
import type * as JsonApiCore from '@nizam-os/jsonapi-core';

import { describe, expect, it, vi } from 'vitest';

import { jsonApiError, parseQuery } from '@nizam-os/jsonapi-core';

import { Contacts } from '../test-support/resources';
import { lenientQuery } from './lenient-query';

vi.mock('@nizam-os/jsonapi-core', async (importOriginal) => {
  const actual = await importOriginal<typeof JsonApiCore>();
  return { ...actual, parseQuery: vi.fn(actual.parseQuery) };
});

/** What `query` reads, before it names every member (resource-list.test.ts). */
function read(search: unknown) {
  return lenientQuery(Contacts.resource, search);
}

const SEARCHES = [
  ['parameters', 'sort=name&page[size]=5'],
  ['JSON', { sort: ['name'], page: { size: 5 } }],
] as const;

/** The parameters each `parseQuery` call read. */
function readings() {
  return vi
    .mocked(parseQuery)
    .mock.calls.map(([, params]) => (params as URLSearchParams).toString());
}

describe.each(SEARCHES)(
  'query of %s: refusals jsonapi-core never makes (resource SPEC 20.7)',
  (_form, search) => {
    it('reads as the empty state when an error object names no parameter', () => {
      vi.mocked(parseQuery).mockImplementationOnce(() => {
        throw jsonApiError('INVALID_QUERY_PARAMETER', { detail: 'Refused' });
      });
      expect(read(search)).toStrictEqual({});
      expect(readings()).toHaveLength(1);
    });

    it('reads as the empty state when the refusal names only parameters the search did not hold', () => {
      vi.mocked(parseQuery).mockImplementationOnce(() => {
        throw jsonApiError('INVALID_QUERY_PARAMETER', {
          detail: 'Refused',
          source: { parameter: 'page[before]' },
        });
      });
      expect(read(search)).toStrictEqual({});
      expect(readings()).toHaveLength(1);
    });

    it('throws an error that is no refusal as it is', () => {
      const fault = new RangeError('the definition broke');
      vi.mocked(parseQuery).mockImplementationOnce(() => {
        throw fault;
      });
      expect(() => read(search)).toThrow(fault);
    });
  },
);

describe('query: each refusal read again without what it named (resource SPEC 20.7)', () => {
  it('drops a JSON search the refusal names', () => {
    vi.mocked(parseQuery).mockImplementationOnce(() => {
      throw jsonApiError('INVALID_QUERY_PARAMETER', {
        detail: 'Refused',
        source: { parameter: 'filter[q]' },
      });
    });
    expect(read({ sort: ['name'], search: 'ada' })).toStrictEqual({
      sort: ['name'],
    });
    expect(readings()).toEqual(['sort=name&filter%5Bq%5D=ada', 'sort=name']);
  });

  it.each([
    [
      'parameters',
      'sort=nickname&filter[vip]=true',
      { filter: { vip: { eq: 'true' } } },
    ],
    [
      'JSON',
      { sort: ['nickname'], filter: { vip: true } },
      { filter: { vip: true } },
    ],
  ] as const)(
    'reads %s again with the refused parameters dropped',
    (_form, search, state) => {
      expect(read(search)).toStrictEqual(state);
      expect(readings()).toEqual([
        'sort=nickname&filter%5Bvip%5D=true',
        'filter%5Bvip%5D=true',
      ]);
    },
  );
});
