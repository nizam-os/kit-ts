import type { Context, Env, ErrorHandler } from 'hono';

import type {
  Ban as CoreBan,
  BanInstance as CoreBanInstance,
  BanOptions,
  Catalog,
  EmptyCatalog,
  ErrorRequest,
  HandlerOptions as CoreHandlerOptions,
  NoReserved as CoreNoReserved,
  ReservedKey as CoreReservedKey,
} from '@nizam-os/ban-core';

import { createBan as createCoreBan } from '@nizam-os/ban-core';

import { fromHttpException, passthroughResponse } from './http-exception';

/** `ban.onError()` options: the core's, with the Hono `Context` as the callback context. */
export type HandlerOptions<
  E extends Env = Env,
  TErrors extends Catalog = Catalog,
> = CoreHandlerOptions<Context<E>, TErrors>;

/** What this package adds to a `@nizam-os/ban-core` instance (SPEC 6.11). */
export interface HonoMembers<TErrors extends Catalog> {
  /**
   * The handler for `app.onError()`: `ban.handler()` fed with the request
   * facts of the Hono context, which the callbacks receive as `c`.
   */
  readonly onError: <E extends Env = Env>(
    options?: HandlerOptions<E, TErrors>,
  ) => ErrorHandler<E>;
}

export type BanInstance<TErrors extends Catalog> = CoreBanInstance<TErrors> &
  HonoMembers<TErrors>;

export type Ban<TErrors extends Catalog> = CoreBan<TErrors> &
  HonoMembers<TErrors>;

export type ReservedKey = CoreReservedKey | 'onError';

/**
 * Rejects custom catalog keys that would shadow an instance member,
 * `onError` included. The core's check handles its own members; the extra
 * conjunct collapses to `never` when the catalog names `onError`, which keeps
 * the options assignable to the core's parameter type.
 */
export type NoReserved<T extends Catalog> = CoreNoReserved<T> &
  ('onError' extends keyof T ? never : unknown);

function requestOf<E extends Env>(c: Context<E>): ErrorRequest {
  return {
    method: c.req.method,
    path: c.req.path,
    header: (name: string): string | undefined => c.req.header(name),
  };
}

/**
 * A `@nizam-os/ban-core` instance for Hono (SPEC 2, 6.11): the core's factories,
 * helpers, and `handler`, plus `onError` for `app.onError()`. Installs
 * `fromHttpException` as the `adopt` hook, ahead of any hook passed in.
 */
export function createBan<const TErrors extends Catalog = EmptyCatalog>(
  options: BanOptions<TErrors> & {
    readonly errors?: NoReserved<TErrors> | undefined;
  } = {},
): Ban<TErrors> {
  if (
    options.errors !== undefined &&
    Object.hasOwn(options.errors, 'onError')
  ) {
    throw new TypeError(
      'Catalog key "onError" collides with a ban instance member',
    );
  }
  const adopt = options.adopt;
  const core = createCoreBan<TErrors>({
    ...options,
    adopt: (value, ban) => fromHttpException(value, ban) ?? adopt?.(value, ban),
  });
  const onError = <E extends Env = Env>(
    handlerOptions: HandlerOptions<E, TErrors> = {},
  ): ErrorHandler<E> => {
    const handle = core.handler<Context<E>>(handlerOptions);
    return async (thrown: unknown, c: Context<E>): Promise<Response> =>
      passthroughResponse(thrown) ?? handle(thrown, requestOf(c), c);
  };
  return Object.assign(core, { onError });
}
