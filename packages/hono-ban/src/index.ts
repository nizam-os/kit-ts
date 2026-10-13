/**
 * `@nizam-os/hono-ban`: @nizam-os/ban-core for Hono. Everything `@nizam-os/ban-core` exports, plus a
 * `createBan` whose instances carry `onError` for `app.onError()` and adopt
 * Hono's `HTTPException`.
 * @packageDocumentation
 */
export * from '@nizam-os/ban-core';

export type {
  Ban,
  BanInstance,
  HandlerOptions,
  HonoMembers,
  NoReserved,
  ReservedKey,
} from './create-ban';

export { createBan } from './create-ban';
export { fromHttpException } from './http-exception';
