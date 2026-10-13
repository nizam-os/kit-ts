/**
 * What the built client sends over HTTP (SPEC 15.2, 15.3, 15.8): the
 * transport's headers and language, read on every request, then a call's
 * own headers, then the client's `Accept` and `Content-Type`, as the
 * server receives them; and a page link to another origin than the
 * transport's, which the client refuses to follow.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#field.accept-language
 * @ref https://fetch.spec.whatwg.org/#fetching (a request without
 * `Accept-Language` gets the user agent's own; Node's fetch sends `*`)
 */
import { describe, expect, it } from 'vitest';

import { JSON_API_MEDIA_TYPE } from '@nizam-os/jsonapi-core';

import { useClientBlog } from './support/clients.ts';

describe('client transport', () => {
  const blog = useClientBlog();

  function lastHeaders(): Headers {
    const arrival = blog.arrivals().at(-1);
    if (arrival === undefined) {
      throw new TypeError('no request arrived');
    }
    return arrival.headers;
  }

  it("sends the transport's headers, read on every request, before a call's own and the client's", async () => {
    let token = 'first';
    const { articles } = blog.clients({
      headers: () => ({
        authorization: `Bearer ${token}`,
        'x-trace': 'transport',
      }),
    });

    await articles.get('1');
    expect(lastHeaders().get('authorization')).toBe('Bearer first');
    expect(lastHeaders().get('x-trace')).toBe('transport');

    token = 'rotated';
    await articles.get(
      '1',
      {},
      {
        headers: { 'x-trace': 'call', accept: 'text/html' },
      },
    );
    expect(lastHeaders().get('authorization')).toBe('Bearer rotated');
    expect(lastHeaders().get('x-trace')).toBe('call');
    expect(lastHeaders().get('accept')).toBe(JSON_API_MEDIA_TYPE);
  });

  it('sends Accept-Language from language on every request, and none for an empty one', async () => {
    let locale: string | undefined;
    const handed: Array<string | null> = [];
    const { articles } = blog.clients({
      language: () => locale,
      fetch: async (request) => {
        handed.push(request.headers.get('accept-language'));
        return fetch(request);
      },
    });
    const arrived: Array<string | null> = [];
    for (const next of ['de', 'en-GB', '', undefined]) {
      locale = next;
      await articles.get('1');
      arrived.push(lastHeaders().get('accept-language'));
    }

    expect(handed).toEqual(['de', 'en-GB', null, null]);
    // A request without one gets the runtime's own: Node's fetch sends `*`.
    expect(arrived).toEqual(['de', 'en-GB', '*', '*']);
  });

  it('sends a document with the JSON:API media type, and a read without a Content-Type', async () => {
    const { articles } = blog.clients();

    await articles.get('1');
    expect(lastHeaders().get('content-type')).toBeNull();
    await articles.update('1', { attributes: { body: 'Revised' } });
    expect(lastHeaders().get('content-type')).toBe(JSON_API_MEDIA_TYPE);
    expect(lastHeaders().get('accept')).toBe(JSON_API_MEDIA_TYPE);
  });

  it("refuses to follow a page link to another origin than the transport's", async () => {
    // A proxy that forwards to the server under another host, so the
    // server's links name the host it was reached at.
    const proxied = new URL(blog.origin());
    proxied.hostname = 'localhost';
    const { articles } = blog.clients({
      origin: proxied.origin,
      fetch: async (request) =>
        fetch(
          new Request(
            request.url.replace(proxied.origin, blog.origin()),
            request,
          ),
        ),
    });
    const before = blog.arrivals().length;
    const first = await articles.list();

    expect(first.links?.['next']).toMatch(/^http:\/\/127\.0\.0\.1:/u);
    await expect(articles.next(first)).rejects.toThrow(
      new TypeError(
        'articles next: links.next must be absolute or start with "/", and be on the transport\'s origin',
      ),
    );
    expect(blog.arrivals()).toHaveLength(before + 1);
  });
});
