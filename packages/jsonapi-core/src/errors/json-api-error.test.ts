import type { ErrorItem } from '@nizam-os/ban-core';

import { describe, expect, it } from 'vitest';

import { createBan, isBanError } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';

import { ERROR_CATALOG, ERROR_CODES } from './catalog';
import {
  errorItem,
  errorObjects,
  jsonApiBan,
  jsonApiError,
} from './json-api-error';

function invalid(parameter: string): ErrorItem {
  return errorItem('INVALID_QUERY_PARAMETER', {
    detail: `${parameter} is bad`,
    source: { parameter },
  });
}

const UNSUPPORTED_SORT_TYPE =
  'https://jsonapi.org/profiles/ethanresnick/cursor-pagination/unsupported-sort';

describe('the catalog', () => {
  it('resolves every code the package emits with a 4xx or 5xx status and a title', () => {
    for (const code of ERROR_CODES) {
      const entry = jsonApiBan.catalog[code];
      expect(entry.status, code).toBeGreaterThanOrEqual(400);
      expect(entry.status, code).toBeLessThan(600);
      expect(entry.title.length, code).toBeGreaterThan(0);
      expect(entry.code, code).toBe(code);
    }
    expect(ERROR_CODES).toEqual([...new Set(ERROR_CODES)]);
    expect(ERROR_CODES).toEqual(
      expect.arrayContaining(Object.keys(ERROR_CATALOG)),
    );
  });

  it('spreads into an application instance that renders the same objects', () => {
    const ban = createBan({
      errors: { ...ERROR_CATALOG, TEAPOT: { status: 418 } },
      format: jsonApi({ mixedEntries: true }),
    });
    expect(ban.catalog.INVALID_DOCUMENT.title).toBe('Invalid Document');
    expect(ban.catalog.UNSUPPORTED_SORT.type).toBe(UNSUPPORTED_SORT_TYPE);
    expect(ban.TEAPOT().status).toBe(418);
    const error = jsonApiError('INVALID_DOCUMENT', {
      detail: 'bad',
      source: { pointer: '/data' },
    });
    expect(ban.render(error).body).toEqual(jsonApiBan.render(error).body);
  });
});

describe('errorItem', () => {
  it('carries the entry identity and turns a pointer into path segments', () => {
    expect(
      errorItem('INVALID_DOCUMENT', {
        detail: 'bad',
        source: { pointer: '/data/attributes/a~1b' },
      }),
    ).toEqual({
      status: 400,
      code: 'INVALID_DOCUMENT',
      title: 'Invalid Document',
      detail: 'bad',
      path: ['data', 'attributes', 'a/b'],
    });
    expect(
      errorItem('INVALID_DOCUMENT', {
        detail: 'whole',
        source: { pointer: '' },
      }).path,
    ).toEqual([]);
  });

  it("keeps a validator's reason and expected, and leaves them out when absent", () => {
    expect(
      errorItem('VALIDATION_FAILED', {
        detail: 'Must be at most 200 characters.',
        reason: 'maxLength',
        expected: '200',
      }),
    ).toMatchObject({ reason: 'maxLength', expected: '200' });
    expect(
      Object.keys(
        errorItem('VALIDATION_FAILED', {
          detail: 'x',
          reason: undefined,
          expected: undefined,
        }),
      ),
    ).toEqual(['status', 'code', 'title', 'detail']);
  });

  it('locates parameters in the query and headers in the headers', () => {
    expect(
      errorItem('INVALID_QUERY_PARAMETER', {
        detail: 'bad',
        source: { parameter: 'page[size]' },
      }),
    ).toMatchObject({ location: 'query', path: ['page[size]'] });
    expect(
      errorItem('NOT_ACCEPTABLE', {
        detail: 'bad',
        source: { header: 'Accept' },
      }),
    ).toMatchObject({ location: 'header', path: ['Accept'] });
    // One address per item: pointer wins, then parameter.
    expect(
      errorItem('NOT_FOUND', {
        detail: 'x',
        source: { pointer: '/a', parameter: 'b', header: 'C' },
      }),
    ).toMatchObject({ path: ['a'] });
    expect(
      errorItem('NOT_FOUND', {
        detail: 'x',
        source: { parameter: 'b', header: 'C' },
      }),
    ).toMatchObject({ location: 'query', path: ['b'] });
    const bare = errorItem('NOT_FOUND', { detail: 'x', source: {} });
    expect('path' in bare).toBe(false);
    expect('location' in bare).toBe(false);
  });

  it('keeps meta and the entry type link, and accepts @nizam-os/ban-core built-in codes', () => {
    expect(
      errorItem('MAX_PAGE_SIZE_EXCEEDED', {
        detail: 'x',
        source: { parameter: 'page[size]' },
        meta: { page: { maxSize: 10 } },
      }),
    ).toMatchObject({
      type: 'https://jsonapi.org/profiles/ethanresnick/cursor-pagination/max-size-exceeded',
      meta: { page: { maxSize: 10 } },
    });
    expect(errorItem('UNAUTHORIZED', { detail: 'x' })).toEqual({
      status: 401,
      code: 'UNAUTHORIZED',
      title: 'Unauthorized',
      detail: 'x',
    });
  });
});

describe('jsonApiError from a code', () => {
  it('renders the entry alone, or with a detail, as one object carrying the id', () => {
    const bare = jsonApiError('NOT_FOUND');
    expect(isBanError(bare)).toBe(true);
    expect(bare.status).toBe(404);
    expect(bare.errors).toBeUndefined();
    expect(errorObjects(bare)).toEqual([
      { id: bare.id, status: '404', code: 'NOT_FOUND', title: 'Not Found' },
    ]);
    const detailed = jsonApiError('FORBIDDEN', { detail: 'Read-only' });
    expect(detailed.message).toBe('Read-only');
    expect(errorObjects(detailed)[0]).toMatchObject({
      status: '403',
      detail: 'Read-only',
    });
  });

  it('renders a source back as the JSON:API member it came from', () => {
    const pointer = jsonApiError('CONFLICT', {
      detail: 'Taken',
      source: { pointer: '/data/id' },
    });
    expect(pointer.status).toBe(409);
    expect(pointer.errors).toHaveLength(1);
    expect(errorObjects(pointer)).toEqual([
      {
        id: pointer.id,
        status: '409',
        code: 'CONFLICT',
        title: 'Conflict',
        detail: 'Taken',
        source: { pointer: '/data/id' },
      },
    ]);
    const parameter = errorObjects(
      jsonApiError('INVALID_QUERY_PARAMETER', {
        detail: 'bad',
        source: { parameter: 'sort' },
      }),
    )[0];
    expect(parameter).toMatchObject({
      source: { parameter: 'sort' },
      meta: { location: 'query' },
    });
    const header = errorObjects(
      jsonApiError('NOT_ACCEPTABLE', {
        detail: 'bad',
        source: { header: 'Accept' },
      }),
    )[0];
    expect(header).toMatchObject({
      source: { header: 'Accept' },
      meta: { location: 'header' },
    });
  });

  it('keeps headers and the cause, and needs a detail next to a source', () => {
    const cause = new Error('db');
    const error = jsonApiError('METHOD_NOT_ALLOWED', {
      detail: 'POST only',
      headers: { Allow: 'POST' },
      cause,
    });
    expect(error.headers.get('allow')).toBe('POST');
    expect(error.cause).toBe(cause);
    expect(() =>
      // @ts-expect-error -- a source without a detail is a type error too
      jsonApiError('CONFLICT', { source: { pointer: '/data' } }),
    ).toThrow(TypeError);
  });
});

describe('jsonApiError from items', () => {
  it('is the shared entry when every item carries the same code', () => {
    const error = jsonApiError([invalid('sort'), invalid('include')]);
    expect(error.status).toBe(400);
    expect(error.code).toBe('INVALID_QUERY_PARAMETER');
    expect(error.message).toBe('Invalid Query Parameter');
    expect(errorObjects(error).map((object) => object.source)).toEqual([
      { parameter: 'sort' },
      { parameter: 'include' },
    ]);
    const single = jsonApiError(invalid('sort'));
    expect(single.message).toBe('sort is bad');
    expect(single.errors).toHaveLength(1);
  });

  it('derives the most generally applicable status when the codes differ', () => {
    const mixed = jsonApiError([
      invalid('sort'),
      errorItem('UNKNOWN_QUERY_PARAMETER', {
        detail: 'x',
        source: { parameter: 'foo' },
      }),
    ]);
    expect(mixed.status).toBe(400);
    expect(mixed.code).toBe('BAD_REQUEST');
    expect(errorObjects(mixed).map((object) => object.code)).toEqual([
      'INVALID_QUERY_PARAMETER',
      'UNKNOWN_QUERY_PARAMETER',
    ]);
    const severe = jsonApiError([
      errorItem('NOT_FOUND', { detail: 'a' }),
      errorItem('INTERNAL_SERVER_ERROR', { detail: 'b' }),
    ]);
    expect(severe.status).toBe(500);
    const agreeing = jsonApiError([
      errorItem('NOT_FOUND', { detail: 'a' }),
      errorItem('NOT_FOUND', { detail: 'b', source: { pointer: '/x' } }),
    ]);
    expect(agreeing.code).toBe('NOT_FOUND');
    expect(agreeing.message).toBe('Not Found');
  });

  it('falls back to a 500 for items without a status and rejects an empty list', () => {
    const anonymous = jsonApiError([{ detail: 'no identity' }]);
    expect(anonymous.status).toBe(500);
    expect(errorObjects(anonymous)[0]).toMatchObject({
      status: '500',
      code: 'INTERNAL_SERVER_ERROR',
      detail: 'no identity',
    });
    expect(() => jsonApiError([])).toThrow(TypeError);
  });
});
