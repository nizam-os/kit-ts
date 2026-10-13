/**
 * `@nizam-os/hono-jsonapi/atomic`: the Atomic Operations endpoint for Hono. The
 * processor and every type come from `@nizam-os/jsonapi-core/atomic`, re-exported
 * here; `atomicOperations()` wraps the processor as a Hono handler.
 * @ref https://jsonapi.org/ext/atomic/
 * @packageDocumentation
 */
export * from '@nizam-os/jsonapi-core/atomic';

export { atomicOperations } from './handler';
