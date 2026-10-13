import type { AnyResource } from '@nizam-os/jsonapi-core';

import { describe, expect, it } from 'vitest';

import { defineResource } from '@nizam-os/jsonapi-core';

import { Articles, People, Tags } from '../test-support/blog';
import { fetchDouble, jsonApi } from '../test-support/fetch-double';
import { createTransport } from '../transport/transport';
import { createClients } from './create-clients';

const transport = createTransport({
  origin: 'https://api.example.test',
  fetch: fetchDouble().fetch,
});

const noLinks: AnyResource = defineResource({
  type: 'drafts',
  attributes: ['text'],
  serialize: (row: { readonly id: string }) => ({ id: row.id }),
});

describe('createClients (SPEC 15.4)', () => {
  it('gives a client per definition, by the name it was passed under', () => {
    const clients = createClients(
      { posts: Articles, authors: People, labels: Tags },
      transport,
    );

    expect(Object.keys(clients)).toStrictEqual(['posts', 'authors', 'labels']);
    expect(typeof clients.posts.list).toBe('function');
  });

  it('gives each client the definition it was made from, as passed', () => {
    const clients = createClients({ posts: Articles, labels: Tags }, transport);

    expect(clients.posts.definition).toBe(Articles);
    expect(clients.labels.definition).toBe(Tags);
  });

  it('keeps a name such as __proto__ a plain key', async () => {
    const double = fetchDouble(jsonApi({ data: [] }));
    const definitions: Record<string, AnyResource> = {};
    Object.defineProperty(definitions, '__proto__', {
      value: Tags,
      enumerable: true,
    });

    const clients = createClients(
      definitions,
      createTransport({
        origin: 'https://api.example.test',
        fetch: double.fetch,
      }),
    );

    const client: unknown = Object.getOwnPropertyDescriptor(
      clients,
      '__proto__',
    )?.value;
    expect(Object.getPrototypeOf(clients)).toBe(Object.prototype);
    await (client as { list: () => Promise<unknown> }).list();
    expect(double.last().url).toBe('https://api.example.test/api/tags');
  });

  it('throws TypeError for two definitions with one type, since records find their definition by type', () => {
    expect(() =>
      createClients({ articles: Articles, posts: Articles }, transport),
    ).toThrow(
      new TypeError(
        'createClients: articles and posts have one type, articles; records find their definition by type',
      ),
    );
  });

  it("throws resourcePaths' TypeError for a definition whose links give no paths", () => {
    expect(() => createClients({ drafts: noLinks }, transport)).toThrow(
      new TypeError(
        'createClients: drafts has no links.self, so its paths are unknown; give the definer links.base',
      ),
    );
  });

  it('throws TypeError for a transport createTransport did not make', () => {
    const message = 'createClients: transport must be made by createTransport';

    expect(() => createClients({ tags: Tags }, {} as never)).toThrow(
      new TypeError(message),
    );
    expect(() => createClients({ tags: Tags }, null as never)).toThrow(
      new TypeError(message),
    );
  });
});
