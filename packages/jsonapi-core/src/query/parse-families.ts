/**
 * Parsers for the reserved families (SPEC 6.4 to 6.7): `include`, `fields`,
 * `sort`, and `page`. Each reads one parameter, records what it understood,
 * and reports every problem as an error item rather than stopping at the
 * first, so a client sees all of its mistakes in one 400. A detail quotes
 * the request's text only when it is a plain token (ADR 0016).
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 * @ref https://jsonapi.org/format/1.1/#fetching-sparse-fieldsets
 * @ref https://jsonapi.org/format/1.1/#fetching-sorting
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/
 * @packageDocumentation
 */
import type { ErrorItem } from '@nizam-os/ban-core';

import type { AnyResource } from '../resource/types';
import type { Registry } from './registry';
import type { ParameterValue, SortField } from './types';

import { isMemberPath } from '../document/member-name';
import { errorItem } from '../errors/json-api-error';
import { CURSOR_PAGE_MEMBERS, PAGE_SIZE_PATTERN } from '../internal/constants';
import { quotable } from '../internal/quotable';
import {
  maxPageSizeExceededError,
  unsupportedSortError,
} from '../pagination/errors';
import { resolveIncludePath } from './registry';

/** Where parsers accumulate results and errors for one request. */
export interface ParseState {
  readonly resource: AnyResource;
  readonly registry: Registry;
  readonly errors: Array<ErrorItem>;
  readonly fields: Map<string, ReadonlyArray<string>>;
  readonly sort: Array<SortField>;
  readonly page: Map<string, string>;
}

export function invalid(parameter: string, detail: string): ErrorItem {
  return errorItem('INVALID_QUERY_PARAMETER', {
    detail,
    source: { parameter },
  });
}

export function unknown(parameter: string): ErrorItem {
  return errorItem('UNKNOWN_QUERY_PARAMETER', {
    detail: quotable(parameter)
      ? `Query parameter "${parameter}" is not supported by this endpoint`
      : 'This query parameter is not supported by this endpoint',
    source: { parameter },
  });
}

/** A comma-separated list; an empty value is an empty list. */
function commaList(value: string): Array<string> {
  return value === '' ? [] : value.split(',');
}

/**
 * Parameters a client may send once: a second occurrence has no defined
 * meaning (which `sort` order? which `page[size]`?) and is rejected.
 */
export function single(
  state: ParseState,
  parameter: string,
  values: ParameterValue,
): string | undefined {
  if (typeof values === 'string') {
    return values;
  }
  state.errors.push(
    invalid(
      parameter,
      quotable(parameter)
        ? `Query parameter "${parameter}" is specified more than once`
        : 'This query parameter is specified more than once',
    ),
  );
  return undefined;
}

export function parseInclude(
  state: ParseState,
  value: string,
): Array<ReadonlyArray<string>> {
  const paths: Array<ReadonlyArray<string>> = [];
  const seen = new Set<string>();
  for (const path of commaList(value)) {
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    if (!isMemberPath(path)) {
      state.errors.push(
        invalid(
          'include',
          quotable(path)
            ? `"${path}" is not a relationship path`
            : 'A path in include is not a relationship path',
        ),
      );
      continue;
    }
    const segments = path.split('.');
    if (resolveIncludePath(state.registry, segments) === undefined) {
      state.errors.push(
        invalid(
          'include',
          quotable(path)
            ? `Relationship path "${path}" is not supported by this endpoint`
            : 'A relationship path in include is not supported by this endpoint',
        ),
      );
      continue;
    }
    paths.push(segments);
  }
  return paths;
}

export function parseFields(
  state: ParseState,
  parameter: string,
  type: string,
  value: string,
): void {
  if (!state.resource.query.fields) {
    state.errors.push(unknown(parameter));
    return;
  }
  const resource = state.registry.types.get(type);
  if (resource === undefined) {
    state.errors.push(
      invalid(
        parameter,
        quotable(type)
          ? `Resource type "${type}" does not appear in responses from this endpoint`
          : 'The resource type of this parameter does not appear in responses from this endpoint',
      ),
    );
    return;
  }
  const fields: Array<string> = [];
  for (const field of commaList(value)) {
    if (!resource.fields.has(field)) {
      state.errors.push(
        invalid(
          parameter,
          quotable(field)
            ? `"${field}" is not a field of "${resource.type}"`
            : `A listed field is not a field of "${resource.type}"`,
        ),
      );
    } else if (!fields.includes(field)) {
      fields.push(field);
    }
  }
  state.fields.set(type, fields);
}

export function parseSort(state: ParseState, value: string): void {
  const supported: ReadonlyArray<string> = state.resource.query.sort;
  const seen = new Set<string>();
  for (const entry of commaList(value)) {
    const descending = entry.startsWith('-');
    const field = descending ? entry.slice(1) : entry;
    if (!supported.includes(field)) {
      state.errors.push(unsupportedSortError(field));
      continue;
    }
    if (seen.has(field)) {
      state.errors.push(invalid('sort', `Sort field "${field}" is repeated`));
      continue;
    }
    seen.add(field);
    state.sort.push({ field, direction: descending ? 'desc' : 'asc' });
  }
}

export function parsePageMember(
  state: ParseState,
  parameter: string,
  member: string,
  value: string,
): void {
  const page = state.resource.query.page;
  if (page === undefined || !CURSOR_PAGE_MEMBERS.has(member)) {
    state.errors.push(unknown(parameter));
    return;
  }
  if (member === 'size') {
    if (!PAGE_SIZE_PATTERN.test(value) || Number(value) === 0) {
      state.errors.push(
        invalid(
          parameter,
          quotable(value)
            ? `page[size] must be a positive integer; got "${value}"`
            : 'page[size] must be a positive integer',
        ),
      );
      return;
    }
    const size = Number(value);
    if (size > page.max) {
      state.errors.push(maxPageSizeExceededError(size, page.max));
      return;
    }
  } else if (value === '') {
    state.errors.push(invalid(parameter, `page[${member}] must be a cursor`));
    return;
  }
  state.page.set(member, value);
}
