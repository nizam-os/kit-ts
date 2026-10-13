/**
 * A `BanError` built by another copy of the package (ADR 0019). Modules
 * imported again after `vi.resetModules()` are a second instance with
 * classes of their own, as a second installed copy is.
 */
import type * as BanCore from '../index';

import { describe, expect, it, vi } from 'vitest';

import { fakeRequest } from '../test-support/handler-dispatch';
import { BanError, isBanError } from './ban-error';
import { createBan } from './create-ban';

async function secondCopy(): Promise<typeof BanCore> {
  vi.resetModules();
  return import('../index');
}

const BRAND = Symbol.for('@nizam-os/ban-core/BanError');
const init = { status: 404, code: 'NOT_FOUND', title: 'Not Found' } as const;

describe('a BanError from another copy of the package', () => {
  it('comes from a class of its own', async () => {
    const copy = await secondCopy();
    expect(copy.BanError).not.toBe(BanError);
    expect(Object.getPrototypeOf(new copy.BanError(init))).not.toBe(
      BanError.prototype,
    );
  });

  it('is a BanError to isBanError and to instanceof, both ways', async () => {
    const copy = await secondCopy();
    const foreign = copy.createBan().notFound('The order does not exist');
    expect(isBanError(foreign)).toBe(true);
    expect(foreign instanceof BanError).toBe(true);
    expect(copy.isBanError(new BanError(init))).toBe(true);
  });

  it('keeps its status, code, detail, and items through the handler', async () => {
    const copy = await secondCopy();
    const foreign = copy.createBan().unprocessableEntity({
      detail: 'The order cannot be placed',
      errors: [{ detail: 'Must be positive', path: ['quantity'] }],
    });
    const handler = createBan().handler();
    const response = await handler(foreign, fakeRequest({}, 'POST', '/orders'));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      status: 422,
      detail: 'The order cannot be placed',
      errors: [{ detail: 'Must be positive', pointer: '/quantity' }],
    });
  });

  it('is capped by its own fields when its body is too large', async () => {
    const copy = await secondCopy();
    const foreign = copy
      .createBan()
      .badRequest({ meta: { blob: 'x'.repeat(100_000) } });
    const response = await createBan().handler()(foreign, fakeRequest());
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).not.toContain('xxxx');
  });
});

describe('the brand', () => {
  it('is on the prototype and not enumerable, so an error has no own symbol', () => {
    const error = new BanError(init);
    expect(Object.getOwnPropertySymbols(error)).toEqual([]);
    expect(Reflect.get(error, BRAND)).toBe(1);
    expect(
      Object.getOwnPropertyDescriptor(BanError.prototype, BRAND),
    ).toMatchObject({ enumerable: false, writable: false });
  });

  it('is recognized only at the version this copy reads', () => {
    expect(isBanError({ [BRAND]: 1 })).toBe(true);
    expect(isBanError({ [BRAND]: 2 })).toBe(false);
    expect(isBanError({ [BRAND]: '1' })).toBe(false);
    expect(isBanError({ status: 404, code: 'NOT_FOUND' })).toBe(false);
    expect(isBanError(Object.create(null))).toBe(false);
  });

  it('never makes instanceof a subclass accept another class', async () => {
    class OrderError extends BanError {}
    const copy = await secondCopy();
    expect(new OrderError(init) instanceof OrderError).toBe(true);
    expect(new OrderError(init) instanceof BanError).toBe(true);
    expect(new BanError(init) instanceof OrderError).toBe(false);
    expect(new copy.BanError(init) instanceof OrderError).toBe(false);
  });
});
