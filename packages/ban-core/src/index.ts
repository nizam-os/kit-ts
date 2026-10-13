/**
 * `@nizam-os/ban-core`: typed HTTP errors with pluggable wire formats, for any runtime
 * and any framework.
 * @packageDocumentation
 */
export type {
  BanErrorInit,
  BanErrorOptions,
  RenderedError,
  Renderer,
} from './core/ban-error';
export type { BuiltinCatalog, BuiltinKey, FactoryName } from './core/catalog';
export type { ErrorDefinition, ResolvedDefinition } from './core/definition';
export type { ErrorItem } from './core/error-item';
export type {
  ClientErrorStatusCode,
  ErrorStatusCode,
  ServerErrorStatusCode,
} from './core/status';
export type {
  Ban,
  BanHandler,
  BanInstance,
  BanOptions,
  BuiltinFactories,
  Catalog,
  CustomErrorInit,
  CustomFactories,
  EmptyCatalog,
  ErrorAdopter,
  ErrorKey,
  ErrorMapper,
  ErrorReport,
  ErrorRequest,
  Factory,
  HandlerOptions,
  NoReserved,
  ReservedKey,
  ValidationOptions,
} from './core/types';
export type {
  JsonSchema,
  RenderContext,
  RenderOptions,
  SchemaContext,
  SchemaDialect,
} from './formats/context';
export type { FormatSpec, StandardFormatSpec } from './formats/define-format';
export type { ErrorEntry } from './formats/error-entries';
export type {
  ProblemDetailsBody,
  ProblemDetailsOptions,
} from './formats/problem-details';
export type { ErrorFormat } from './formats/types';
export type { TraceContext } from './handler/traceparent';
export type { BearerChallengeOptions } from './headers/bearer-challenge';
export type {
  StandardJsonSchema,
  StandardJsonSchemaConverter,
  StandardJsonSchemaOptions,
  StandardJsonSchemaProps,
  StandardJsonSchemaTarget,
  StandardSchemaIssue,
  StandardSchemaPathSegment,
} from './internal/standard-schema-types';
export type {
  HookTarget,
  IssueLocation,
  ValidationIssue,
} from './validation/issue';

export { assert } from './core/assert';
export { BanError, isBanError } from './core/ban-error';
export { BUILTIN_CATALOG, FACTORY_NAMES } from './core/catalog';
export { createBan } from './core/create-ban';
export { reasonPhrase, resolveDefinition } from './core/definition';
export { isErrorStatus } from './core/status';
export { defineFormat } from './formats/define-format';
export { problemDetails } from './formats/problem-details';
export { fromRequest } from './handler/request';
export { parseTraceparent } from './handler/traceparent';
export { bearerChallenge } from './headers/bearer-challenge';
export {
  locationFromTarget,
  nameFromPath,
  pointerFromPath,
} from './validation/issue';
