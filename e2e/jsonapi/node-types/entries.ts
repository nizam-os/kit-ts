/**
 * Every entry point of `@nizam-os/jsonapi-core`, `@nizam-os/hono-jsonapi`, and
 * `@nizam-os/jsonapi-client`, for its declarations only, as `tsconfig.json`
 * beside this file compiles them. `@nizam-os/tanstack-query-jsonapi` is left
 * out: TanStack Query's own declarations name the DOM library's
 * `VoidFunction`, so its consumers compile with the DOM library.
 */
export type * as JsonApiCore from '@nizam-os/jsonapi-core';
export type * as JsonApiCoreAtomic from '@nizam-os/jsonapi-core/atomic';
export type * as HonoJsonApi from '@nizam-os/hono-jsonapi';
export type * as HonoJsonApiAtomic from '@nizam-os/hono-jsonapi/atomic';
export type * as JsonApiClient from '@nizam-os/jsonapi-client';
