/**
 * Reads through the built client over HTTP (SPEC 15.4, 15.6, 15.8): pages
 * of records and the walk along the links the server wrote, cursors read
 * and sent back, compound documents resolved along the include paths sent,
 * and sparse fieldsets, each record typed as `tsc` reads the built
 * declarations.
 */
import type { AnyRecord, Identifier } from '@nizam-os/jsonapi-client';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { cursorOf, pageCursors, serializeQuery } from '@nizam-os/jsonapi-client';
import { CURSOR_PAGINATION_PROFILE } from '@nizam-os/jsonapi-core';

import { useClientBlog } from './support/clients.ts';

function ids(records: ReadonlyArray<AnyRecord> | undefined): Array<string> {
  return (records ?? []).map((record) => record.id);
}

/** `value`, failing the test when it is `undefined`. */
function present<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new TypeError(`${what} is missing`);
  }
  return value;
}

describe('client reads', () => {
  const blog = useClientBlog();

  it("lists the default page as records, with the profile's links and meta", async () => {
    const page = await blog.clients().articles.list();

    expect(page.status).toBe(200);
    expect(ids(page.data)).toEqual(['1', '2']);
    expect(page.data[0]).toEqual({
      type: 'articles',
      id: '1',
      title: 'JSON:API paints my bikeshed!',
      body: 'A',
      createdAt: '2026-01-01T00:00:00Z',
      author: { type: 'people', id: '1' },
      tags: [
        { type: 'tags', id: 't1' },
        { type: 'tags', id: 't2' },
      ],
      $links: { self: 'https://blog.example/articles/1' },
      $meta: { page: { cursor: btoa('1') } },
      $relationships: expect.objectContaining({
        author: expect.objectContaining({
          data: { type: 'people', id: '1' },
        }),
      }),
    });
    expect(page.meta).toEqual({ page: { total: 5 } });
    expect(page.jsonapi).toEqual({
      version: '1.1',
      profile: [CURSOR_PAGINATION_PROFILE],
    });
    expect(page.links?.['prev']).toBeNull();
    expect(blog.arrivals().at(-1)?.target).toBe('/articles');

    type Article = (typeof page.data)[number];
    expectTypeOf<Article['title']>().toEqualTypeOf<string>();
    expectTypeOf<Article['author']>().toEqualTypeOf<
      Identifier<'people'> | null | undefined
    >();
  });

  it('sorts, filters, and searches as the definition declares', async () => {
    const { articles } = blog.clients();
    const page = async (
      query: Parameters<typeof articles.list>[0],
    ): Promise<Array<string>> => ids((await articles.list(query)).data);

    expect(await page({ sort: ['-title'], page: { size: 4 } })).toEqual([
      '2',
      '5',
      '1',
      '4',
    ]);
    expect(await page({ filter: { title: { like: 'engines' } } })).toEqual([
      '3',
    ]);
    expect(await page({ filter: { author: '3' } })).toEqual(['4', '5']);
    expect(
      await page({
        filter: { or: [{ title: { like: 'rails' }, author: '3' }] },
        page: { size: 4 },
      }),
    ).toEqual(['2', '4', '5']);
    expect(await page({ search: 'engine' })).toEqual(['3']);
  });

  it('walks every page forward with next and back with prev, along the include the links carry', async () => {
    const { articles } = blog.clients();
    const first = await articles.list({ sort: ['title'], include: ['author'] });
    const following = await articles.next(first);
    const second = present(following, 'the second page');
    const third = present(await articles.next(second), 'the third page');

    expect([
      ...ids(first.data),
      ...ids(second.data),
      ...ids(third.data),
    ]).toEqual(['3', '4', '1', '5', '2']);
    expect(second.data[0]?.author?.name).toBe('Dan Gebhardt');
    expect(await articles.next(third)).toBeUndefined();
    const back = present(await articles.prev(third), 'the page before');
    expect(ids(back.data)).toEqual(['1', '5']);
    expect(await articles.prev(first)).toBeUndefined();
    // The link as the server wrote it: the query the list sent, then the cursor.
    expect(blog.arrivals().at(-1)?.target).toBe(
      `/articles?include=author&sort=title&page%5Bbefore%5D=${encodeURIComponent(btoa('2'))}`,
    );

    expectTypeOf(following).toEqualTypeOf<typeof first | undefined>();
  });

  it('reads the cursors of a page and of a record, and lists after each', async () => {
    const { articles } = blog.clients();
    const first = await articles.list({ sort: ['title'] });
    const { next, prev } = pageCursors(first);
    const last = first.data.at(-1);

    expect(prev).toBeUndefined();
    expect(next).toBe(btoa('4'));
    expect(last === undefined ? undefined : cursorOf(last)).toBe(next);
    const after = await articles.list({
      sort: ['title'],
      page: { after: next ?? '' },
    });
    expect(ids(after.data)).toEqual(['1', '5']);
  });

  it('resolves a compound document along the include paths sent, and nothing else', async () => {
    const { data } = await blog
      .clients()
      .articles.get('1', { include: ['author.articles', 'tags'] });

    expect(data.author).toMatchObject({
      type: 'people',
      id: '1',
      name: 'Dan Gebhardt',
      twitter: 'dgeb',
    });
    expect(ids(data.author?.articles)).toEqual(['1', '2']);
    // Off the include paths, a relationship is its linkage.
    expect(data.author?.articles?.[1]?.author).toEqual({
      type: 'people',
      id: '1',
    });
    expect(data.tags?.map((tag) => tag.name)).toEqual(['json', 'api']);

    expectTypeOf(data.tags?.[0]?.name).toEqualTypeOf<string | undefined>();
    expectTypeOf(data.author?.articles?.[0]?.title).toEqualTypeOf<
      string | undefined
    >();
  });

  it('applies sparse fieldsets to the records and their types', async () => {
    const { data } = await blog.clients().articles.get('1', {
      include: ['author'],
      fields: { articles: ['title', 'author'], people: ['name'] },
    });

    expect(data).toMatchObject({
      type: 'articles',
      id: '1',
      title: 'JSON:API paints my bikeshed!',
      author: { type: 'people', id: '1', name: 'Dan Gebhardt' },
    });
    expect(data).not.toHaveProperty('body');
    expect(data.author).not.toHaveProperty('twitter');
    expect(blog.arrivals().at(-1)?.target).toBe(
      '/articles/1?include=author&fields%5Barticles%5D=title%2Cauthor&fields%5Bpeople%5D=name',
    );

    expectTypeOf(data).toHaveProperty('title');
    expectTypeOf(data).not.toHaveProperty('body');
  });

  it('holds the definition it was made from, whose serialization of a query is what the server receives', async () => {
    const { articles } = blog.clients();
    const query = {
      include: ['author'],
      sort: ['-title'],
      filter: { title: 'Rails is Omakase' },
      page: { size: 1 },
    } as const;

    await articles.list(query);

    expect(blog.arrivals().at(-1)?.target).toBe(
      `/articles?${serializeQuery(articles.definition, query).toString()}`,
    );
    expectTypeOf(articles.definition.type).toEqualTypeOf<'articles'>();
  });

  it('reads a person with the linkage of their articles', async () => {
    const { data } = await blog.clients().people.get('2');

    expect(data).toMatchObject({
      type: 'people',
      id: '2',
      name: 'Ada Lovelace',
      twitter: null,
      articles: [{ type: 'articles', id: '3' }],
    });
    expectTypeOf(data.articles).toEqualTypeOf<
      ReadonlyArray<Identifier<'articles'>> | undefined
    >();
  });
});
