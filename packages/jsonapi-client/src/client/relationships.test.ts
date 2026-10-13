import type { AnyResource } from '@nizam-os/jsonapi-core';

import type { Answer } from '../test-support/fetch-double';

import { describe, expect, it } from 'vitest';

import { defineResource } from '@nizam-os/jsonapi-core';

import { Articles, People, Tags } from '../test-support/blog';
import { empty, fetchDouble, jsonApi } from '../test-support/fetch-double';
import { createTransport } from '../transport/transport';
import { createClients } from './create-clients';

const ORIGIN = 'https://api.example.test';
const AUTHOR = `${ORIGIN}/api/articles/a1/relationships/author`;
const TAGS = `${ORIGIN}/api/articles/a1/relationships/tags`;

function clientsWith(...responses: ReadonlyArray<Answer>) {
  const double = fetchDouble(...responses);
  const transport = createTransport({ origin: ORIGIN, fetch: double.fetch });
  return {
    double,
    clients: createClients(
      { articles: Articles, people: People, tags: Tags },
      transport,
    ),
  };
}

describe('relationship (SPEC 15.4)', () => {
  it('GETs the relationship link and reads its linkage, each identifier with its meta', async () => {
    const links = {
      self: '/api/articles/a1/relationships/author',
      related: '/api/articles/a1/author',
    };
    const { double, clients } = clientsWith(
      jsonApi({
        data: { type: 'people', id: 'p1', meta: { role: 'lead' } },
        links,
      }),
    );

    const result = await clients.articles.relationship('a1', 'author');

    expect([double.last().method, double.last().url]).toStrictEqual([
      'GET',
      AUTHOR,
    ]);
    expect(result).toStrictEqual({
      status: 200,
      data: { type: 'people', id: 'p1', meta: { role: 'lead' } },
      links,
      meta: undefined,
      jsonapi: undefined,
    });
  });

  it('reads empty to-one linkage as null and to-many linkage as a list in order', async () => {
    const { clients } = clientsWith(
      jsonApi({ data: null }),
      jsonApi({
        data: [
          { type: 'tags', id: 't2' },
          { type: 'tags', id: 't1' },
        ],
      }),
    );

    expect(
      (await clients.articles.relationship('a1', 'author')).data,
    ).toBeNull();
    expect(
      (await clients.articles.relationship('a1', 'tags')).data,
    ).toStrictEqual([
      { type: 'tags', id: 't2' },
      { type: 'tags', id: 't1' },
    ]);
  });

  it.each([
    ['author', { data: [] }, 'to-one linkage'],
    ['author', { meta: {} }, 'to-one linkage'],
    ['author', { data: { type: 'people' } }, 'to-one linkage'],
    ['tags', { data: { type: 'tags', id: 't1' } }, 'to-many linkage'],
    ['tags', { data: [{ type: 'tags', id: 1 }] }, 'to-many linkage'],
  ] as const)(
    'throws TypeError when %s answers %j',
    async (name, document, shape) => {
      const { clients } = clientsWith(jsonApi(document));

      await expect(clients.articles.relationship('a1', name)).rejects.toThrow(
        new TypeError(
          `articles relationship answered 200 with data that is not ${shape}`,
        ),
      );
    },
  );
});

describe('the relationship writes (SPEC 15.4)', () => {
  it('setRelationship PATCHes the linkage and reads the linkage back', async () => {
    const { double, clients } = clientsWith(
      jsonApi({ data: { type: 'people', id: 'p2' } }),
      empty(204),
    );

    const replaced = await clients.articles.setRelationship(
      'a1',
      'author',
      'p2',
    );
    const emptied = await clients.articles.setRelationship(
      'a1',
      'author',
      null,
    );

    expect(
      double.sent.map((sent) => [sent.method, sent.url, JSON.parse(sent.body)]),
    ).toStrictEqual([
      ['PATCH', AUTHOR, { data: { type: 'people', id: 'p2' } }],
      ['PATCH', AUTHOR, { data: null }],
    ]);
    expect(replaced.data).toStrictEqual({ type: 'people', id: 'p2' });
    expect(emptied).toMatchObject({ status: 204, data: undefined });
  });

  it('addToRelationship POSTs and removeFromRelationship DELETEs to-many linkage, both with a document', async () => {
    const { double, clients } = clientsWith(
      jsonApi({
        data: [
          { type: 'tags', id: 't1' },
          { type: 'tags', id: 't3' },
        ],
      }),
      empty(204),
    );

    const added = await clients.articles.addToRelationship('a1', 'tags', [
      't3',
    ]);
    await clients.articles.removeFromRelationship('a1', 'tags', [
      { type: 'tags', id: 't1' },
    ]);

    expect(
      double.sent.map((sent) => [sent.method, sent.url, JSON.parse(sent.body)]),
    ).toStrictEqual([
      ['POST', TAGS, { data: [{ type: 'tags', id: 't3' }] }],
      ['DELETE', TAGS, { data: [{ type: 'tags', id: 't1' }] }],
    ]);
    expect(double.last().headers.get('content-type')).toBe(
      'application/vnd.api+json',
    );
    expect(added.data).toHaveLength(2);
  });

  it('reads a 202 and a 200 with meta alone as no data', async () => {
    const { clients } = clientsWith(
      jsonApi({ data: [] }, 202),
      jsonApi({ meta: { changed: 0 } }),
    );

    expect(
      await clients.articles.addToRelationship('a1', 'tags', []),
    ).toMatchObject({ status: 202, data: undefined });
    expect(
      await clients.articles.addToRelationship('a1', 'tags', []),
    ).toMatchObject({
      status: 200,
      data: undefined,
      meta: { changed: 0 },
    });
  });
});

describe('a relationship the client cannot call (SPEC 15.4)', () => {
  const Notes: AnyResource = defineResource({
    type: 'notes',
    attributes: ['text'],
    relationships: { owner: { type: 'people', cardinality: 'one' } },
    serialize: (row: { readonly id: string }) => ({ id: row.id }),
    links: { self: (id) => `/notes/${encodeURIComponent(id)}` },
  });

  it('throws TypeError naming a relationship the definition does not declare, before sending', async () => {
    const { double, clients } = clientsWith();

    await expect(clients.articles.relationship('a1', 'editor')).rejects.toThrow(
      new TypeError(
        'articles relationship: articles has no relationship "editor"',
      ),
    );
    await expect(
      clients.articles.setRelationship('a1', 'editor', null),
    ).rejects.toThrow(
      new TypeError(
        'articles setRelationship: articles has no relationship "editor"',
      ),
    );
    expect(double.sent).toHaveLength(0);
  });

  it('throws TypeError naming a relationship whose links give no path', async () => {
    const transport = createTransport({
      origin: ORIGIN,
      fetch: fetchDouble().fetch,
    });
    const { notes } = createClients({ notes: Notes }, transport);

    await expect(notes.relationship('n1', 'owner')).rejects.toThrow(
      new TypeError(
        'notes relationship: notes has no relationship link for "owner"',
      ),
    );
    await expect(notes.related('n1', 'owner')).rejects.toThrow(
      new TypeError('notes related: notes has no related link for "owner"'),
    );
  });
});
