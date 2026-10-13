/**
 * A route's search read back against the definition (resource SPEC 20.7):
 * what a URL holds turned into a state the definition accepts, so a stale
 * or edited link opens the list instead of failing the route. The search
 * is the state as JSON, which a router's JSON search holds, or the API's
 * own parameters; of those only `sort`, `page`, `filter`, and the search
 * parameter are read. `parseQuery` reads them (jsonapi SPEC 6); while it
 * refuses, every parameter its error objects name (`source.parameter`) is
 * dropped and it reads again, which drops each parameter at most once.
 * JSON keeps the members it accepts in their own forms; parameters become
 * the query `parseQuery` read. Values are not checked: a filter value
 * keyset-core refuses, or a cursor the server no longer accepts, is the
 * list request's 400, whose error object names the parameter.
 * @ref https://jsonapi.org/format/1.1/#query-parameters
 * @ref https://jsonapi.org/format/1.1/#error-objects (`source.parameter`)
 * @packageDocumentation
 */
import type { FilterInput, PageInput, Query } from '@nizam-os/jsonapi-client';
import type {
  AnyResource,
  BanError,
  FilterCondition,
  ParameterValue,
  ParsedFilter,
  ParsedQuery,
} from '@nizam-os/jsonapi-core';

import type { ShapedSearch } from './search-shape';

import { serializeQuery } from '@nizam-os/jsonapi-client';
import { errorObjects, isBanError, parseQuery } from '@nizam-os/jsonapi-core';

import { isRecord } from '../internal/object';
import { pageOf } from './list-state';
import { shapedSearch, stateOfShaped, withoutParameters } from './search-shape';

type Pairs = Array<[string, string]>;

/** What `parseQuery` made of some parameters: the query, or each parameter its refusal names, `undefined` when one names none. */
type Reading =
  | { readonly parsed: ParsedQuery }
  | { readonly refused: ReadonlySet<string> | undefined };

/** The families a list's state reads besides the search parameter (step 2). */
const READ: ReadonlySet<string> = new Set(['sort', 'page', 'filter']);

/** `URLSearchParams` of any realm, as a router in another one makes them. */
function isSearchParams(value: unknown): value is URLSearchParams {
  return Object.prototype.toString.call(value) === '[object URLSearchParams]';
}

/** The family of a parameter: its name up to the first `[` (jsonapi SPEC 6.2). */
function familyOf(name: string): string {
  const bracket = name.indexOf('[');
  return bracket === -1 ? name : name.slice(0, bracket);
}

/** Each parameter a refusal's error objects name; `undefined` when one names none. */
function refusedParameters(error: BanError): ReadonlySet<string> | undefined {
  const named = errorObjects(error).map((object) => object.source?.parameter);
  return named.every(
    (parameter): parameter is string => parameter !== undefined,
  )
    ? new Set(named)
    : undefined;
}

function read(definition: AnyResource, params: URLSearchParams): Reading {
  try {
    return { parsed: parseQuery(definition, params) };
  } catch (error) {
    if (!isBanError(error)) {
      throw error;
    }
    return { refused: refusedParameters(error) };
  }
}

/** What `parseQuery` reads of `pairs` once each parameter it refuses is dropped; `undefined` when that drops nothing. */
function parsedLeniently(
  definition: AnyResource,
  pairs: Pairs,
): ParsedQuery | undefined {
  const reading = read(definition, new URLSearchParams(pairs));
  if ('parsed' in reading) {
    return reading.parsed;
  }
  const { refused } = reading;
  const kept = pairs.filter(([name]) => refused?.has(name) === false);
  return refused === undefined || kept.length === pairs.length
    ? undefined
    : parsedLeniently(definition, kept);
}

/** `shaped` once each member whose parameter `parseQuery` refuses is dropped; empty when that drops nothing. */
function acceptedShape(
  definition: AnyResource,
  shaped: ShapedSearch,
): ShapedSearch | undefined {
  const params = serializeQuery(definition, stateOfShaped(shaped));
  const reading = read(definition, params);
  if ('parsed' in reading) {
    return shaped;
  }
  const { refused } = reading;
  if (refused === undefined) {
    return undefined;
  }
  const kept = withoutParameters(
    shaped,
    definition.query.search?.parameter,
    refused,
  );
  const same =
    serializeQuery(definition, stateOfShaped(kept)).toString() ===
    params.toString();
  return same ? undefined : acceptedShape(definition, kept);
}

/** Conditions by member and operator, a repeated parameter's values as a list. */
function conditionsOf(
  conditions: ReadonlyArray<FilterCondition>,
): Record<string, Record<string, ParameterValue>> {
  const byMember = new Map<string, Record<string, ParameterValue>>();
  for (const { field, operator, value } of conditions) {
    byMember.set(field, { ...byMember.get(field), [operator]: value });
  }
  return Object.fromEntries(byMember);
}

function filterOf(filter: ParsedFilter): FilterInput | undefined {
  const conditions = conditionsOf(filter.conditions);
  const or = filter.anyOf.map((group) => conditionsOf(group));
  if (or.length > 0) {
    return { ...conditions, or };
  }
  return Object.keys(conditions).length === 0 ? undefined : conditions;
}

/** `page.size` when the parameters held it, and the cursors. */
function pageOfParsed(page: ParsedQuery['page']): PageInput | undefined {
  return page === undefined
    ? undefined
    : pageOf(
        page.sizeRequested ? page.size : undefined,
        page.after,
        page.before,
      );
}

/** The state a parsed query is (step 4). */
function stateOf(parsed: ParsedQuery): Query {
  const sort = parsed.sort.map(({ field, direction }) =>
    direction === 'desc' ? `-${field}` : field,
  );
  const filter = filterOf(parsed.filter);
  const page = pageOfParsed(parsed.page);
  return {
    ...(sort.length === 0 ? {} : { sort }),
    ...(filter === undefined ? {} : { filter }),
    ...(page === undefined ? {} : { page }),
    ...(parsed.search === undefined ? {} : { search: parsed.search }),
  };
}

/** The state the API's parameters hold, read as `parseQuery` reads them. */
function paramsState(definition: AnyResource, params: URLSearchParams): Query {
  const searchParameter = definition.query.search?.parameter;
  const pairs = [...params].filter(
    ([name]) => READ.has(familyOf(name)) || name === searchParameter,
  );
  const parsed = parsedLeniently(definition, pairs);
  return parsed === undefined ? {} : stateOf(parsed);
}

/**
 * The state `search` holds, read back against `definition`: the state as
 * JSON, or the API's parameters as `URLSearchParams` or a string. A search
 * of any other kind, and one whose refusal drops nothing, is the empty
 * state.
 */
export function lenientQuery(definition: AnyResource, search: unknown): Query {
  if (typeof search === 'string' || isSearchParams(search)) {
    return paramsState(definition, new URLSearchParams(search));
  }
  if (!isRecord(search)) {
    return {};
  }
  const accepted = acceptedShape(definition, shapedSearch(definition, search));
  return accepted === undefined ? {} : stateOfShaped(accepted);
}
