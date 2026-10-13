/**
 * `@nizam-os/hono-resource`: Hono routes for a runtime of
 * `@nizam-os/resource-core` declarations (resource SPEC 19, ADR 0013).
 * `jsonApiRoutes` serves every declared operation at the path its JSON:API
 * links name, with no handler written per resource: `@nizam-os/hono-jsonapi`
 * negotiates, validates, and builds documents, the runtime authorizes and
 * runs, and the host's ban renders every error.
 * @ref https://jsonapi.org/format/1.1/
 * @ref https://hono.dev/
 * @packageDocumentation
 */
export type { JsonApiRoutesOptions } from './routes';

export { resourceTypeOf } from './resource-type';
export { jsonApiRoutes } from './routes';
