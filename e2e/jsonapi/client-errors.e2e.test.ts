/**
 * Refusals through the built client over HTTP (SPEC 15.3, 15.4, 15.7):
 * each error status the blog answers becomes a `ResponseError` holding the
 * error objects as the server wrote them, its message naming only the
 * type, the call, and the status; an id no path can carry is refused
 * before anything is sent; and an aborted request reaches the caller as
 * fetch rejected it.
 */
import { describe, expect, it } from 'vitest';

import { isResponseError } from '@nizam-os/jsonapi-client';

import { refusal, rejection, useClientBlog } from './support/clients.ts';

describe('client errors', () => {
  const blog = useClientBlog();

  it('reads a 400 that names the parameter: a page over the maximum, a cursor the server cannot read', async () => {
    const { articles } = blog.clients();
    const tooBig = await refusal(articles.list({ page: { size: 5 } }));
    const unreadable = await refusal(articles.list({ page: { after: '%%%' } }));

    expect(tooBig.status).toBe(400);
    expect(tooBig.errors[0]).toMatchObject({
      code: 'MAX_PAGE_SIZE_EXCEEDED',
      source: { parameter: 'page[size]' },
      meta: { page: { maxSize: 4 } },
    });
    expect(isResponseError(unreadable, 'INVALID_QUERY_PARAMETER')).toBe(true);
    expect(unreadable.errors[0]?.source).toEqual({ parameter: 'page[after]' });
  });

  it('reads a 404 for a missing resource and for a route the server does not have', async () => {
    const { articles, tags } = blog.clients();
    const missing = await refusal(articles.get('999'));
    const unrouted = await refusal(tags.get('t1'));

    expect(missing.status).toBe(404);
    expect(missing.errors[0]).toMatchObject({
      status: '404',
      code: 'NOT_FOUND',
      detail: 'Article 999 does not exist',
    });
    expect(unrouted.status).toBe(404);
    expect(unrouted.errors[0]?.detail).toBe(
      'No resource exists at the requested URL',
    );
  });

  it("reads a 422 with the pointer and the validator's own code", async () => {
    const invalid = await refusal(
      blog.clients().articles.create({ attributes: { title: '' } }),
    );

    expect(invalid.status).toBe(422);
    expect(isResponseError(invalid, 'VALIDATION_FAILED')).toBe(true);
    expect(invalid.errors[0]?.source).toEqual({
      pointer: '/data/attributes/title',
    });
    expect(invalid.errors[0]?.meta).toMatchObject({ code: 'too_small' });
  });

  it('names the type, the call, and the status, never the URL or the document', async () => {
    const missing = await refusal(blog.clients().articles.get('999'));

    expect(missing.message).toBe('articles get answered 404');
    const logged = JSON.stringify([missing.message, missing.stack]);
    expect(logged).not.toContain('999');
    expect(logged).not.toContain(blog.origin());
  });

  it('refuses an id no path can carry before sending anything', async () => {
    const { articles } = blog.clients();
    const before = blog.arrivals().length;

    for (const id of ['', '.', '..']) {
      await expect(articles.get(id)).rejects.toThrow(
        new TypeError('articles get: an id must not be empty, "." or ".."'),
      );
    }
    expect(blog.arrivals()).toHaveLength(before);
  });

  it('passes an aborted request to the caller as fetch rejected it', async () => {
    const before = blog.arrivals().length;
    const reason = new DOMException('the user left', 'AbortError');
    const aborted = await rejection(
      blog
        .clients()
        .articles.list(undefined, { signal: AbortSignal.abort(reason) }),
    );

    expect(aborted).toBe(reason);
    expect(blog.arrivals()).toHaveLength(before);
  });
});
