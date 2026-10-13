/**
 * Relationship calls through the built client over HTTP (SPEC 15.4):
 * linkage read by cardinality, related records read with the target's
 * fieldset and paged like a list, linkage replaced, added to, and removed
 * from, and a write to a read-only relationship, which the types refuse
 * and the server answers with 403.
 * @ref https://jsonapi.org/format/1.1/#crud-updating-relationships
 */
import type { IdentifierObject } from '@nizam-os/jsonapi-client';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { isResponseError } from '@nizam-os/jsonapi-client';

import { refusal, useClientBlog } from './support/clients.ts';

const NO_CONTENT = {
  status: 204,
  data: undefined,
  links: undefined,
  meta: undefined,
  jsonapi: undefined,
};

describe('client relationship calls', () => {
  const blog = useClientBlog();

  it('reads linkage by cardinality, with the links the server wrote', async () => {
    const { articles } = blog.clients();
    const author = await articles.relationship('1', 'author');
    const tags = await articles.relationship('1', 'tags');

    expect(author.data).toEqual({ type: 'people', id: '1' });
    expect(author.links).toEqual({
      self: 'https://blog.example/articles/1/relationships/author',
      related: 'https://blog.example/articles/1/author',
    });
    expect(tags.data).toEqual([
      { type: 'tags', id: 't1' },
      { type: 'tags', id: 't2' },
    ]);
    expectTypeOf(tags.data).toEqualTypeOf<
      ReadonlyArray<IdentifierObject<'tags'>>
    >();
  });

  it("reads related records by cardinality, with the target's fieldset", async () => {
    const { articles } = blog.clients();
    const author = await articles.related('1', 'author', {
      fields: { people: ['name'] },
    });
    const tags = await articles.related('1', 'tags');

    expect(author.data).toEqual({
      type: 'people',
      id: '1',
      name: 'Dan Gebhardt',
      $links: { self: 'https://blog.example/people/1' },
    });
    expect(tags.data.map((tag) => tag.name)).toEqual(['json', 'api']);
    expect(blog.arrivals().at(-2)?.target).toBe(
      '/articles/1/author?fields%5Bpeople%5D=name',
    );

    expectTypeOf(author.data?.name).toEqualTypeOf<string | undefined>();
    expectTypeOf(author.data).not.toHaveProperty('twitter');
  });

  it('replaces a to-one, then empties it', async () => {
    const { articles } = blog.clients();

    expect(await articles.setRelationship('3', 'author', '3')).toEqual(
      NO_CONTENT,
    );
    expect((await articles.relationship('3', 'author')).data).toEqual({
      type: 'people',
      id: '3',
    });
    expect((await articles.related('3', 'author')).data?.name).toBe(
      'Grace Hopper',
    );
    expect(await articles.setRelationship('3', 'author', null)).toEqual(
      NO_CONTENT,
    );
    expect((await articles.relationship('3', 'author')).data).toBeNull();
    expect((await articles.related('3', 'author')).data).toBeNull();
  });

  it('replaces, adds to, and removes from a to-many', async () => {
    const { articles } = blog.clients();
    const linkage = async (): Promise<Array<string>> =>
      (await articles.relationship('2', 'tags')).data.map((tag) => tag.id);

    await articles.setRelationship('2', 'tags', [
      't3',
      { type: 'tags', id: 't1' },
    ]);
    expect(await linkage()).toEqual(['t3', 't1']);
    expect(await articles.addToRelationship('2', 'tags', ['t2', 't3'])).toEqual(
      NO_CONTENT,
    );
    expect(await linkage()).toEqual(['t3', 't1', 't2']);
    await articles.removeFromRelationship('2', 'tags', ['t3']);
    expect(await linkage()).toEqual(['t1', 't2']);

    const writes = blog
      .arrivals()
      .filter((arrival) => arrival.method !== 'GET')
      .slice(-3);
    expect(writes.map(({ method, target }) => `${method} ${target}`)).toEqual([
      'PATCH /articles/2/relationships/tags',
      'POST /articles/2/relationships/tags',
      'DELETE /articles/2/relationships/tags',
    ]);
    expect(JSON.parse(writes[2]?.body ?? '')).toEqual({
      data: [{ type: 'tags', id: 't3' }],
    });
  });

  it('pages related records like a list, along the include sent', async () => {
    const { articles, people } = blog.clients();
    await articles.setRelationship('4', 'author', '1');

    const first = await people.related('1', 'articles', {
      include: ['author'],
    });
    const second = await people.next(first);

    expect(first.data.map((article) => article.id)).toEqual(['1', '2']);
    expect(first.meta).toEqual({ page: { total: 3 } });
    expect(second?.data.map((article) => article.id)).toEqual(['4']);
    expect(second?.data[0]?.author?.name).toBe('Dan Gebhardt');
    expect(
      second === undefined ? 'none' : await people.next(second),
    ).toBeUndefined();

    expectTypeOf(first.data[0]?.author?.name).toEqualTypeOf<
      string | undefined
    >();
  });

  it('refuses a write to a read-only relationship in the types and with 403 on the server', async () => {
    const { people } = blog.clients();
    const refused = await refusal(
      // @ts-expect-error -- a person's articles are not writable
      people.setRelationship('1', 'articles', ['3']),
    );

    expect(refused.status).toBe(403);
    expect(isResponseError(refused, 'FORBIDDEN')).toBe(true);
    expect(refused.message).toBe('people setRelationship answered 403');
  });
});
