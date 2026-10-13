import { describe, expect, it } from 'vitest';

import { createBan } from '@nizam-os/ban-core';
import { problemDetails } from '@nizam-os/ban-core/formats/problem-details';

import { errorDocument, jsonApiError } from './json-api-error';

describe('errorDocument', () => {
  it('orders jsonapi, links, meta before errors and drops undefined', () => {
    const document = errorDocument(jsonApiError('NOT_FOUND'), {
      jsonapi: { version: '1.1' },
      meta: undefined,
    });
    expect(Object.keys(document)).toEqual(['jsonapi', 'errors']);
    expect(document.errors[0]).toMatchObject({ code: 'NOT_FOUND' });
    expect(Object.keys(errorDocument(jsonApiError('NOT_FOUND')))).toEqual([
      'errors',
    ]);
  });

  it('renders any BanError, built elsewhere or in another format', () => {
    const other = createBan({ format: problemDetails() });
    const error = other.validation(
      [{ path: ['title'], message: 'Required', code: 'too_small' }],
      { location: 'body' },
    );
    expect(errorDocument(error).errors).toEqual([
      {
        id: error.id,
        status: '422',
        code: 'VALIDATION_FAILED',
        title: 'Validation Failed',
        detail: 'Required',
        source: { pointer: '/title' },
        meta: { location: 'body', code: 'too_small' },
      },
    ]);
  });
});

describe('getResponse', () => {
  it('answers in the JSON:API format with the error headers, as Hono does without a handler', async () => {
    const error = jsonApiError('NOT_ACCEPTABLE', {
      detail: 'no',
      source: { header: 'Accept' },
      headers: { Vary: 'Accept' },
    });
    const response = error.getResponse();
    expect(response.status).toBe(406);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.api+json',
    );
    expect(response.headers.get('vary')).toBe('Accept');
    expect(await response.json()).toEqual(errorDocument(error));
  });
});
