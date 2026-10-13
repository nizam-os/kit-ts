/**
 * `ResponseError` (SPEC 15.7): the status, the error objects with their
 * own codes, the headers a caller acts on, and a message that names the
 * type, the call, and the status, never the URL or the body.
 */
import { describe, expect, it } from 'vitest';

import { isResponseError, ResponseError } from './response-error';

const SECRET = 'filter-value-from-the-url';

const DOCUMENT = {
  errors: [
    {
      id: 'e1',
      status: '422',
      code: 'VALIDATION_FAILED',
      title: 'Validation Failed',
      detail: 'name is required',
      source: { pointer: '/data/attributes/name', parameter: 7 },
      links: { about: '/errors/validation', type: 3 },
      meta: { field: 'name' },
    },
    { status: 422, code: 404, title: 'Odd' },
    SECRET,
  ],
  links: { about: '/errors', self: 4 },
  meta: { requestId: 'r1' },
  jsonapi: { version: '1.1' },
};

describe('ResponseError (SPEC 15.7)', () => {
  it('names the type, the call, and the status, never the body', () => {
    const error = new ResponseError({
      type: 'articles',
      call: 'list',
      status: 422,
      body: { errors: [{ detail: SECRET }] },
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ResponseError');
    expect(error.message).toBe('articles list answered 422');
    expect(error.message).not.toContain(SECRET);
    expect(error.status).toBe(422);
  });

  it('keeps each error object member of its JSON:API type, the code its own', () => {
    const error = new ResponseError({
      type: 'contacts',
      call: 'create',
      status: 422,
      body: DOCUMENT,
    });
    expect(error.errors).toStrictEqual([
      {
        id: 'e1',
        status: '422',
        code: 'VALIDATION_FAILED',
        title: 'Validation Failed',
        detail: 'name is required',
        source: { pointer: '/data/attributes/name' },
        links: { about: '/errors/validation' },
        meta: { field: 'name' },
      },
      { title: 'Odd' },
    ]);
    expect(error.document).toStrictEqual({
      errors: error.errors,
      links: { about: '/errors' },
      meta: { requestId: 'r1' },
      jsonapi: { version: '1.1' },
    });
  });

  it.each([
    ['a proxy page', undefined],
    ['JSON without errors', { message: SECRET }],
    ['errors that are not a list', { errors: { code: 'X' } }],
  ])('has no error objects for %s', (_name, body) => {
    const error = new ResponseError({
      type: 'articles',
      call: 'get',
      status: 502,
      body,
    });
    expect(error.errors).toEqual([]);
    expect(error.document).toBeUndefined();
  });

  it('reads Allow and Retry-After', () => {
    const error = new ResponseError({
      type: 'articles',
      call: 'remove',
      status: 429,
      body: undefined,
      headers: new Headers({ 'Retry-After': '120', Allow: 'GET, HEAD' }),
    });
    expect(error.headers).toEqual({ allow: 'GET, HEAD', retryAfter: '120' });
    expect(
      new ResponseError({ type: 'a', call: 'get', status: 500, body: null })
        .headers,
    ).toEqual({ allow: undefined, retryAfter: undefined });
  });
});

describe('isResponseError (SPEC 15.7)', () => {
  const error = new ResponseError({
    type: 'contacts',
    call: 'create',
    status: 409,
    body: { errors: [{ code: 'CONTACT_EMAIL_TAKEN' }, { code: 'OTHER' }] },
  });

  it('is true for a ResponseError, and with a code, for one whose objects carry it', () => {
    expect(isResponseError(error)).toBe(true);
    expect(isResponseError(error, 'CONTACT_EMAIL_TAKEN')).toBe(true);
    expect(isResponseError(error, 'OTHER')).toBe(true);
    expect(isResponseError(error, 'MISSING')).toBe(false);
  });

  it('is false for anything else, an Error with the same members included', () => {
    expect(isResponseError(new Error('contacts create answered 409'))).toBe(
      false,
    );
    expect(
      isResponseError({ name: 'ResponseError', status: 409, errors: [] }),
    ).toBe(false);
    expect(isResponseError(null)).toBe(false);
    expect(isResponseError('ResponseError')).toBe(false);
  });

  it('recognizes one made by another copy of the package', () => {
    const copy = Object.assign(new Error('x'), {
      errors: [{ code: 'X' }],
      [Symbol.for('@nizam-os/jsonapi-client/response-error')]: true,
    });
    expect(isResponseError(copy, 'X')).toBe(true);
  });
});
