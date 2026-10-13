import type { ErrorObject } from '../document/types';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BanError, isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import { defineResource } from '../resource/define-resource';
import { parseCreateDocument, primaryData } from './resource-document';

interface Row {
  readonly id: string;
}

const CreateArticle = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  rating: z.coerce.number().int().min(0).max(5).optional(),
});

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body', 'rating'],
  relationships: {
    author: { type: 'people', cardinality: 'one' },
    tags: { type: 'tags', cardinality: 'many' },
  },
  serialize: (row: Row) => ({ id: row.id }),
  validate: { create: CreateArticle, update: CreateArticle.partial() },
});

const Photos = defineResource({
  type: 'photos',
  attributes: ['src'],
  serialize: (row: Row) => ({ id: row.id }),
  clientIds: true,
});

async function errorsOf(promise: Promise<unknown>): Promise<{
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

describe('primaryData', () => {
  it('requires a JSON object with a data member', () => {
    expect(() => primaryData(null)).toThrow(BanError);
    expect(() => primaryData([])).toThrow(/must be a JSON object/u);
    expect(() => primaryData({ meta: {} })).toThrow(
      /must contain a data member/u,
    );
    expect(primaryData({ data: null })).toBeNull();
  });
});

describe('parseCreateDocument', () => {
  it('returns validated attributes, linkage, and meta', async () => {
    const parsed = await parseCreateDocument(Articles, {
      data: {
        type: 'articles',
        attributes: { title: 'Hi', rating: '4', '@context': 'ignored' },
        relationships: {
          author: { data: { type: 'people', id: '9' } },
          tags: {
            data: [
              { type: 'tags', id: 't1' },
              { type: 'tags', id: 't2', meta: { x: 1 } },
            ],
          },
        },
        meta: { client: 'web' },
        links: { self: '/ignored' },
      },
    });
    expect(parsed).toEqual({
      type: 'articles',
      id: undefined,
      lid: undefined,
      attributes: { title: 'Hi', rating: 4 },
      relationships: {
        author: { type: 'people', id: '9' },
        tags: [
          { type: 'tags', id: 't1' },
          { type: 'tags', id: 't2', meta: { x: 1 } },
        ],
      },
      meta: { client: 'web' },
    });
  });

  it('runs the create validator over an absent attributes member', async () => {
    const { status, errors } = await errorsOf(
      parseCreateDocument(Articles, { data: { type: 'articles' } }),
    );
    expect(status).toBe(422);
    expect(errors[0]).toMatchObject({
      code: 'VALIDATION_FAILED',
      source: { pointer: '/data/attributes/title' },
    });
  });

  it('reports every structural problem with a pointer in one 400', async () => {
    const { status, errors } = await errorsOf(
      parseCreateDocument(Articles, {
        data: {
          type: 'articles',
          attributes: { title: 'x', nope: 1, 'a/b': 2 },
          relationships: {
            author: { data: [{ type: 'people', id: '1' }] },
            tags: { links: { self: '/x' } },
            editor: { data: null },
          },
          meta: 'no',
          extra: true,
          'atomic:x': 1,
        },
      }),
    );
    expect(status).toBe(400);
    expect(errors.map((error) => error.source?.pointer)).toEqual([
      '/data/extra',
      '/data/atomic:x',
      '/data/meta',
      '/data/attributes/nope',
      '/data/attributes/a~1b',
      '/data/relationships/author/data',
      '/data/relationships/tags',
      '/data/relationships/editor',
    ]);
    expect(new Set(errors.map((error) => error.code))).toEqual(
      new Set(['INVALID_DOCUMENT']),
    );
  });

  it('rejects members named after prototype members instead of resolving them', async () => {
    // JSON.parse creates an own "__proto__" member, which Object.entries lists.
    const body: unknown = JSON.parse(
      '{"data":{"type":"articles","attributes":{"title":"t","constructor":1},' +
        '"relationships":{"constructor":{"data":null},"__proto__":{"data":[]}}}}',
    );
    const { status, errors } = await errorsOf(
      parseCreateDocument(Articles, body),
    );
    expect(status).toBe(400);
    expect(errors.map((error) => error.source?.pointer)).toEqual([
      '/data/attributes/constructor',
      '/data/relationships/constructor',
      '/data/relationships/__proto__',
    ]);
  });

  it('rejects non-object attributes and relationships and skips @-members in them', async () => {
    const { errors } = await errorsOf(
      parseCreateDocument(Articles, {
        data: { type: 'articles', attributes: 'x', relationships: [] },
      }),
    );
    expect(errors.map((error) => error.source?.pointer)).toEqual([
      '/data/attributes',
      '/data/relationships',
    ]);
    const parsed = await parseCreateDocument(Articles, {
      data: {
        type: 'articles',
        attributes: { title: 't' },
        relationships: { '@context': 'ignored' },
      },
    });
    expect(parsed.relationships).toEqual({});
  });

  it('rejects a client-generated id with 403 unless the definition accepts them', async () => {
    const forbidden = await errorsOf(
      parseCreateDocument(Articles, {
        data: { type: 'articles', id: 'x', attributes: { title: 't' } },
      }),
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.errors[0]).toMatchObject({
      code: 'CLIENT_GENERATED_ID_NOT_SUPPORTED',
      source: { pointer: '/data/id' },
    });
    const accepted = await parseCreateDocument(Photos, {
      data: {
        type: 'photos',
        id: '550e8400-e29b-41d4-a716-446655440000',
        attributes: { src: 's' },
      },
    });
    expect(accepted.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(accepted.attributes).toEqual({ src: 's' });
  });

  it('responds 409 to a type that is not the endpoint type', async () => {
    const { status, errors } = await errorsOf(
      parseCreateDocument(Articles, {
        data: { type: 'people', attributes: { title: 't' } },
      }),
    );
    expect(status).toBe(409);
    expect(errors[0]).toMatchObject({
      code: 'CONFLICT',
      source: { pointer: '/data/type' },
    });
  });

  it('responds 409 to related identifiers of the wrong type', async () => {
    const { status, errors } = await errorsOf(
      parseCreateDocument(Articles, {
        data: {
          type: 'articles',
          attributes: { title: 't' },
          relationships: { author: { data: { type: 'robots', id: '1' } } },
        },
      }),
    );
    expect(status).toBe(409);
    expect(errors[0]?.source?.pointer).toBe(
      '/data/relationships/author/data/type',
    );
  });

  it('rejects lid unless allowed, and accepts it when allowed', async () => {
    const rejected = await errorsOf(
      parseCreateDocument(Articles, {
        data: { type: 'articles', lid: 'a', attributes: { title: 't' } },
      }),
    );
    expect(rejected.errors[0]?.source?.pointer).toBe('/data/lid');
    const parsed = await parseCreateDocument(
      Articles,
      {
        data: {
          type: 'articles',
          lid: 'a',
          attributes: { title: 't' },
          relationships: { author: { data: { type: 'people', lid: 'p' } } },
        },
      },
      { lids: true },
    );
    expect(parsed.lid).toBe('a');
    expect(parsed.relationships['author']).toEqual({
      type: 'people',
      lid: 'p',
    });
  });

  it('rejects non-object primary data', async () => {
    const { errors } = await errorsOf(
      parseCreateDocument(Articles, { data: [] }),
    );
    expect(errors[0]).toMatchObject({ source: { pointer: '/data' } });
    const nul = await errorsOf(parseCreateDocument(Articles, { data: null }));
    expect(nul.errors[0]?.detail).toBe(
      'Primary data must be a single resource object',
    );
  });
});

describe('without a validator', () => {
  it('passes declared attributes through as sent', async () => {
    const parsed = await parseCreateDocument(Photos, {
      data: { type: 'photos', attributes: { src: 'a' } },
    });
    expect(parsed.attributes).toEqual({ src: 'a' });
  });
});
