import { describe, expect, it } from 'vitest';

import { createBan } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';

import { Things } from '../test-support/violations';
import { reject, Rejection, rejectionError } from './reject';

const APP_ERRORS = {
  THING_IN_USE: { status: 409, title: 'Thing In Use' },
  SEAT_LIMIT: { status: 402, title: 'Seat Limit', code: 'seat_limit_reached' },
} as const;

/** The `Rejection` `run` throws. */
function caught(run: () => unknown): Rejection {
  try {
    run();
  } catch (error) {
    if (error instanceof Rejection) {
      return error;
    }
    throw error;
  }
  throw new Error('nothing was thrown');
}

/** `reject` as JavaScript calls it: no type checks the arguments. */
function untypedReject(...args: ReadonlyArray<unknown>) {
  return () => Reflect.apply(reject, undefined, args);
}

describe('reject (SPEC 12.4)', () => {
  it('throws a Rejection carrying the code, the members, and the detail', () => {
    const rejection = caught(() =>
      reject('THING_IN_USE', {
        fields: ['owner'],
        detail: 'Meetings still name it.',
      }),
    );
    expect(rejection).toBeInstanceOf(Error);
    expect(rejection.name).toBe('Rejection');
    expect(rejection.message).toBe('Rejected with THING_IN_USE');
    expect([rejection.code, rejection.fields, rejection.detail]).toEqual([
      'THING_IN_USE',
      ['owner'],
      'Meetings still name it.',
    ]);
    expect(Object.isFrozen(rejection.fields)).toBe(true);
  });

  it('needs no options', () => {
    const rejection = caught(() => reject('THING_IN_USE'));
    expect([rejection.fields, rejection.detail]).toEqual([[], undefined]);
  });

  it.each([
    [[7], 'reject: the code must be a string'],
    [
      ['X', null],
      'reject: options must be { fields?: string[], detail?: string }',
    ],
    [
      ['X', { fields: 'owner' }],
      'reject: options must be { fields?: string[], detail?: string }',
    ],
    [
      ['X', { fields: [1] }],
      'reject: options must be { fields?: string[], detail?: string }',
    ],
    [
      ['X', { detail: 5 }],
      'reject: options must be { fields?: string[], detail?: string }',
    ],
  ])('refuses the JavaScript arguments %j', (args, message) => {
    expect(untypedReject(...args)).toThrow(new TypeError(message));
  });
});

describe('rejectionError (SPEC 12.4)', () => {
  const inUse = new Rejection('THING_IN_USE', {
    fields: ['owner', 'id', 'name'],
    detail: 'Meetings still name it.',
  });

  it("builds the code's error with an item per member under the pointer", () => {
    const error = rejectionError(inUse, {
      resource: Things,
      errors: APP_ERRORS,
    });
    expect([error.status, error.code, error.title, error.detail]).toEqual([
      409,
      'THING_IN_USE',
      'Thing In Use',
      'Meetings still name it.',
    ]);
    expect(error.errors).toEqual([
      {
        detail: 'Meetings still name it.',
        path: ['data', 'relationships', 'owner'],
      },
      { detail: 'Meetings still name it.', path: ['data', 'id'] },
      {
        detail: 'Meetings still name it.',
        path: ['data', 'attributes', 'name'],
      },
    ]);
    expect(error.cause).toBe(inUse);
  });

  it('points under an Atomic Operations operation', () => {
    const error = rejectionError(inUse, {
      resource: Things,
      errors: APP_ERRORS,
      pointer: '/atomic:operations/1/data',
    });
    expect(error.errors?.[0]?.path).toEqual([
      'atomic:operations',
      '1',
      'data',
      'relationships',
      'owner',
    ]);
  });

  it('renders as ban.error renders the same code', () => {
    const ban = createBan({
      format: jsonApi({ includeId: false }),
      errors: APP_ERRORS,
    });
    const limit = new Rejection('SEAT_LIMIT');
    const error = rejectionError(limit, {
      resource: Things,
      errors: APP_ERRORS,
    });
    expect(error.code).toBe('seat_limit_reached');
    expect(error.definition?.key).toBe('SEAT_LIMIT');
    expect(error.errors).toBeUndefined();
    expect(ban.render(error)).toEqual(ban.render(ban.error('SEAT_LIMIT')));
  });

  it.each([
    [
      { resource: {}, errors: APP_ERRORS },
      'rejectionError: options.resource must be a resource declareResource returned',
    ],
    [
      { resource: Things, errors: {} },
      'rejectionError: options.errors has no code THING_IN_USE',
    ],
    [
      { resource: Things, errors: { THING_IN_USE: { title: 'x' } } },
      'rejectionError: options.errors has no code THING_IN_USE',
    ],
    [
      { resource: Things, errors: APP_ERRORS, pointer: 'data' },
      'rejectionError: options.pointer must be an RFC 6901 JSON Pointer',
    ],
  ])('refuses the JavaScript options %j', (options, message) => {
    expect(() =>
      Reflect.apply(rejectionError, undefined, [inUse, options]),
    ).toThrow(new TypeError(message));
  });

  it('refuses a member the resource does not have', () => {
    const typo = new Rejection('THING_IN_USE', { fields: ['ownr'] });
    expect(() =>
      rejectionError(typo, { resource: Things, errors: APP_ERRORS }),
    ).toThrow(
      new TypeError(
        'rejectionError: THING_IN_USE names "ownr", which things has no member called',
      ),
    );
  });
});
