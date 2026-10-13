import { describe, expect, it } from 'vitest';

import { isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import {
  MAX_SIZE_EXCEEDED_TYPE,
  RANGE_PAGINATION_NOT_SUPPORTED_TYPE,
  UNSUPPORTED_SORT_TYPE,
  invalidCursor,
  invalidCursorError,
  maxPageSizeExceededError,
  rangePaginationNotSupportedError,
  unsupportedSort,
  unsupportedSortError,
} from './errors';

const BASE = 'https://jsonapi.org/profiles/ethanresnick/cursor-pagination';

describe('cursor pagination profile errors', () => {
  it('uses the profile error type URIs as links.type', () => {
    expect(UNSUPPORTED_SORT_TYPE).toBe(`${BASE}/unsupported-sort`);
    expect(MAX_SIZE_EXCEEDED_TYPE).toBe(`${BASE}/max-size-exceeded`);
    expect(RANGE_PAGINATION_NOT_SUPPORTED_TYPE).toBe(
      `${BASE}/range-pagination-not-supported`,
    );
  });

  it('builds the max size item with the limit in meta and the parameter as its address', () => {
    expect(maxPageSizeExceededError(500, 100)).toEqual({
      status: 400,
      code: 'MAX_PAGE_SIZE_EXCEEDED',
      title: 'Max Page Size Exceeded',
      type: MAX_SIZE_EXCEEDED_TYPE,
      detail: 'page[size] 500 exceeds the maximum of 100',
      location: 'query',
      path: ['page[size]'],
      meta: { page: { maxSize: 100 } },
    });
  });

  it('builds the sort and range items against their parameters', () => {
    expect(unsupportedSortError('title')).toMatchObject({
      type: UNSUPPORTED_SORT_TYPE,
      code: 'UNSUPPORTED_SORT',
      location: 'query',
      path: ['sort'],
    });
    expect(rangePaginationNotSupportedError()).toMatchObject({
      type: RANGE_PAGINATION_NOT_SUPPORTED_TYPE,
      code: 'RANGE_PAGINATION_NOT_SUPPORTED',
      path: ['page[before]'],
    });
  });

  it('gives engines an invalid cursor item with a default or custom detail', () => {
    expect(invalidCursorError('page[after]')).toEqual({
      status: 400,
      code: 'INVALID_QUERY_PARAMETER',
      title: 'Invalid Query Parameter',
      detail: 'page[after] is not a valid cursor',
      location: 'query',
      path: ['page[after]'],
    });
    expect(invalidCursorError('page[before]', 'Expired').detail).toBe(
      'Expired',
    );
  });

  it('wraps the engine items as throwable errors that render with the type link', () => {
    const cursor = invalidCursor('page[after]');
    expect(isBanError(cursor)).toBe(true);
    expect(cursor.status).toBe(400);
    expect(errorObjects(cursor)[0]).toMatchObject({
      source: { parameter: 'page[after]' },
    });
    expect(errorObjects(cursor)[0]?.links).toBeUndefined();
    const sort = unsupportedSort('x');
    expect(errorObjects(sort)[0]?.links).toEqual({
      type: UNSUPPORTED_SORT_TYPE,
    });
  });
});
