/**
 * `@nizam-os/jsonapi-core/atomic`: the Atomic Operations extension, framework-free. An
 * HTTP adapter checks the method and `Content-Type`, reads the body, and
 * hands it to the processor; `@nizam-os/hono-jsonapi/atomic` does that for Hono.
 * @ref https://jsonapi.org/ext/atomic/
 * @packageDocumentation
 */
export type { OperationResult } from './execute';
export type { RawOperation } from './parse-document';
export type {
  OperationsOutcome,
  OperationsProcessor,
  OperationsResultDocument,
} from './process';
export type {
  AnyResourceHandlers,
  AtomicOptions,
  MaybePromise,
  OperationCode,
  OperationContext,
  OperationTarget,
  RelationshipHandlers,
  ResolvedResourceObject,
  ResourceHandlers,
} from './types';

export { DEFAULT_MAX_OPERATIONS } from '../internal/constants';
export { assertOperationsContentType } from './content-type';
export { errorAtOperation } from './operation-error';
export { parseOperationsDocument } from './parse-document';
export { operationsProcessor } from './process';
