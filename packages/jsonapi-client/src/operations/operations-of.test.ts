/**
 * `operationsOf` (SPEC 17.1): each builder's operation, as the extension's
 * operation object a request sends, read back by jsonapi-core's own
 * parsers, a create's `lid` and a local identifier among them, and the
 * `TypeError` for a relationship the definition does not declare.
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 */
import { describe, expect, it } from 'vitest';

import {
  parseCreateDocument,
  parseToManyRelationshipDocument,
  parseUpdateDocument,
} from '@nizam-os/jsonapi-core';
import { parseOperationsDocument } from '@nizam-os/jsonapi-core/atomic';

import { Articles } from '../test-support/blog';
import { operationsOf } from './operations-of';

const articles = operationsOf(Articles);

/** The operation object a request sends: `op`, `ref`, and `data`, the absent ones left out. */
function wire(operation: {
  readonly op: string;
  readonly ref: unknown;
  readonly data: unknown;
}): unknown {
  return JSON.parse(
    JSON.stringify({
      op: operation.op,
      ref: operation.ref,
      data: operation.data,
    }),
  );
}

/** The operations as jsonapi-core's parser reads them. */
function parsed(...operations: ReadonlyArray<Parameters<typeof wire>[0]>) {
  return parseOperationsDocument(
    { 'atomic:operations': operations.map((operation) => wire(operation)) },
    { maxOperations: operations.length },
  );
}

describe('operationsOf (SPEC 17.1)', () => {
  it('builds a create as an add of the resource object, its lid kept and its relationships linkable by lid', async () => {
    const operation = articles.create({
      lid: 'draft',
      attributes: { title: 'T', body: 'B' },
      relationships: {
        author: 'p1',
        tags: ['t1', { type: 'tags', lid: 'fresh' }],
      },
    });

    expect(Object.isFrozen(operation)).toBe(true);
    expect([operation.definition, operation.op, operation.ref]).toStrictEqual([
      Articles,
      'add',
      undefined,
    ]);
    const [read] = parsed(operation);
    expect([read?.op, read?.target, read?.hasData]).toStrictEqual([
      'add',
      undefined,
      true,
    ]);
    await expect(
      parseCreateDocument(Articles, { data: read?.data }, { lids: true }),
    ).resolves.toMatchObject({
      lid: 'draft',
      attributes: { title: 'T', body: 'B' },
      relationships: {
        author: { type: 'people', id: 'p1' },
        tags: [
          { type: 'tags', id: 't1' },
          { type: 'tags', lid: 'fresh' },
        ],
      },
    });
  });

  it("builds an update that names its target by the resource object, as the extension's example does", async () => {
    const operation = articles.update('a1', {
      attributes: { title: 'New' },
      relationships: { author: { type: 'people', lid: 'ada' } },
    });

    expect(wire(operation)).toStrictEqual({
      op: 'update',
      data: {
        type: 'articles',
        id: 'a1',
        attributes: { title: 'New' },
        relationships: {
          author: { data: { type: 'people', lid: 'ada' } },
        },
      },
    });
    const [read] = parsed(operation);
    await expect(
      parseUpdateDocument(Articles, { data: read?.data }, 'a1', {
        lids: true,
      }),
    ).resolves.toMatchObject({
      id: 'a1',
      relationships: { author: { type: 'people', lid: 'ada' } },
    });
  });

  it('builds a removal as a remove by ref, without data', () => {
    const operation = articles.remove('a2');

    expect(wire(operation)).toStrictEqual({
      op: 'remove',
      ref: { type: 'articles', id: 'a2' },
    });
    expect(Object.isFrozen(operation.ref)).toBe(true);
    expect(parsed(operation)[0]).toMatchObject({
      op: 'remove',
      target: { type: 'articles', id: 'a2' },
      hasData: false,
    });
  });

  it('builds the relationship writes as update, add, and remove by a ref that names the relationship', () => {
    const set = articles.setRelationship('a1', 'author', null);
    const add = articles.addToRelationship('a1', 'tags', ['t2']);
    const remove = articles.removeFromRelationship('a1', 'tags', [
      { type: 'tags', id: 't3' },
    ]);
    const ref = { type: 'articles', id: 'a1', relationship: 'tags' };

    expect([wire(set), wire(add), wire(remove)]).toStrictEqual([
      {
        op: 'update',
        ref: { type: 'articles', id: 'a1', relationship: 'author' },
        data: null,
      },
      { op: 'add', ref, data: [{ type: 'tags', id: 't2' }] },
      { op: 'remove', ref, data: [{ type: 'tags', id: 't3' }] },
    ]);
    const read = parsed(set, add, remove);
    // The parser's target has every member, `lid` undefined.
    expect(read.map(({ op, target }) => [op, target])).toEqual([
      ['update', { type: 'articles', id: 'a1', relationship: 'author' }],
      ['add', ref],
      ['remove', ref],
    ]);
    expect(
      parseToManyRelationshipDocument(
        { data: read[1]?.data },
        { type: 'tags' },
      ),
    ).toStrictEqual([{ type: 'tags', id: 't2' }]);
  });

  it('sends the id of a record passed as an identifier, even one with a field named lid', () => {
    const record = { type: 'people', id: 'p1', lid: 'not-a-lid', name: 'Ada' };

    expect(
      wire(articles.setRelationship('a1', 'author', record)),
    ).toStrictEqual({
      op: 'update',
      ref: { type: 'articles', id: 'a1', relationship: 'author' },
      data: { type: 'people', id: 'p1' },
    });
  });

  it('refuses a relationship the definition does not declare, naming it, as the call does', () => {
    const wide = articles as unknown as {
      setRelationship: (id: string, name: string, linkage: unknown) => unknown;
      create: (input: unknown) => unknown;
    };

    expect(() => wide.setRelationship('a1', 'editor', null)).toThrow(
      new TypeError(
        'articles setRelationship: articles has no relationship "editor"',
      ),
    );
    expect(() => wide.create({ relationships: { editor: 'e1' } })).toThrow(
      new TypeError('articles create: articles has no relationship "editor"'),
    );
  });
});
