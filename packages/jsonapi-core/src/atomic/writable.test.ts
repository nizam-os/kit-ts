/**
 * The fields each write accepts, through Atomic Operations (SPEC 9.2,
 * 11.4): an `add` or an `update` carrying a field its operation does not
 * write is a 403 at the field, and a relationship operation on a
 * relationship that updates do not write is a 403 although the host
 * registered a handler for it. No handler runs.
 */
import { describe, expect, it } from 'vitest';

import { isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import { defineResource } from '../resource/define-resource';
import { operationsProcessor } from './process';

const calls: Array<string> = [];
const TX = { name: 'transaction' };
const CTX = { name: 'caller' };

// `views` is read-only and `author` is set once.
const Posts = defineResource({
  type: 'posts',
  attributes: ['title', 'views'],
  relationships: { author: { type: 'people', cardinality: 'one' } },
  serialize: (row: { readonly id: string }) => ({ id: row.id }),
  writable: { create: ['title', 'author'], update: ['title'] },
});

const process = operationsProcessor<typeof TX, typeof CTX>({
  resources: [
    {
      resource: Posts,
      create: () => {
        calls.push('create');
        return { id: '1' };
      },
      update: () => {
        calls.push('update');
        return { id: '1' };
      },
      relationships: {
        author: {
          update: () => {
            calls.push('author');
          },
        },
      },
    },
  ],
  transaction: async (_ctx, run) => run(TX),
});

async function refused(
  operation: unknown,
): Promise<ReadonlyArray<readonly [string, number, unknown]>> {
  try {
    await process({ 'atomic:operations': [operation] }, CTX);
  } catch (error) {
    if (isBanError(error)) {
      return errorObjects(error).map((object) => [
        object.code ?? '',
        error.status,
        object.source,
      ]);
    }
    throw error;
  }
  throw new Error('expected a BanError');
}

describe('the fields a write accepts, in Atomic Operations', () => {
  it('refuses a field the add or the update does not write', async () => {
    calls.length = 0;
    expect(
      await refused({
        op: 'add',
        data: { type: 'posts', attributes: { title: 'A', views: 3 } },
      }),
    ).toEqual([
      [
        'FORBIDDEN',
        403,
        { pointer: '/atomic:operations/0/data/attributes/views' },
      ],
    ]);
    expect(
      await refused({
        op: 'update',
        ref: { type: 'posts', id: '1' },
        data: {
          type: 'posts',
          id: '1',
          relationships: { author: { data: null } },
        },
      }),
    ).toEqual([
      [
        'FORBIDDEN',
        403,
        { pointer: '/atomic:operations/0/data/relationships/author' },
      ],
    ]);
    expect(calls).toEqual([]);
  });

  it('refuses a relationship operation on a relationship updates do not write', async () => {
    calls.length = 0;
    expect(
      await refused({
        op: 'update',
        ref: { type: 'posts', id: '1', relationship: 'author' },
        data: { type: 'people', id: '2' },
      }),
    ).toEqual([['FORBIDDEN', 403, { pointer: '/atomic:operations/0' }]]);
    expect(calls).toEqual([]);
  });

  it('runs a create that carries only the fields it writes', async () => {
    calls.length = 0;
    await process(
      {
        'atomic:operations': [
          {
            op: 'add',
            data: {
              type: 'posts',
              attributes: { title: 'A' },
              relationships: { author: { data: { type: 'people', id: '2' } } },
            },
          },
        ],
      },
      CTX,
    );
    expect(calls).toEqual(['create']);
  });
});
