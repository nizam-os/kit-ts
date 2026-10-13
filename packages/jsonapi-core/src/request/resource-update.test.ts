import type { ErrorObject } from '../document/types';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isBanError } from '@nizam-os/ban-core';

import { errorObjects } from '../errors/json-api-error';
import { defineResource } from '../resource/define-resource';
import { parseResourceObject, parseUpdateDocument } from './resource-document';

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ID = '0b7c1a9e-4f6d-4d8e-9a3b-2c1d0e9f8a7b';
const OTHER = '1b7c1a9e-4f6d-4d8e-9a3b-2c1d0e9f8a7b';

/** A UUID in either case, lower-cased, like a server that stores it so. */
const uuid = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) =>
      typeof value === 'string' && UUID.test(value)
        ? { value: value.toLowerCase() }
        : { issues: [{ message: 'Must be a UUID.' }] },
  },
};

/** Server-keyed: the id validator serves updates alone. */
const Notes = defineResource({
  type: 'notes',
  attributes: ['title'],
  serialize: (row: Row) => ({ id: row.id }),
  validate: { id: uuid },
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

describe('parseUpdateDocument', () => {
  it('requires type and id and matches the id to the request', async () => {
    const parsed = await parseUpdateDocument(
      Articles,
      { data: { type: 'articles', id: '1' } },
      '1',
    );
    expect(parsed).toMatchObject({
      id: '1',
      attributes: {},
      relationships: {},
    });
    const missing = await errorsOf(
      parseUpdateDocument(Articles, { data: { type: 'articles' } }, '1'),
    );
    expect(missing.status).toBe(400);
    expect(missing.errors[0]?.source?.pointer).toBe('/data/id');
    const mismatch = await errorsOf(
      parseUpdateDocument(
        Articles,
        { data: { type: 'articles', id: '2' } },
        '1',
      ),
    );
    expect(mismatch.status).toBe(409);
    expect(mismatch.errors[0]?.detail).toContain('"2"');
  });

  it("matches an update's id to the request's by the id validator's output", async () => {
    const lower = await parseUpdateDocument(
      Notes,
      { data: { type: 'notes', id: ID } },
      ID.toUpperCase(),
    );
    const upper = await parseUpdateDocument(
      Notes,
      { data: { type: 'notes', id: ID.toUpperCase() } },
      ID,
    );
    // The document's id stays as sent; the host resolves the request's.
    expect([lower.id, upper.id]).toEqual([ID, ID.toUpperCase()]);
    const pairs = [
      [OTHER, ID],
      [ID, 'not-a-uuid'],
      ['not-a-uuid', ID],
    ] as const;
    const refusals = await Promise.all(
      pairs.map(async ([id, requested]) =>
        errorsOf(
          parseUpdateDocument(
            Notes,
            { data: { type: 'notes', id } },
            requested,
          ),
        ),
      ),
    );
    expect(
      refusals.map(({ status, errors }) => [status, errors[0]?.source]),
    ).toEqual(Array.from({ length: 3 }, () => [409, { pointer: '/data/id' }]));
  });

  it('validates with the update validator and leaves missing attributes alone', async () => {
    const parsed = await parseUpdateDocument(
      Articles,
      { data: { type: 'articles', id: '1', attributes: { rating: '5' } } },
      '1',
    );
    expect(parsed.attributes).toEqual({ rating: 5 });
    const invalid = await errorsOf(
      parseUpdateDocument(
        Articles,
        { data: { type: 'articles', id: '1', attributes: { rating: 9 } } },
        '1',
      ),
    );
    expect(invalid.status).toBe(422);
    expect(invalid.errors[0]?.source?.pointer).toBe('/data/attributes/rating');
  });

  it('accepts a lid in place of id when allowed (atomic update)', async () => {
    const parsed = await parseResourceObject(
      Articles,
      { type: 'articles', lid: 'new', attributes: { title: 'x' } },
      { operation: 'update', lids: true, pointer: '/atomic:operations/0/data' },
    );
    expect(parsed.lid).toBe('new');
    const bad = await errorsOf(
      parseResourceObject(
        Articles,
        { type: 'articles', id: 5 },
        { operation: 'update', pointer: '/op' },
      ),
    );
    expect(bad.errors.map((error) => error.source?.pointer)).toEqual([
      '/op/id',
      '/op/id',
    ]);
  });
});
