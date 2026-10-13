/**
 * A keyset refusal as the client's error (resource SPEC 18.5), as keyset's
 * design maps refusals onto `@nizam-os/jsonapi-core` (keyset DESIGN 3.6):
 * the Cursor Pagination profile's error where the profile defines one,
 * and `INVALID_QUERY_PARAMETER` at the parameter the refusal names
 * otherwise, one object per refused filter value (keyset ADR 0019): at
 * the parameter its condition came in, when the list was given the
 * request's `parameters`, else at `filter[<field>][<operator>]`. A detail
 * written here names the parameter, never its value, and a field or
 * operator only once the keyset or the query parser has accepted it as
 * declared.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id-error-cases
 * @ref https://jsonapi.org/format/1.1/#query-parameters ("the server MUST respond with 400 Bad Request")
 * @packageDocumentation
 */
import type { BanError } from '@nizam-os/ban-core';
import type { FilterParameter } from '@nizam-os/resource-core/server';

import {
  errorItem,
  invalidCursor,
  jsonApiError,
  maxPageSizeExceededError,
  rangePaginationNotSupportedError,
  unsupportedSortError,
} from '@nizam-os/jsonapi-core';
import {
  InvalidCursorError,
  InvalidFilterError,
  InvalidFilterValueError,
  InvalidPageSizeError,
  PageSizeExceededError,
  RangeNotSupportedError,
  UnsupportedFilterError,
  UnsupportedSearchError,
  UnsupportedSortError,
} from '@nizam-os/keyset-core';

/** The profile's own error for a refusal it defines one for. */
function profileError(error: unknown): BanError | undefined {
  if (error instanceof UnsupportedSortError) {
    return jsonApiError(
      error.fields.map((field) => unsupportedSortError(field)),
    );
  }
  if (error instanceof PageSizeExceededError) {
    return jsonApiError(maxPageSizeExceededError(error.requested, error.max));
  }
  if (error instanceof RangeNotSupportedError) {
    return jsonApiError(rangePaginationNotSupportedError());
  }
  if (error instanceof InvalidCursorError) {
    return invalidCursor(`page[${error.parameter}]`);
  }
  return undefined;
}

/** A parameter a refusal names and what is wrong with it. */
interface Refused {
  readonly parameter: string;
  readonly detail: string;
}

/** The parameter the condition at `path` came in, among the list's `parameters`. */
function sentAs(
  parameters: ReadonlyArray<FilterParameter>,
  path: ReadonlyArray<string | number>,
): string | undefined {
  return parameters.find(
    (entry) =>
      entry.path.length === path.length &&
      entry.path.every((member, index) => member === path[index]),
  )?.parameter;
}

/** The parameters a refusal names, for the refusals the profile leaves to the server. */
function refusedParameters(
  error: unknown,
  parameters: ReadonlyArray<FilterParameter>,
): ReadonlyArray<Refused> | undefined {
  if (error instanceof InvalidFilterValueError) {
    return error.values.map(({ field, operator, path }) => {
      const parameter =
        sentAs(parameters, path) ?? `filter[${field}][${operator}]`;
      return {
        parameter,
        detail: `${parameter} has a value its field does not accept.`,
      };
    });
  }
  if (error instanceof UnsupportedFilterError) {
    return [
      {
        parameter: 'filter',
        detail:
          'filter names a field or an operator this endpoint does not support.',
      },
    ];
  }
  if (error instanceof InvalidFilterError) {
    return [
      {
        parameter: 'filter',
        detail: 'filter is not a filter this endpoint can read.',
      },
    ];
  }
  if (error instanceof UnsupportedSearchError) {
    return [
      {
        parameter: 'filter[q]',
        detail: 'filter[q] is not supported by this endpoint.',
      },
    ];
  }
  if (error instanceof InvalidPageSizeError) {
    return [
      {
        parameter: 'page[size]',
        detail: 'page[size] must be a positive integer.',
      },
    ];
  }
  return undefined;
}

/**
 * The client's error for a keyset refusal, or `undefined` for anything
 * that is not one. `parameters` are a list's (resource-core's
 * `filterParameters`), which name each refused filter value's parameter
 * as the request spelled it.
 */
export function keysetRefusal(
  error: unknown,
  parameters: ReadonlyArray<FilterParameter> = [],
): BanError | undefined {
  const profile = profileError(error);
  if (profile !== undefined) {
    return profile;
  }
  const refused = refusedParameters(error, parameters);
  return refused === undefined
    ? undefined
    : jsonApiError(
        refused.map(({ parameter, detail }) =>
          errorItem('INVALID_QUERY_PARAMETER', {
            detail,
            source: { parameter },
          }),
        ),
      );
}
