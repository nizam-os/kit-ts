/**
 * A route's JSON search as a list's state takes it (resource SPEC 20.7):
 * its members in their shapes (step 1), `sort` a list of strings, `filter`
 * an object of conditions with `or` a list of such objects, a condition a
 * value or an object of operators, a value a string, a finite number, a
 * boolean, or a non-empty list of them, `page` an object with a positive
 * safe integer `size` and string cursors, `search` a string; and the same
 * members without those whose parameters a refusal names (step 3). A
 * member of another shape is dropped, so an edited link loses what it got
 * wrong and keeps the rest; a condition or a group left with nothing is
 * dropped too. Each member keeps its own form, a list of one value and a
 * number among them, so a router that reads its search back after every
 * navigation reads the state it was given. Only these members are read
 * (step 2): `include`, `fields`, and custom parameters are the screen's to
 * choose, not the URL's.
 * @packageDocumentation
 */
import type {
  Condition,
  FilterValue,
  FilterValues,
  PageInput,
  Query,
} from '@nizam-os/jsonapi-client';
import type { AnyResource } from '@nizam-os/jsonapi-core';

import { isRecord } from '../internal/object';
import { isStringList, pageOf } from './list-state';

type Conditions = Readonly<Record<string, Condition<string>>>;

/** A route's JSON search in the shapes a list's state takes, member by member. */
export interface ShapedSearch {
  readonly sort: ReadonlyArray<string> | undefined;
  readonly conditions: Conditions;
  /** The `or` groups, none of them empty. */
  readonly or: ReadonlyArray<Conditions>;
  readonly page: PageInput | undefined;
  readonly search: string | undefined;
}

/** The member holding the disjunction groups (jsonapi SPEC 6.8). */
const OR = 'or';

function isFilterValue(value: unknown): value is FilterValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function isFilterValues(value: unknown): value is FilterValues {
  return (
    isFilterValue(value) ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every((entry) => isFilterValue(entry)))
  );
}

/** `condition` with each operator of another shape dropped; `undefined` when nothing is left. */
function conditionOf(condition: unknown): Condition<string> | undefined {
  if (isFilterValues(condition)) {
    return condition;
  }
  if (!isRecord(condition)) {
    return undefined;
  }
  const operators = Object.entries(condition).flatMap(([operator, values]) =>
    isFilterValues(values) ? [[operator, values] as const] : [],
  );
  return operators.length === 0 ? undefined : Object.fromEntries(operators);
}

/** The conditions of `conditions` but `or`, each in its shape. */
function conditionsOf(
  conditions: Readonly<Record<string, unknown>>,
): Conditions {
  return Object.fromEntries(
    Object.entries(conditions).flatMap(([member, condition]) => {
      const kept = member === OR ? undefined : conditionOf(condition);
      return kept === undefined ? [] : [[member, kept] as const];
    }),
  );
}

function isEmpty(value: object): boolean {
  return Object.keys(value).length === 0;
}

/** The `or` groups of `filter` with something left in them; none when `or` is not a list of objects. */
function groupsOf(
  filter: Readonly<Record<string, unknown>>,
): Array<Conditions> {
  const groups = filter[OR];
  if (!Array.isArray(groups) || !groups.every((group) => isRecord(group))) {
    return [];
  }
  return groups
    .map((group) => conditionsOf(group))
    .filter((group) => !isEmpty(group));
}

function pageOfJson(page: unknown): PageInput | undefined {
  if (!isRecord(page)) {
    return undefined;
  }
  const { size, after, before } = page;
  return pageOf(
    typeof size === 'number' && Number.isSafeInteger(size) && size > 0
      ? size
      : undefined,
    typeof after === 'string' ? after : undefined,
    typeof before === 'string' ? before : undefined,
  );
}

/**
 * The members of `search` a list's state takes, each in its shape: `page`
 * only where `definition` paginates, and `search` only where it has a
 * search parameter, since no parameter carries them elsewhere.
 */
export function shapedSearch(
  definition: AnyResource,
  search: Readonly<Record<string, unknown>>,
): ShapedSearch {
  const { sort, filter, page, search: text } = search;
  const searched =
    definition.query.search !== undefined && typeof text === 'string';
  return {
    sort: isStringList(sort) ? sort : undefined,
    conditions: isRecord(filter) ? conditionsOf(filter) : {},
    or: isRecord(filter) ? groupsOf(filter) : [],
    page: definition.query.page === undefined ? undefined : pageOfJson(page),
    search: searched ? text : undefined,
  };
}

/** `conditions` without each value whose parameter, under `prefix`, is `refused`. */
function keptConditions(
  prefix: string,
  conditions: Conditions,
  refused: ReadonlySet<string>,
): Conditions {
  return Object.fromEntries(
    Object.entries(conditions).flatMap(
      ([member, condition]): Array<readonly [string, Condition<string>]> => {
        const parameter = `${prefix}[${member}]`;
        if (!isRecord(condition)) {
          return refused.has(parameter) ? [] : [[member, condition] as const];
        }
        const operators = Object.entries(condition).filter(
          ([operator]) => !refused.has(`${parameter}[${operator}]`),
        );
        return operators.length === 0
          ? []
          : [[member, Object.fromEntries(operators)] as const];
      },
    ),
  );
}

/**
 * `shaped` without each member whose parameter is `refused`, under the
 * names `serializeQuery` gives them (jsonapi SPEC 6, 15.5): `sort`, the
 * `page` members, the search parameter `searchParameter`, each condition's
 * `filter[member]` or `filter[member][operator]`, and a group's under
 * `filter[or][index]`.
 */
export function withoutParameters(
  shaped: ShapedSearch,
  searchParameter: string | undefined,
  refused: ReadonlySet<string>,
): ShapedSearch {
  const page = shaped.page ?? {};
  return {
    sort: refused.has('sort') ? undefined : shaped.sort,
    conditions: keptConditions('filter', shaped.conditions, refused),
    or: shaped.or
      .map((group, index) =>
        keptConditions(`filter[${OR}][${String(index)}]`, group, refused),
      )
      .filter((group) => !isEmpty(group)),
    page: pageOf(
      refused.has('page[size]') ? undefined : page.size,
      refused.has('page[after]') ? undefined : page.after,
      refused.has('page[before]') ? undefined : page.before,
    ),
    search:
      searchParameter !== undefined && refused.has(searchParameter)
        ? undefined
        : shaped.search,
  };
}

/** The state `shaped` holds, without its empty members. */
export function stateOfShaped(shaped: ShapedSearch): Query {
  const { sort, conditions, or, page, search } = shaped;
  const filter = or.length === 0 ? conditions : { ...conditions, or };
  return {
    ...(sort === undefined ? {} : { sort }),
    ...(isEmpty(filter) ? {} : { filter }),
    ...(page === undefined ? {} : { page }),
    ...(search === undefined ? {} : { search }),
  };
}
