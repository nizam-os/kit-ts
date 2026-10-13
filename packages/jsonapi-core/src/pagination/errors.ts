/**
 * The Cursor Pagination profile's errors (SPEC 8.4): each a 400 item with
 * `source.parameter` and, where the profile defines one, its `type` link
 * (from the catalog entry). The builders return items so `parseQuery` can
 * report them among its other problems; `unsupportedSort` and
 * `invalidCursor` wrap one for an engine that throws.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id-error-cases
 * @packageDocumentation
 */
import type { BanError, ErrorItem } from '@nizam-os/ban-core';

import { errorItem, jsonApiError } from '../errors/json-api-error';
import { quotable } from '../internal/quotable';

export {
  MAX_SIZE_EXCEEDED_TYPE,
  RANGE_PAGINATION_NOT_SUPPORTED_TYPE,
  UNSUPPORTED_SORT_TYPE,
} from '../internal/constants';

export function maxPageSizeExceededError(
  requested: number,
  maxSize: number,
): ErrorItem {
  return errorItem('MAX_PAGE_SIZE_EXCEEDED', {
    detail: `page[size] ${String(requested)} exceeds the maximum of ${String(maxSize)}`,
    source: { parameter: 'page[size]' },
    meta: { page: { maxSize } },
  });
}

/** `field` is the request's text; the detail quotes it only when it is a plain token (ADR 0016). */
export function unsupportedSortError(field: string): ErrorItem {
  return errorItem('UNSUPPORTED_SORT', {
    detail: quotable(field)
      ? `Sort field "${field}" is not supported by this endpoint`
      : 'A sort field is not supported by this endpoint',
    source: { parameter: 'sort' },
  });
}

export function rangePaginationNotSupportedError(): ErrorItem {
  return errorItem('RANGE_PAGINATION_NOT_SUPPORTED', {
    detail: 'page[after] and page[before] cannot be combined on this endpoint',
    source: { parameter: 'page[before]' },
  });
}

export function invalidCursorError(
  parameter: 'page[after]' | 'page[before]',
  detail = `${parameter} is not a valid cursor`,
): ErrorItem {
  return errorItem('INVALID_QUERY_PARAMETER', {
    detail,
    source: { parameter },
  });
}

export function invalidCursor(
  parameter: 'page[after]' | 'page[before]',
  detail?: string,
): BanError {
  return jsonApiError(invalidCursorError(parameter, detail));
}

export function unsupportedSort(field: string): BanError {
  return jsonApiError(unsupportedSortError(field));
}
