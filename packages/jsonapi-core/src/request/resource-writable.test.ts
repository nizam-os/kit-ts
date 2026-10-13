/**
 * The fields each write accepts (SPEC 5, 9.2): a declared field that the
 * operation's `writable` list leaves out is a 403 at its pointer, in a
 * create and in an update, for attributes and relationships alike. The
 * validator never sees such a request, and next to a structural error the
 * 403 is one object of the combined 400.
 */
import type { ErrorObject } from '../document/types';

import { describe, expect, it } from 'vitest';

import { isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import { defineResource } from '../resource/define-resource';
import { parseCreateDocument, parseUpdateDocument } from './resource-document';

const validated: Array<unknown> = [];

/** A Standard Schema that accepts anything and records what it saw. */
const recording = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => {
      validated.push(value);
      return { value };
    },
  },
};

// `views` is read-only, `slug` and `author` are set once, `title` and `tags` always.
const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'slug', 'views'],
  relationships: {
    author: { type: 'people', cardinality: 'one' },
    tags: { type: 'tags', cardinality: 'many' },
  },
  serialize: (row: { readonly id: string }) => ({ id: row.id }),
  validate: { create: recording, update: recording },
  writable: {
    create: ['title', 'slug', 'author', 'tags'],
    update: ['title', 'tags'],
  },
});

async function refusal(promise: Promise<unknown>): Promise<{
  status: number;
  errors: ReadonlyArray<ErrorObject>;
}> {
  try {
    await promise;
  } catch (error) {
    if (isBanError(error)) {
      return { status: error.status, errors: errorObjects(error) };
    }
    throw error;
  }
  throw new Error('expected a BanError');
}

describe('the fields a write accepts', () => {
  it('refuses a field the create does not write with 403, before validation', async () => {
    validated.length = 0;
    const { status, errors } = await refusal(
      parseCreateDocument(Articles, {
        data: { type: 'articles', attributes: { title: 'A', views: 3 } },
      }),
    );
    expect(status).toBe(403);
    expect(errors).toMatchObject([
      {
        status: '403',
        code: 'FORBIDDEN',
        title: 'Forbidden',
        detail: '"articles" does not accept "views" on create',
        source: { pointer: '/data/attributes/views' },
      },
    ]);
    expect(validated).toEqual([]);
  });

  it('refuses on update the attribute and the relationship only a create writes', async () => {
    const { status, errors } = await refusal(
      parseUpdateDocument(
        Articles,
        {
          data: {
            type: 'articles',
            id: '1',
            attributes: { slug: 'a' },
            relationships: { author: { data: null } },
          },
        },
        '1',
      ),
    );
    expect(status).toBe(403);
    expect(errors.map(({ code, source }) => [code, source])).toEqual([
      ['FORBIDDEN', { pointer: '/data/attributes/slug' }],
      ['FORBIDDEN', { pointer: '/data/relationships/author' }],
    ]);
  });

  it('takes every field each write lists', async () => {
    validated.length = 0;
    const created = await parseCreateDocument(Articles, {
      data: {
        type: 'articles',
        attributes: { title: 'A', slug: 'a' },
        relationships: {
          author: { data: { type: 'people', id: '7' } },
          tags: { data: [] },
        },
      },
    });
    expect(created.relationships).toEqual({
      author: { type: 'people', id: '7' },
      tags: [],
    });
    const updated = await parseUpdateDocument(
      Articles,
      {
        data: {
          type: 'articles',
          id: '1',
          attributes: { title: 'B' },
          relationships: { tags: { data: [{ type: 'tags', id: 't' }] } },
        },
      },
      '1',
    );
    expect(updated.attributes).toEqual({ title: 'B' });
    expect(validated).toEqual([{ title: 'A', slug: 'a' }, { title: 'B' }]);
  });

  it('joins a structural error in a combined 400', async () => {
    const { status, errors } = await refusal(
      parseCreateDocument(Articles, {
        data: { type: 'articles', attributes: { colour: 'red', views: 3 } },
      }),
    );
    expect(status).toBe(400);
    expect(errors.map(({ code, source }) => [code, source])).toEqual([
      ['INVALID_DOCUMENT', { pointer: '/data/attributes/colour' }],
      ['FORBIDDEN', { pointer: '/data/attributes/views' }],
    ]);
  });

  it('accepts every field without a list', async () => {
    const Open = defineResource({
      type: 'notes',
      attributes: ['text'],
      serialize: (row: { readonly id: string }) => ({ id: row.id }),
    });
    await expect(
      parseCreateDocument(Open, {
        data: { type: 'notes', attributes: { text: 'x' } },
      }),
    ).resolves.toMatchObject({ attributes: { text: 'x' } });
  });
});
