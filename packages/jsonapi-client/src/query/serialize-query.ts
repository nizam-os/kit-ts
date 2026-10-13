/**
 * `serializeQuery(definition, query)` (SPEC 15.5): the `URLSearchParams`
 * `parseQuery` reads (SPEC 6), its pairs in one order, so one query always
 * gives one URL: `include`, `fields`, `sort`, `page`, `filter`, the search
 * parameter, then the custom parameters. `toString()` is the
 * `application/x-www-form-urlencoded` serializer the specification names:
 * square brackets and commas percent-encoded, which `parseQuery` decodes
 * before it splits `include`, `fields`, and `sort`.
 * @ref https://jsonapi.org/format/1.1/#appendix-query-details-parsing
 * @ref https://jsonapi.org/format/1.1/#appendix-query-details-square-brackets
 * @ref https://url.spec.whatwg.org/#concept-urlencoded-serializer
 * @packageDocumentation
 */
import type { AnyResource } from '@nizam-os/jsonapi-core';

import type { CustomValues, PageInput, Query } from './types';

import { appendFilter } from './serialize-filter';

/** The profile's page size: digits only, and positive (SPEC 6.7). */
function pageSize(size: number): string {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new TypeError(
      'serializeQuery: page.size must be a positive safe integer',
    );
  }
  return String(size);
}

function appendPage(params: URLSearchParams, page: PageInput): void {
  if (page.size !== undefined) {
    params.append('page[size]', pageSize(page.size));
  }
  if (page.after !== undefined) {
    params.append('page[after]', page.after);
  }
  if (page.before !== undefined) {
    params.append('page[before]', page.before);
  }
}

function appendCustom(
  params: URLSearchParams,
  custom: Readonly<Record<string, CustomValues | undefined>>,
): void {
  for (const [name, values] of Object.entries(custom)) {
    if (values === undefined) {
      continue;
    }
    const list = typeof values === 'string' ? [values] : values;
    if (list.length === 0) {
      throw new TypeError(
        `serializeQuery: ${name} must hold at least one value`,
      );
    }
    for (const value of list) {
      params.append(name, value);
    }
  }
}

/** The `page` member, refused on a definition that does not paginate. */
function checkedPage(definition: AnyResource, page: PageInput): PageInput {
  if (definition.query.page === undefined) {
    throw new TypeError(
      `serializeQuery: ${definition.type} does not paginate, so a query has no page`,
    );
  }
  return page;
}

/** The parameter `search` goes in, refused on a definition without one. */
function searchParameter(definition: AnyResource): string {
  if (definition.query.search === undefined) {
    throw new TypeError(
      `serializeQuery: ${definition.type} has no search parameter, so a query has no search`,
    );
  }
  return definition.query.search.parameter;
}

/**
 * The query string `parseQuery(definition, ...)` reads back as `query`.
 * Throws `TypeError` for a value no parameter can carry, a `page.size`
 * that is not a positive safe integer, and `page` or `search` on a
 * definition without them.
 */
export function serializeQuery(
  definition: AnyResource,
  query: Query,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.include !== undefined) {
    params.append('include', query.include.join(','));
  }
  for (const [type, names] of Object.entries(query.fields ?? {})) {
    if (names !== undefined) {
      params.append(`fields[${type}]`, names.join(','));
    }
  }
  if (query.sort !== undefined) {
    params.append('sort', query.sort.join(','));
  }
  if (query.page !== undefined) {
    appendPage(params, checkedPage(definition, query.page));
  }
  if (query.filter !== undefined) {
    appendFilter((name, value) => {
      params.append(name, value);
    }, query.filter);
  }
  if (query.search !== undefined) {
    params.append(searchParameter(definition), query.search);
  }
  if (query.custom !== undefined) {
    appendCustom(params, query.custom);
  }
  return params;
}
