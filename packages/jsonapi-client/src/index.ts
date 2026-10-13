/**
 * `@nizam-os/jsonapi-client`: a typed fetch client for JSON:API 1.1 servers,
 * typed by the `@nizam-os/jsonapi-core` definitions the server is built
 * from (SPEC 15).
 * @packageDocumentation
 */
export type { RecordOf } from './client/record-types';
export type {
  Clients,
  IdentifierObject,
  ReadResult,
  ResourceClient,
  WriteResult,
} from './client/types';
export type {
  CreateInput,
  LinkageInput,
  LocalIdentifier,
  UpdateInput,
} from './client/write-types';
export type {
  AnyRecord,
  Deserialized,
  DeserializeOptions,
  Identifier,
  RecordMembers,
} from './document/types';
export type {
  ResponseErrorHeaders,
  ResponseErrorInit,
} from './errors/response-error';
export type {
  CreateOperationInput,
  Operation,
  OperationBuilders,
  OperationPointer,
  OperationResult,
  OperationsResult,
  UpdateOperationInput,
} from './operations/types';
export type { PageCursors } from './pagination/cursors';
export type {
  Condition,
  Conditions,
  CustomValues,
  FieldsInput,
  FilterInput,
  FilterValue,
  FilterValues,
  GetQuery,
  ListQuery,
  PageInput,
  Query,
  TypedFilterInput,
  WideFilterInput,
} from './query/types';
export type { CallOptions } from './transport/send';
export type { Transport, TransportOptions } from './transport/transport';

export { createClients } from './client/create-clients';
export { deserialize } from './document/deserialize';
export { isResponseError, ResponseError } from './errors/response-error';
export { operationOf } from './operations/operation-of';
export { operationsOf } from './operations/operations-of';
export { sendOperations } from './operations/send-operations';
export { cursorOf, pageCursors } from './pagination/cursors';
export { serializeQuery } from './query/serialize-query';
export { createTransport } from './transport/transport';
