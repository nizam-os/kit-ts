import type { BanError } from '@nizam-os/ban-core';

import { describe, expect, it } from 'vitest';

import { isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import { ATOMIC_OPERATIONS_EXTENSION } from '../internal/constants';
import { assertOperationsContentType } from './content-type';

function rejected(contentType: string | undefined): BanError {
  try {
    assertOperationsContentType(contentType);
  } catch (error) {
    if (isBanError(error)) {
      return error;
    }
    throw error;
  }
  throw new Error(`expected ${String(contentType)} to be rejected`);
}

describe('assertOperationsContentType', () => {
  it('accepts the JSON:API media type whose ext lists the extension, alone or among others', () => {
    expect(() => {
      assertOperationsContentType(
        `application/vnd.api+json; ext="${ATOMIC_OPERATIONS_EXTENSION}"`,
      );
    }).not.toThrow();
    expect(() => {
      assertOperationsContentType(
        `application/vnd.api+json; profile="https://p.test/x"; ext="https://x.test/e ${ATOMIC_OPERATIONS_EXTENSION}"`,
      );
    }).not.toThrow();
  });

  it('rejects a missing header, the bare media type, another extension, and another media type with 415', () => {
    for (const contentType of [
      undefined,
      'application/vnd.api+json',
      'application/vnd.api+json; ext="https://x.test/e"',
      'application/json',
    ]) {
      const error = rejected(contentType);
      expect(error.status, String(contentType)).toBe(415);
      const [object] = errorObjects(error);
      expect(object).toMatchObject({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        source: { header: 'Content-Type' },
      });
      expect(object?.detail).toContain('ext=');
    }
  });
});
