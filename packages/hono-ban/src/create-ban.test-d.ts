import type { Context, Env, ErrorHandler } from 'hono';

import type {
  BanError,
  Catalog,
  EmptyCatalog,
  Factory,
} from '@nizam-os/ban-core';

import type { Ban } from './create-ban';

import { Hono } from 'hono';
import { describe, expectTypeOf, it } from 'vitest';

import { createBan } from './create-ban';

type AppEnv = { Bindings: { DB: string }; Variables: { user: string } };
declare const app: Hono<AppEnv>;

describe('createBan (@nizam-os/hono-ban) types', () => {
  it('returns the core instance plus onError', () => {
    const ban = createBan({ errors: { TEAPOT: { status: 418 } } });
    expectTypeOf(ban.TEAPOT).toEqualTypeOf<Factory>();
    expectTypeOf(ban.notFound()).toEqualTypeOf<BanError>();
    expectTypeOf(ban.handler).toBeFunction();
    expectTypeOf(createBan()).toEqualTypeOf<Ban<EmptyCatalog>>();
    expectTypeOf<Ban<Catalog>>().toHaveProperty('onError');
  });

  it('produces an ErrorHandler for typed apps', () => {
    const ban = createBan();
    expectTypeOf(ban.onError()).toEqualTypeOf<ErrorHandler<Env>>();
    app.onError(ban.onError());
    app.onError(
      ban.onError<AppEnv>({
        requestId: (c) => {
          expectTypeOf(c).toEqualTypeOf<Context<AppEnv>>();
          expectTypeOf(c.env.DB).toEqualTypeOf<string>();
          return c.get('user');
        },
        onReport: (_report, c) => {
          expectTypeOf(c.var.user).toEqualTypeOf<string>();
        },
      }),
    );
    new Hono().onError(ban.onError());
  });

  it('rejects catalog keys that collide with instance members', () => {
    // @ts-expect-error onError is an instance member
    createBan({ errors: { onError: { status: 400 } } });
    // @ts-expect-error handler is an instance member
    createBan({ errors: { handler: { status: 400 } } });
  });

  it('types adopt with the Hono-flavoured instance', () => {
    createBan({
      errors: { TEAPOT: { status: 418 } },
      adopt: (value, ban) => (value === 'teapot' ? ban.TEAPOT() : undefined),
    });
  });
});
