import type { Links } from '@nizam-os/jsonapi-core';

import type { AnyRecord } from '../document/types';
import type { Answer } from '../test-support/fetch-double';
import type { ReadResult } from './types';

import { describe, expect, it } from 'vitest';

import { cursorOf, pageCursors } from '../pagination/cursors';
import { Articles, People, Tags } from '../test-support/blog';
import { fetchDouble, jsonApi } from '../test-support/fetch-double';
import { createTransport } from '../transport/transport';
import { createClients } from './create-clients';

const ORIGIN = 'https://api.example.test';
const SECRET = 'cursor-secret';

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

const article = (id: string, cursor: string) => ({
  type: 'articles',
  id,
  attributes: { title: id },
  relationships: { author: { data: { type: 'people', id: 'p1' } } },
  meta: { page: { cursor } },
});
const ADA = { type: 'people', id: 'p1', attributes: { name: 'Ada' } };

/** A page as a caller may hold it: its links alone matter to `next` and `prev`. */
const page = (links: Links): ReadResult<ReadonlyArray<AnyRecord>> => ({
  status: 200,
  data: [],
  links,
  meta: undefined,
  jsonapi: undefined,
});

describe('next and prev (SPEC 15.8)', () => {
  it('walks the pages a list links, following each link as the server wrote it', async () => {
    const next = `/api/articles?include=author&page%5Bsize%5D=1&page%5Bafter%5D=${SECRET}`;
    const { double, clients } = clientsWith(
      jsonApi({
        data: [article('a1', 'c1')],
        included: [ADA],
        links: { next, prev: null },
      }),
      jsonApi({
        data: [article('a2', 'c2')],
        included: [ADA],
        links: {
          next: null,
          prev: { href: '/api/articles?page[before]=c2&include=author' },
        },
      }),
    );

    const first = await clients.articles.list({
      include: ['author'],
      page: { size: 1 },
    });
    const second = await clients.articles.next(first);

    expect(double.sent[1]?.url).toBe(`${ORIGIN}${next}`);
    expect(second?.data).toMatchObject([
      { id: 'a2', author: { type: 'people', id: 'p1', name: 'Ada' } },
    ]);
    expect(second?.data.map((record) => cursorOf(record))).toStrictEqual([
      'c2',
    ]);
    expect(pageCursors(first)).toStrictEqual({ next: SECRET, prev: undefined });
    await expect(
      clients.articles.next(second ?? first),
    ).resolves.toBeUndefined();
    await expect(clients.articles.prev(first)).resolves.toBeUndefined();
    expect(double.sent).toHaveLength(2);
  });

  it('follows a link object, and resolves records along the include the link carries', async () => {
    const { double, clients } = clientsWith(
      jsonApi({ data: [article('a3', 'c3')], included: [ADA] }),
    );
    const prev = {
      href: `${ORIGIN}/api/articles?include=author&page[before]=c4`,
      meta: { n: 1 },
    };

    const result = await clients.articles.prev(page({ prev }));

    expect(double.last().url).toBe(
      `${ORIGIN}/api/articles?include=author&page[before]=c4`,
    );
    expect(result?.data[0]).toMatchObject({ author: { name: 'Ada' } });
  });

  it('resolves to undefined for a page without links, sending nothing', async () => {
    const { double, clients } = clientsWith();

    await expect(
      clients.articles.next({ ...page({}), links: undefined }),
    ).resolves.toBeUndefined();
    expect(double.sent).toHaveLength(0);
  });

  it('keeps linkage when the link carries no include', async () => {
    const { clients } = clientsWith(
      jsonApi({ data: [article('a3', 'c3')], included: [ADA] }),
    );

    const result = await clients.articles.next(
      page({ next: '/api/articles?page[after]=c2&include=' }),
    );

    expect(result?.data[0]).toMatchObject({
      author: { type: 'people', id: 'p1' },
    });
  });

  it.each([
    ['another origin', 'https://elsewhere.example/api/articles?page[after]=x'],
    ['a network-path reference', '//elsewhere.example/api/articles'],
    ['a relative reference', 'articles?page[after]=x'],
    ['another scheme', 'http://api.example.test/api/articles'],
  ])(
    'throws TypeError for a link to %s, sending nothing and quoting nothing of it',
    async (_, next) => {
      const { double, clients } = clientsWith();

      const error = await clients.articles
        .next(page({ next }))
        .catch((caught: unknown) => caught);

      expect(error).toStrictEqual(
        new TypeError(
          'articles next: links.next must be absolute or start with "/", and be on the transport\'s origin',
        ),
      );
      expect(double.sent).toHaveLength(0);
    },
  );

  it('reads a page that is not a list as a TypeError', async () => {
    const { clients } = clientsWith(jsonApi({ data: article('a1', 'c1') }));

    await expect(
      clients.articles.next(page({ next: '/api/articles?page[after]=c' })),
    ).rejects.toThrow(
      new TypeError(
        'articles next answered 200 with data that is not a list of resource objects',
      ),
    );
  });
});
