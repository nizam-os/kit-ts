/**
 * `keysetRequest(resource, query)` (SPEC 11.2): what a list route hands
 * `@nizam-os/keyset-core` for what `@nizam-os/jsonapi-core`'s `parseQuery`
 * returned on the same declared resource. Both definitions name members
 * by their public names, so only the shapes of values differ:
 * `parseQuery` yields text, or a list for a repeated parameter, and
 * leaves interpreting them to the application (jsonapi ADR 0007), while
 * keyset-core takes `isNull` as a boolean and `in`, `nin`, `between`, and
 * the operators of an array field as lists (keyset SPEC 4.2). Every other
 * value goes unchanged: keyset-core accepts each type's text form and
 * refuses the rest with its own `InvalidFilterValueError` (keyset SPEC
 * 4.3), which a route renders like any refusal of the plan.
 * @ref https://github.com/nizam-os/kit/blob/main/docs/jsonapi/adr/0007-filter-grammar.md ("interpreting them is the application's job")
 * @packageDocumentation
 */
import type {
  FilterCondition as ParsedCondition,
  ParameterValue,
  ParsedFilter,
  ParsedQuery,
} from '@nizam-os/jsonapi-core';
import type {
  FieldInit,
  FieldsInit,
  Filter,
  KeysetRequestOf,
  NoRelations,
  Operator,
  SortableFieldOf,
} from '@nizam-os/keyset-core';

import type { FilterParameter } from './runtime';
import type { StorageListRequest } from './storage';

import { isOperator, UnsupportedFilterError } from '@nizam-os/keyset-core';

import { ownValue } from '../internal/object';

/** A filter of a declared resource's keyset definition, which has no relations. */
type KeysetFilter = Filter<string, NoRelations>;

/** The operators whose value is a list on a field of any type (keyset SPEC 4.2). */
const LIST_OPERATORS: ReadonlySet<Operator> = new Set(['in', 'nin', 'between']);

/** `isNull`'s boolean from its text form; any other value stays, for keyset-core to refuse. */
function flag(value: ParameterValue): unknown {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return value;
}

function keysetValue(
  field: FieldInit | undefined,
  op: Operator,
  value: ParameterValue,
): unknown {
  if (op === 'isNull') {
    return flag(value);
  }
  const list = LIST_OPERATORS.has(op) || field?.type === 'array';
  return list && typeof value === 'string' ? [value] : value;
}

/**
 * `{ field, op, value }` of a parsed condition. `parseQuery` accepts only
 * the operators the resource declares, all of them keyset-core's; for
 * another query keyset-core's planner would throw the same error.
 */
function condition(fields: FieldsInit, parsed: ParsedCondition): KeysetFilter {
  const { field, operator, value } = parsed;
  if (!isOperator(operator)) {
    throw new UnsupportedFilterError(field, operator);
  }
  return {
    field,
    op: operator,
    value: keysetValue(ownValue(fields, field), operator, value),
  };
}

/** A part of the filter, with the parameter of each condition in it by its path within the part. */
interface Term {
  readonly filter: KeysetFilter;
  readonly parameters: ReadonlyArray<FilterParameter>;
}

function conditionTerm(fields: FieldsInit, parsed: ParsedCondition): Term {
  return {
    filter: condition(fields, parsed),
    parameters: [{ path: [], parameter: parsed.parameter }],
  };
}

/**
 * The terms under `combinator`, each condition's path below it, or a
 * single term as itself. keyset-core binds a cursor to the request's
 * filter as given (keyset SPEC 6.1), so `filter[name]=a` binds it as the
 * hand-written `{ field, op, value }` does.
 */
function joined(combinator: 'and' | 'or', terms: ReadonlyArray<Term>): Term {
  const [only] = terms;
  if (only !== undefined && terms.length === 1) {
    return only;
  }
  const filters = terms.map((term) => term.filter);
  return {
    filter: combinator === 'and' ? { and: filters } : { or: filters },
    parameters: terms.flatMap((term, index) =>
      term.parameters.map(({ path, parameter }) => ({
        path: [combinator, index, ...path],
        parameter,
      })),
    ),
  };
}

/** Every condition and every `filter[or][n]` group must hold; within a group, any condition (jsonapi SPEC 6.8). */
function filterOf(fields: FieldsInit, filter: ParsedFilter): Term | undefined {
  const terms = [
    ...filter.conditions.map((parsed) => conditionTerm(fields, parsed)),
    ...filter.anyOf.map((group) =>
      joined(
        'or',
        group.map((parsed) => conditionTerm(fields, parsed)),
      ),
    ),
  ];
  return terms.length === 0 ? undefined : joined('and', terms);
}

/**
 * The keyset request of a query `parseQuery` parsed with `resource`'s
 * JSON:API definition, typed by its keyset definition, so the result is
 * what `defineKeyset(resource.keyset).plan` takes. `sort`, `search`, and
 * the page members pass as they are; a query without `sort` leaves it
 * out, so the declared default applies, where keyset-core would read an
 * empty `sort` as the key alone. Throws keyset-core's
 * `UnsupportedFilterError` for an operator keyset-core does not have.
 */
export function keysetRequest<TFields extends FieldsInit>(
  resource: { readonly keyset: { readonly fields: TFields } },
  query: NoInfer<ParsedQuery<SortableFieldOf<TFields>, keyof TFields & string>>,
): KeysetRequestOf<TFields, NoRelations>;
export function keysetRequest(
  resource: { readonly keyset: { readonly fields: FieldsInit } },
  query: ParsedQuery,
): StorageListRequest {
  const { sort, filter, search, page } = query;
  return {
    sort: sort.length === 0 ? undefined : sort,
    filter: filterOf(resource.keyset.fields, filter)?.filter,
    search,
    page:
      page === undefined
        ? undefined
        : { size: page.size, after: page.after, before: page.before },
  };
}

/**
 * The query parameter of each condition of the filter `keysetRequest`
 * builds from `query`, by the condition's path in that filter: the list's
 * `parameters` option, so the error of a value keyset-core refuses names
 * the parameter the client sent, such as `filter[status]` or
 * `filter[or][0][status][eq]`, rather than `filter[status][eq]` (SPEC
 * 18.5). Throws as `keysetRequest` does.
 * @ref https://jsonapi.org/format/1.1/#error-objects ("which URI query parameter caused the error")
 */
export function filterParameters(
  resource: { readonly keyset: { readonly fields: FieldsInit } },
  query: ParsedQuery,
): ReadonlyArray<FilterParameter> {
  return filterOf(resource.keyset.fields, query.filter)?.parameters ?? [];
}
