import { describe, expect, it } from 'vitest';

import { packumentUrl, registryReader, versionsOf } from './registry.ts';

function respond(status: number, body: unknown = {}): typeof fetch {
  return async (input, init) => {
    await Promise.resolve();
    expect(input).toBe(
      'https://registry.npmjs.org/@nizam-os%2Fkeyset-core?write=true',
    );
    expect(init?.cache).toBe('no-store');
    return Response.json(body, { status });
  };
}

describe('packumentUrl', () => {
  it('keeps the scope sign and escapes the slash, past the CDN cache', () => {
    expect(packumentUrl('@nizam-os/keyset-core')).toBe(
      'https://registry.npmjs.org/@nizam-os%2Fkeyset-core?write=true',
    );
    expect(packumentUrl('hono-ban', 'http://localhost:4873')).toBe(
      'http://localhost:4873/hono-ban?write=true',
    );
  });
});

describe('versionsOf', () => {
  it('maps each version to its integrity, when it has one', () => {
    expect(
      versionsOf(
        {
          versions: {
            '0.1.0': { dist: { integrity: 'sha512-a' } },
            '0.0.1': { dist: {} },
            '0.0.0': null,
          },
        },
        'a',
      ),
    ).toEqual(
      new Map([
        ['0.1.0', 'sha512-a'],
        ['0.0.1', undefined],
        ['0.0.0', undefined],
      ]),
    );
  });

  it('refuses a document without versions', () => {
    for (const document of [{}, { versions: [] }, null, 'a document']) {
      expect(() => versionsOf(document, '@nizam-os/a')).toThrow(
        "the registry's document of @nizam-os/a has no versions",
      );
    }
  });
});

describe('registryReader', () => {
  it('reads a package npm does not have as absent', async () => {
    expect(await registryReader(respond(404))('@nizam-os/keyset-core')).toEqual(
      { exists: false },
    );
  });

  it('reads the versions of a package npm has', async () => {
    const state = await registryReader(
      respond(200, {
        versions: { '0.1.0': { dist: { integrity: 'sha512-a' } } },
      }),
    )('@nizam-os/keyset-core');
    expect(state).toEqual({
      exists: true,
      versions: new Map([['0.1.0', 'sha512-a']]),
    });
  });

  it('fails on any other answer, naming the status', async () => {
    await expect(
      registryReader(respond(503))('@nizam-os/keyset-core'),
    ).rejects.toThrow('the registry answered 503 for @nizam-os/keyset-core');
  });
});
