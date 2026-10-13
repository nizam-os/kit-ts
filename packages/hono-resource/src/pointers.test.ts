/**
 * Moving a refusal's items (resource SPEC 19.3): the runtime points into
 * the resource object at `/data`, and a relationship document holds the
 * linkage at `/data`, so the relationship and its linkage move there and
 * any other member loses its pointer.
 * @ref https://jsonapi.org/format/1.1/#error-objects
 */
import { describe, expect, it } from 'vitest';

import { BanError, jsonApiError } from '@nizam-os/hono-jsonapi';

import { linkagePath, moveItems } from './pointers';

const BASE = ['data'];

/** Moves an item as a relationship route of `parent` does. */
function move(path: ReadonlyArray<string | number>) {
  return linkagePath(path, 'parent', BASE);
}

describe('linkagePath', () => {
  it.each([
    [['data', 'relationships', 'parent'], ['data']],
    [['data', 'relationships', 'parent', 'data'], ['data']],
    [
      ['data', 'relationships', 'parent', 'data', 'id'],
      ['data', 'id'],
    ],
    [['data', 'relationships', 'parent', 'meta'], undefined],
    [['data', 'relationships', 'workspace', 'data'], undefined],
    [['data', 'attributes', 'title'], undefined],
    [['data', 'id'], undefined],
    [[], undefined],
  ])('moves %j to %j', (path, moved) => {
    expect(linkagePath(path, 'parent', BASE)).toEqual(moved);
  });

  it('roots the linkage at any base', () => {
    expect(
      linkagePath(
        ['data', 'relationships', 'parent', 'data', 'type'],
        'parent',
        ['atomic:operations', 2, 'data'],
      ),
    ).toEqual(['atomic:operations', 2, 'data', 'type']);
  });
});

describe('moveItems', () => {
  const refusal = jsonApiError([
    {
      code: 'NOT_FOUND',
      status: 404,
      detail: 'The related resource does not exist',
      path: ['data', 'relationships', 'parent'],
    },
    {
      code: 'NOT_FOUND',
      status: 404,
      detail: 'Another member',
      path: ['data', 'attributes', 'title'],
    },
    { code: 'NOT_FOUND', status: 404, detail: 'No pointer' },
    {
      code: 'NOT_FOUND',
      status: 404,
      detail: 'A query parameter',
      location: 'query',
      path: ['include'],
    },
  ]);

  it('moves body items, drops the pointer of another member, and keeps the rest', () => {
    const moved = moveItems(refusal, move);
    expect(moved).toBeInstanceOf(BanError);
    const errors = (moved as BanError).errors ?? [];
    expect(errors.map((item) => [item.detail, item.path])).toEqual([
      ['The related resource does not exist', ['data']],
      ['Another member', undefined],
      ['No pointer', undefined],
      ['A query parameter', ['include']],
    ]);
    expect(errors.map((item) => Object.hasOwn(item, 'path'))).toEqual([
      true,
      false,
      false,
      true,
    ]);
  });

  it('keeps the error otherwise: its id, status, and code', () => {
    const moved = moveItems(refusal, move) as BanError;
    expect([moved.id, moved.status, moved.code]).toEqual([
      refusal.id,
      404,
      'NOT_FOUND',
    ]);
  });

  it('returns anything else as it is', () => {
    const failure = new Error('a connection failed');
    const plain = jsonApiError('FORBIDDEN');
    expect(moveItems(failure, move)).toBe(failure);
    expect(moveItems(plain, move)).toBe(plain);
  });
});
