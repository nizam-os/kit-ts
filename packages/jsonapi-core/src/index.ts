/**
 * `@nizam-os/jsonapi-core`: JSON:API 1.1 for any JavaScript runtime. Resource
 * definitions, document building, query parsing, request document parsing,
 * content negotiation, and the Cursor Pagination profile, all as functions
 * over plain values; nothing here knows about a web framework. The Atomic
 * Operations extension lives in `@nizam-os/jsonapi-core/atomic`; the Hono integration
 * is the `@nizam-os/hono-jsonapi` package.
 * @ref https://jsonapi.org/format/1.1/
 * @packageDocumentation
 */
export type { Ban, ErrorItem, ErrorStatusCode } from '@nizam-os/ban-core';

export type { DocumentOptions, Included } from './document/build';
export type {
  AnyResourceIdentifier,
  Attributes,
  CollectionDocument,
  DataDocument,
  Document,
  DocumentBase,
  ErrorDocument,
  ErrorLinks,
  ErrorObject,
  ErrorSource,
  ExtensionDocument,
  JsonApiObject,
  Link,
  LinkObject,
  Links,
  LocalResourceIdentifier,
  Meta,
  MetaDocument,
  PrimaryData,
  Relationship,
  Relationships,
  ResourceDocument,
  ResourceIdentifier,
  ResourceLinkage,
  ResourceObject,
  ToManyLinkage,
  ToManyRelationshipDocument,
  ToOneLinkage,
  ToOneRelationshipDocument,
} from './document/types';
export type {
  ErrorCode,
  JsonApiCatalog,
  JsonApiCatalogKey,
} from './errors/catalog';
export type {
  ErrorItemInit,
  ErrorObjectInit,
  JsonApiErrorCode,
  JsonApiErrorOptions,
} from './errors/json-api-error';
export type {
  InferStandardInput,
  InferStandardOutput,
  StandardSchema,
  StandardSchemaFailure,
  StandardSchemaIssue,
  StandardSchemaOptions,
  StandardSchemaPathSegment,
  StandardSchemaProps,
  StandardSchemaResult,
  StandardSchemaSuccess,
} from './internal/standard-schema-types';
export type {
  JsonApiMediaTypeInit,
  JsonApiParameters,
} from './media-type/json-api';
export type {
  MediaRange,
  MediaType,
  MediaTypeParameter,
} from './media-type/parse';
export type {
  NegotiatedRequest,
  Negotiation,
  NegotiationFailure,
  NegotiationHeaders,
  NegotiationOptions,
  NegotiationSuccess,
} from './negotiate/negotiate';
export type {
  PageCursors,
  PageLinksOptions,
  PageMetaInit,
} from './pagination/links';
export type { Page, PaginatedOptions } from './pagination/paginated';
export type {
  FilterCondition,
  PageRequest,
  ParameterValue,
  ParsedFilter,
  ParsedQuery,
  QueryInput,
  SortField,
} from './query/types';
export type { IdentifierOptions, RequestLinkage } from './request/identifiers';
export type { RelationshipDocumentOptions } from './request/relationship-document';
export type {
  LidOptions,
  ParsedResourceObject,
  WithLids,
  WithoutLids,
} from './request/resource-document';
export type {
  Operation,
  ParseResourceOptions,
  RequestDocument,
  RequestResourceObject,
} from './request/types';
export type {
  ClientRelationship,
  InferredTypes,
  JsonOf,
  ResourceTypes,
  TypesOf,
} from './resource/client-types';
export type {
  AtomicCapabilities,
  AtomicCapabilitiesInit,
} from './resource/atomic-capabilities';
export type {
  DefineResource,
  ResourceDefaults,
} from './resource/create-define-resource';
export type {
  DefinitionOf,
  ResourceDefinitionInit,
} from './resource/init-types';
export type {
  RelationshipLinks,
  ResourceLinks,
  ResourceLinksInit,
} from './resource/links';
export type { ResourcePaths, ResourcePathsOptions } from './resource/paths';
export type {
  AnyResource,
  Cardinality,
  CreateAttributesOf,
  LinkageInit,
  PageCapabilities,
  PageCapabilitiesInit,
  QueryCapabilities,
  QueryCapabilitiesInit,
  RelationshipDefinition,
  RelationshipInit,
  RelationshipNameOf,
  ResourceDefinition,
  RowOf,
  SearchParameter,
  SerializedAttributes,
  SerializedRelationship,
  SerializedRelationships,
  SerializedResource,
  UpdateAttributesOf,
} from './resource/types';
export type {
  ResourceValidators,
  WritableFields,
  WritableFieldsInit,
} from './resource/write-types';

export { BanError, isBanError } from '@nizam-os/ban-core';

export {
  collectionDocument,
  include,
  jsonApiObject,
  resourceDocument,
  toManyRelationshipDocument,
  toOneRelationshipDocument,
} from './document/build';
export { assertFullLinkage } from './document/linkage';
export {
  assertMemberName,
  isAtMember,
  isExtensionMemberName,
  isMemberName,
  isMemberPath,
} from './document/member-name';
export { applyFields, identify, serializeResource } from './document/serialize';
export { ERROR_CATALOG, ERROR_CODES } from './errors/catalog';
export {
  errorDocument,
  errorItem,
  errorObjects,
  jsonApiBan,
  jsonApiError,
} from './errors/json-api-error';
export {
  ATOMIC_OPERATIONS_EXTENSION,
  CURSOR_PAGINATION_PROFILE,
  JSON_API_MEDIA_TYPE,
  JSON_API_VERSION,
} from './internal/constants';
export {
  formatJsonApiMediaType,
  isJsonApiMediaType,
  jsonApiParameters,
} from './media-type/json-api';
export { parseAccept, parseMediaType } from './media-type/parse';
export { negotiate } from './negotiate/negotiate';
export {
  MAX_SIZE_EXCEEDED_TYPE,
  RANGE_PAGINATION_NOT_SUPPORTED_TYPE,
  UNSUPPORTED_SORT_TYPE,
  invalidCursor,
  invalidCursorError,
  maxPageSizeExceededError,
  rangePaginationNotSupportedError,
  unsupportedSort,
  unsupportedSortError,
} from './pagination/errors';
export { itemCursorMeta, pageMeta, paginationLinks } from './pagination/links';
export { paginatedDocument } from './pagination/paginated';
export { parseQuery } from './query/parse-query';
export { toManyLinkage, toOneLinkage } from './request/cardinality';
export { parseIdentifier, parseLinkage } from './request/identifiers';
export {
  parseToManyRelationshipDocument,
  parseToOneRelationshipDocument,
} from './request/relationship-document';
export {
  parseCreateDocument,
  parseResourceObject,
  parseUpdateDocument,
  primaryData,
} from './request/resource-document';
export { createDefineResource } from './resource/create-define-resource';
export { defineResource, relatedResource } from './resource/define-resource';
export { resourcePaths } from './resource/paths';
