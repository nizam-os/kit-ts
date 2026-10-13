import { describe, expect, it } from 'vitest';

import { BanError, createBan } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';

import { Contacts, Organizations } from '../test-support/domain-resources';
import { definePolicyIn, denyAll } from './policy';

const CONTEXT = { actor: { id: 'u1', can: () => true }, services: {} };
const INPUT = { attributes: {}, relationships: {} };
const ROW_CONTEXT = { ...CONTEXT, row: { id: 'c1' }, input: INPUT };

/** The error `run` rejects with. */
async function denialOf(run: () => Promise<void>): Promise<BanError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof BanError) {
      return error;
    }
    throw error;
  }
  throw new Error('the policy allowed it');
}

const render = (error: BanError) =>
  createBan({ format: jsonApi({ includeId: false }) }).render(error);

describe('definePolicy (SPEC 12.2)', () => {
  const policy = definePolicyIn(Contacts, {
    list: () => true,
    get: async ({ row }: { readonly row: { readonly id: string } }) => {
      await Promise.resolve();
      return row.id === 'c1';
    },
    create: () => false,
    update: () => 'yes',
    include: { organization: () => true },
  });

  it('allows what a predicate answers true to, synchronously or not', async () => {
    await expect(policy.authorize('list', CONTEXT)).resolves.toBeUndefined();
    await expect(policy.authorize('get', ROW_CONTEXT)).resolves.toBeUndefined();
    await expect(
      policy.authorizeInclude('organization', CONTEXT),
    ).resolves.toBeUndefined();
  });

  it('denies an operation without a row as FORBIDDEN', async () => {
    const error = await denialOf(async () =>
      policy.authorize('create', { ...CONTEXT, input: INPUT }),
    );
    expect([error.status, error.code, error.detail, error.errors]).toEqual([
      403,
      'FORBIDDEN',
      undefined,
      undefined,
    ]);
  });

  it('denies an operation with a row as NOT_FOUND, rendered as a missing row is', async () => {
    const denied = await denialOf(async () =>
      policy.authorize('get', { ...CONTEXT, row: { id: 'c2' } }),
    );
    expect(denied.status).toBe(404);
    const missing = createBan().error('NOT_FOUND');
    expect(render(denied)).toEqual(render(missing));
  });

  it('denies a predicate answering anything but true, and an operation without one', async () => {
    expect(
      (await denialOf(async () => policy.authorize('update', ROW_CONTEXT)))
        .code,
    ).toBe('NOT_FOUND');
    expect(
      (await denialOf(async () => policy.authorize('remove', ROW_CONTEXT)))
        .code,
    ).toBe('NOT_FOUND');
  });

  it('lets a throwing predicate fail the operation with its own error', async () => {
    const boom = new Error('service down');
    const failing = definePolicyIn(Contacts, {
      list: () => {
        throw boom;
      },
    });
    await expect(failing.authorize('list', CONTEXT)).rejects.toBe(boom);
  });

  it('denies an include as FORBIDDEN at the include parameter', async () => {
    const error = await denialOf(async () =>
      definePolicyIn(Contacts, {}).authorizeInclude('organization', CONTEXT),
    );
    expect(render(error).body).toEqual({
      errors: [
        {
          status: '403',
          code: 'FORBIDDEN',
          title: 'Forbidden',
          detail: 'The relationship may not be included.',
          source: { parameter: 'include' },
          meta: { location: 'query' },
        },
      ],
    });
  });

  it('denies an include the resource does not offer', async () => {
    const error = await denialOf(async () =>
      policy.authorizeInclude('owner', CONTEXT),
    );
    expect(error.code).toBe('FORBIDDEN');
  });
});

describe('denyAll (SPEC 12.2)', () => {
  it.each([
    ['list', 'FORBIDDEN'],
    ['create', 'FORBIDDEN'],
    ['get', 'NOT_FOUND'],
    ['update', 'NOT_FOUND'],
    ['remove', 'NOT_FOUND'],
  ] as const)('denies %s as %s', async (operation, code) => {
    const error = await denialOf(async () =>
      denyAll.authorize(operation, ROW_CONTEXT),
    );
    expect(error.code).toBe(code);
  });

  it('denies every include', async () => {
    const error = await denialOf(async () =>
      denyAll.authorizeInclude('organization', CONTEXT),
    );
    expect(error.code).toBe('FORBIDDEN');
  });
});

describe('definePolicy: what JavaScript passes', () => {
  it.each([
    [
      {},
      {},
      'definePolicy: the resource must be a resource declareResource returned',
    ],
    [Contacts, null, 'definePolicy: contacts: the policy must be an object'],
    [
      Organizations,
      { remove: () => true },
      'definePolicy: organizations: "remove" is not a declared operation',
    ],
    [
      Contacts,
      { list: true },
      'definePolicy: contacts: the predicate of list must be a function',
    ],
    [
      Contacts,
      { include: [] },
      'definePolicy: contacts: include must be an object',
    ],
    [
      Contacts,
      { include: { owner: () => true } },
      'definePolicy: contacts: "owner" is not an includable relationship',
    ],
    [
      Contacts,
      { include: { organization: 'yes' } },
      'definePolicy: contacts: the predicate of organization must be a function',
    ],
  ])('refuses %#', (resource, init, message) => {
    expect(() => definePolicyIn(resource, init)).toThrow(
      new TypeError(message),
    );
  });

  it('freezes the policy', () => {
    expect(Object.isFrozen(definePolicyIn(Contacts, {}))).toBe(true);
    expect(Object.isFrozen(denyAll)).toBe(true);
  });
});
