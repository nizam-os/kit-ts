/**
 * The documents a write sends (SPEC 15.4), sent as JSON and read back by
 * `@nizam-os/jsonapi-core`'s own request parsers, are the writes meant.
 */
import { describe, expect, it } from 'vitest';

import {
  createDefineResource,
  parseCreateDocument,
  parseToManyRelationshipDocument,
  parseToOneRelationshipDocument,
  parseUpdateDocument,
} from '@nizam-os/jsonapi-core';

import { Articles } from '../test-support/blog';
import {
  linkageOf,
  relationshipOf,
  resourceDocument,
} from './request-documents';

/** The document as the server receives it: written as JSON and parsed. */
const sent = (document: unknown): unknown =>
  JSON.parse(JSON.stringify(document));

const author = relationshipOf(Articles, 'setRelationship', 'author');
const tags = relationshipOf(Articles, 'setRelationship', 'tags');

describe('resourceDocument (SPEC 15.4)', () => {
  it('writes a create the server parses as meant: ids become identifiers of the declared type', async () => {
    const document = resourceDocument(Articles, 'create', {
      attributes: { title: 'T', body: 'B' },
      relationships: { author: 'p1', tags: ['t1', { type: 'tags', id: 't2' }] },
    });

    await expect(
      parseCreateDocument(Articles, sent(document)),
    ).resolves.toStrictEqual({
      type: 'articles',
      id: undefined,
      lid: undefined,
      attributes: { title: 'T', body: 'B' },
      relationships: {
        author: { type: 'people', id: 'p1' },
        tags: [
          { type: 'tags', id: 't1' },
          { type: 'tags', id: 't2' },
        ],
      },
      meta: undefined,
    });
  });

  it('sends a client id, which a definition with clientIds accepts', async () => {
    const Notes = createDefineResource({ links: { base: '' } })({
      type: 'notes',
      attributes: ['text'],
      serialize: (row: { readonly id: string; readonly text: string }) => ({
        id: row.id,
        attributes: { text: row.text },
      }),
      clientIds: true,
    });
    const document = resourceDocument(
      Notes,
      'create',
      { id: 'n-1', attributes: { text: 'x' } },
      { id: 'n-1' },
    );

    await expect(
      parseCreateDocument(Notes, sent(document)),
    ).resolves.toMatchObject({ id: 'n-1' });
  });

  it('writes an update with the path id, leaving out what is undefined and emptying a to-one with null', async () => {
    const document = resourceDocument(
      Articles,
      'update',
      {
        attributes: { title: 'New', body: undefined },
        relationships: { author: null, tags: undefined },
      },
      { id: 'a1' },
    );

    expect(sent(document)).toStrictEqual({
      data: {
        type: 'articles',
        id: 'a1',
        attributes: { title: 'New' },
        relationships: { author: { data: null } },
      },
    });
    await expect(
      parseUpdateDocument(Articles, sent(document), 'a1'),
    ).resolves.toMatchObject({
      id: 'a1',
      attributes: { title: 'New' },
      relationships: { author: null },
    });
  });

  it('leaves out attributes and relationships a write does not give', () => {
    expect(
      resourceDocument(Articles, 'update', {}, { id: 'a1' }),
    ).toStrictEqual({
      data: { type: 'articles', id: 'a1' },
    });
  });

  it('sends only the type and id of a record passed as an identifier', () => {
    const record = {
      type: 'people',
      id: 'p1',
      name: 'Ada',
      $meta: { cursor: 'c' },
    };
    const document = resourceDocument(
      Articles,
      'update',
      { relationships: { author: record } },
      { id: 'a1' },
    );

    expect(sent(document)).toStrictEqual({
      data: {
        type: 'articles',
        id: 'a1',
        relationships: { author: { data: { type: 'people', id: 'p1' } } },
      },
    });
  });

  it('keeps the type of an identifier object, for a polymorphic relationship', () => {
    expect(linkageOf(author, { type: 'guests', id: 'g1' })).toStrictEqual({
      type: 'guests',
      id: 'g1',
    });
  });

  it('throws TypeError naming a relationship the definition does not declare', () => {
    expect(() =>
      resourceDocument(Articles, 'create', { relationships: { editor: 'p1' } }),
    ).toThrow(
      new TypeError('articles create: articles has no relationship "editor"'),
    );
    expect(() => relationshipOf(Articles, 'related', '__proto__')).toThrow(
      new TypeError(
        'articles related: articles has no relationship "__proto__"',
      ),
    );
  });
});

describe('linkageOf (SPEC 15.4)', () => {
  it('writes to-one linkage the server parses as meant', () => {
    expect(
      parseToOneRelationshipDocument(sent({ data: linkageOf(author, 'p1') }), {
        type: 'people',
      }),
    ).toStrictEqual({
      type: 'people',
      id: 'p1',
    });
    expect(
      parseToOneRelationshipDocument(sent({ data: linkageOf(author, null) }), {
        type: 'people',
      }),
    ).toBeNull();
  });

  it('writes to-many linkage the server parses as meant, in the order given', () => {
    const data = linkageOf(tags, ['t2', { type: 'tags', id: 't1' }]);

    expect(
      parseToManyRelationshipDocument(sent({ data }), { type: 'tags' }),
    ).toStrictEqual([
      { type: 'tags', id: 't2' },
      { type: 'tags', id: 't1' },
    ]);
    expect(linkageOf(tags, [])).toStrictEqual([]);
  });
});
