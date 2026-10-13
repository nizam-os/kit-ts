import type { Quota, QuotaContext } from './quota';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { createBan } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';

import { errorCatalog } from '../errors/error-catalog';
import { Contacts, Organizations } from '../test-support/domain-resources';
import { defineQuota, quotaExceeded } from './quota';

interface Services {
  readonly billing: { readonly contactLimit: () => Promise<number> };
}
type Context = QuotaContext<{ readonly id: string }, Services>;

describe('defineQuota (SPEC 12.6)', () => {
  it('keeps the limit, typed by the registry it satisfies, frozen', async () => {
    const QUOTAS = {
      contacts: defineQuota({
        limit: async ({ services }) => services.billing.contactLimit(),
      }),
    } satisfies Readonly<Record<'contacts', Quota<Context>>>;
    expectTypeOf(QUOTAS.contacts).toEqualTypeOf<Quota<Context>>();
    const services = {
      billing: {
        contactLimit: async () => {
          await Promise.resolve();
          return 3;
        },
      },
    };
    await expect(
      QUOTAS.contacts.limit({ actor: { id: 'u1' }, services }),
    ).resolves.toBe(3);
    expect(Object.isFrozen(QUOTAS.contacts)).toBe(true);
  });

  it.each([null, {}, { limit: 3 }])(
    'refuses the JavaScript quota %j',
    (quota) => {
      expect(() => Reflect.apply(defineQuota, undefined, [quota])).toThrow(
        new TypeError('defineQuota: limit must be a function'),
      );
    },
  );
});

describe('quotaExceeded (SPEC 12.6)', () => {
  it.each([
    [0, 1, false],
    [2, 3, false],
    [3, 3, true],
    [4, 3, true],
    [0, 0, true],
  ])(
    'with %i rows and a limit of %i refuses one more: %s',
    (count, limit, refused) => {
      expect(quotaExceeded(count, limit) !== undefined).toBe(refused);
    },
  );

  it.each([Number.NaN, -1, 2.5, Number.POSITIVE_INFINITY])(
    'fails closed on the limit %s',
    (limit) => {
      expect(quotaExceeded(0, limit)?.code).toBe('QUOTA_EXCEEDED');
    },
  );

  it("is resource-core's own 403, rendered from errorCatalog", () => {
    const error = quotaExceeded(3, 3);
    const ban = createBan({
      format: jsonApi({ includeId: false }),
      errors: errorCatalog([Organizations, Contacts]),
    });
    expect(
      ban.render(error ?? ban.error('INTERNAL_SERVER_ERROR')).body,
    ).toEqual({
      errors: [
        {
          status: '403',
          code: 'QUOTA_EXCEEDED',
          title: 'Quota Exceeded',
          detail: 'The quota for this resource is used up.',
        },
      ],
    });
  });
});
