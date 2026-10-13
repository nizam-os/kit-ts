/**
 * The error catalog (SPEC 4.1). Every error this package emits carries one
 * of `ERROR_CODES`. `ERROR_CATALOG` holds the entries @nizam-os/ban-core does not ship,
 * in @nizam-os/ban-core's definition shape, so an application spreads them into its
 * own `createBan({ errors })` next to its own entries; the remaining codes
 * are @nizam-os/ban-core built-ins (same `status`, same `title`).
 * @ref https://jsonapi.org/format/1.1/#error-objects
 * @ref https://github.com/nizam-os/kit-ts/blob/main/docs/jsonapi/SPEC.md (section 3: the built-in catalog, the definition shape)
 * @packageDocumentation
 */
import type { ErrorDefinition } from '@nizam-os/ban-core';

import {
  HTTP_BAD_REQUEST,
  HTTP_FORBIDDEN,
  MAX_SIZE_EXCEEDED_TYPE,
  RANGE_PAGINATION_NOT_SUPPORTED_TYPE,
  UNSUPPORTED_SORT_TYPE,
} from '../internal/constants';

/** The codes this package defines beyond @nizam-os/ban-core's built-in catalog. */
export type JsonApiCatalogKey =
  | 'INVALID_QUERY_PARAMETER'
  | 'UNKNOWN_QUERY_PARAMETER'
  | 'INVALID_DOCUMENT'
  | 'UNSUPPORTED_SORT'
  | 'MAX_PAGE_SIZE_EXCEEDED'
  | 'RANGE_PAGINATION_NOT_SUPPORTED'
  | 'CLIENT_GENERATED_ID_NOT_SUPPORTED';

/** The catalog fragment, in the shape `createBan({ errors })` takes. */
export type JsonApiCatalog = Readonly<
  Record<JsonApiCatalogKey, ErrorDefinition>
>;

/** Every code the package emits: its own entries plus the @nizam-os/ban-core built-ins it uses. */
export type ErrorCode =
  | JsonApiCatalogKey
  | 'MALFORMED_JSON'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_ACCEPTABLE'
  | 'CONFLICT'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'VALIDATION_FAILED'
  | 'INTERNAL_SERVER_ERROR';

export const ERROR_CATALOG: JsonApiCatalog = {
  /** A query parameter whose value cannot be processed. */
  INVALID_QUERY_PARAMETER: {
    status: HTTP_BAD_REQUEST,
    title: 'Invalid Query Parameter',
  },
  /** A query parameter the endpoint does not know how to process. */
  UNKNOWN_QUERY_PARAMETER: {
    status: HTTP_BAD_REQUEST,
    title: 'Unknown Query Parameter',
  },
  /** A request document that violates the document structure rules. */
  INVALID_DOCUMENT: { status: HTTP_BAD_REQUEST, title: 'Invalid Document' },
  /** The Cursor Pagination profile's unsupported sort error. */
  UNSUPPORTED_SORT: {
    status: HTTP_BAD_REQUEST,
    title: 'Unsupported Sort',
    type: UNSUPPORTED_SORT_TYPE,
  },
  /** The Cursor Pagination profile's max page size exceeded error. */
  MAX_PAGE_SIZE_EXCEEDED: {
    status: HTTP_BAD_REQUEST,
    title: 'Max Page Size Exceeded',
    type: MAX_SIZE_EXCEEDED_TYPE,
  },
  /** The Cursor Pagination profile's range pagination not supported error. */
  RANGE_PAGINATION_NOT_SUPPORTED: {
    status: HTTP_BAD_REQUEST,
    title: 'Range Pagination Not Supported',
    type: RANGE_PAGINATION_NOT_SUPPORTED_TYPE,
  },
  /** A client-generated `id` on a resource whose definition does not accept them. */
  CLIENT_GENERATED_ID_NOT_SUPPORTED: {
    status: HTTP_FORBIDDEN,
    title: 'Client-Generated ID Not Supported',
  },
};

/** In status order; the SPEC 4.1 table. */
export const ERROR_CODES: ReadonlyArray<ErrorCode> = [
  'INVALID_QUERY_PARAMETER',
  'UNKNOWN_QUERY_PARAMETER',
  'INVALID_DOCUMENT',
  'MALFORMED_JSON',
  'UNSUPPORTED_SORT',
  'MAX_PAGE_SIZE_EXCEEDED',
  'RANGE_PAGINATION_NOT_SUPPORTED',
  'FORBIDDEN',
  'CLIENT_GENERATED_ID_NOT_SUPPORTED',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'NOT_ACCEPTABLE',
  'CONFLICT',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  'INTERNAL_SERVER_ERROR',
];
