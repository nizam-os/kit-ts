import type { BanError } from '@nizam-os/ban-core';

import { describe, expect, it } from 'vitest';

import { isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import {
  parseToManyRelationshipDocument,
  parseToOneRelationshipDocument,
} from './relationship-document';

function thrown(run: () => unknown): BanError & {
  readonly objects: ReturnType<typeof errorObjects>;
} {
  try {
    run();
  } catch (error) {
    if (isBanError(error)) {
      return Object.assign(error, { objects: errorObjects(error) });
    }
    throw error;
  }
  throw new Error('expected a BanError');
}

describe('parseToOneRelationshipDocument', () => {
  it('accepts an identifier of the related type or null', () => {
    expect(
      parseToOneRelationshipDocument(
        { data: { type: 'people', id: '12' } },
        { type: 'people' },
      ),
    ).toEqual({ type: 'people', id: '12' });
    expect(
      parseToOneRelationshipDocument({ data: null }, { type: 'people' }),
    ).toBeNull();
  });

  it('rejects arrays, wrong types, lids, and missing data', () => {
    expect(
      thrown(() =>
        parseToOneRelationshipDocument({ data: [] }, { type: 'people' }),
      ).objects[0],
    ).toMatchObject({
      status: '400',
      source: { pointer: '/data' },
    });
    const wrong = thrown(() =>
      parseToOneRelationshipDocument(
        { data: { type: 'robots', id: '1' } },
        { type: 'people' },
      ),
    );
    expect(wrong.status).toBe(409);
    expect(wrong.objects[0]?.source?.pointer).toBe('/data/type');
    expect(
      thrown(() =>
        parseToOneRelationshipDocument(
          { data: { type: 'people', lid: 'x' } },
          { type: 'people' },
        ),
      ).objects[0]?.detail,
    ).toBe('A resource identifier object must have a string id');
    expect(
      thrown(() => parseToOneRelationshipDocument({}, { type: 'people' }))
        .objects[0]?.source,
    ).toEqual({
      pointer: '',
    });
  });
});

describe('parseToOneRelationshipDocument: identifier members', () => {
  it('rejects a non-object meta and keeps an object meta', () => {
    expect(
      thrown(() =>
        parseToOneRelationshipDocument(
          { data: { type: 'people', id: '1', meta: 'x' } },
          { type: 'people' },
        ),
      ).objects[0]?.source,
    ).toEqual({ pointer: '/data/meta' });
    expect(
      parseToOneRelationshipDocument(
        { data: { type: 'people', id: '1', meta: { m: 1 } } },
        { type: 'people' },
      ),
    ).toEqual({ type: 'people', id: '1', meta: { m: 1 } });
  });
});

describe('parseToManyRelationshipDocument', () => {
  it('accepts an array of identifiers, including an empty one', () => {
    expect(
      parseToManyRelationshipDocument(
        {
          data: [
            { type: 'tags', id: '2' },
            { type: 'tags', id: '3' },
          ],
        },
        { type: 'tags' },
      ),
    ).toEqual([
      { type: 'tags', id: '2' },
      { type: 'tags', id: '3' },
    ]);
    expect(
      parseToManyRelationshipDocument({ data: [] }, { type: 'tags' }),
    ).toEqual([]);
  });

  it('rejects null, objects, and bad members with indexed pointers', () => {
    expect(
      thrown(() =>
        parseToManyRelationshipDocument({ data: null }, { type: 'tags' }),
      ).objects[0]?.detail,
    ).toBe(
      'A to-many relationship takes an array of resource identifier objects',
    );
    const bad = thrown(() =>
      parseToManyRelationshipDocument(
        {
          data: [
            { type: 'tags', id: '1' },
            { type: 'tags' },
            'x',
            { type: 'tags', id: 2 },
          ],
        },
        { type: 'tags' },
      ),
    );
    expect(bad.objects.map((error) => error.source?.pointer)).toEqual([
      '/data/1',
      '/data/2',
      '/data/3/id',
    ]);
  });
});
