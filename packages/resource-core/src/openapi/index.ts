/**
 * `@nizam-os/resource-core/openapi` (SPEC 13): the OpenAPI document of a
 * registry of declared resources, and the surface clients depend on with
 * the diff that tells a breaking change from a safe one and the parse
 * that reads a committed surface back. The paths come from
 * `@nizam-os/jsonapi-core`'s `resourcePaths`, the function a host mounts
 * its routes by and a client calls through.
 * @packageDocumentation
 */
export type { SurfaceChange } from './diff';
export type { InfoObject, OpenApiDocument, OpenApiOptions } from './document';
export type {
  ExampleObject,
  ResourceExample,
  ResourceExamples,
} from './examples';
export type { OperationCodes } from './operation-codes';
export type {
  FieldSurface,
  PageSurface,
  RelationshipSurface,
  ResourceSurface,
  Surface,
  ValueSurface,
} from './surface';

export { diffSurfaces } from './diff';
export { openapi } from './document';
export { parseSurface } from './parse-surface';
export { SURFACE_FORMAT, surfaceOf } from './surface';
