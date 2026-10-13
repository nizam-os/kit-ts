import { describe, expect, it } from 'vitest';

import { BanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import { Lids } from './lids';

describe('Lids', () => {
  it('scopes local ids by type and rejects repeats and unknowns', () => {
    const lids = new Lids();
    lids.define('authors', 'x', '1', '/p');
    lids.define('articles', 'x', '2', '/q');
    expect(lids.resolve('authors', 'x', '/r')).toBe('1');
    expect(lids.resolve('articles', 'x', '/r')).toBe('2');
    expect(() => {
      lids.define('authors', 'x', '3', '/dup');
    }).toThrow(BanError);
    expect(() => lids.resolve('tags', 'x', '/missing')).toThrow(
      /does not refer to a "tags"/u,
    );
  });

  it('replaces lid identifiers in linkage, keeping ids, meta, and order', () => {
    const lids = new Lids();
    lids.define('tags', 'a', 't1', '/p');
    expect(lids.linkage(null, '/d')).toBeNull();
    expect(lids.linkage({ type: 'tags', id: 'given' }, '/d')).toEqual({
      type: 'tags',
      id: 'given',
    });
    expect(
      lids.linkage(
        [
          { type: 'tags', id: 'given' },
          { type: 'tags', lid: 'a', meta: { m: 1 } },
        ],
        '/d',
      ),
    ).toEqual([
      { type: 'tags', id: 'given' },
      { type: 'tags', id: 't1', meta: { m: 1 } },
    ]);
    expect(() => lids.linkage([{ type: 'tags', lid: 'b' }], '/d')).toThrow(
      BanError,
    );
    try {
      lids.linkage(
        [
          { type: 'tags', id: 'x' },
          { type: 'tags', lid: 'b' },
        ],
        '/d',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(BanError);
      expect(errorObjects(error as BanError)[0]?.source).toEqual({
        pointer: '/d/1/lid',
      });
    }
  });
});
