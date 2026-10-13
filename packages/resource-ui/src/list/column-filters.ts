/**
 * `filter` and TanStack Table's column filters (resource SPEC 20.7): each
 * member of `filter` but `or` as `{ id, value }`, the value the member's
 * condition as an object of operators, and back. A bare value is `eq`
 * (jsonapi SPEC 6.8), so a column's filter input reads and writes
 * operators only. `or` is no column's, so it stays as the state holds it.
 * An operator set to `undefined` or to an empty list holds nothing to send,
 * so it is left out, and a filter left without operators is removed, as
 * Table removes one set to `undefined` and its list filters one set to an
 * empty list. A filter on a member without `filter`, or with an operator
 * its member does not declare, is the application's mistake and throws;
 * values are not checked, since the server words what it refuses (keyset
 * SPEC 4.3).
 * @ref https://tanstack.com/table/v9/docs/framework/react/guide/column-filtering
 * @ref https://github.com/TanStack/table/tree/main/packages/table-core/src/features/column-filtering (filterFns: `autoRemove` drops an empty list from the list filters)
 * @ref https://jsonapi.org/format/1.1/#fetching-filtering
 * @packageDocumentation
 */
import type { Condition, Query } from '@nizam-os/jsonapi-client';
import type { AnyResource } from '@nizam-os/jsonapi-core';

import type { AnyColumnFilter } from './list-types';

import { isRecord, ownValue } from '../internal/object';
import { firstPage } from './list-state';

/** What Table's `onColumnFiltersChange` hands: the next column filters, or a function of the current ones. */
export type ColumnFiltersUpdate =
  | ReadonlyArray<AnyColumnFilter>
  | ((current: Array<AnyColumnFilter>) => unknown);

/** The member holding the disjunction groups (jsonapi SPEC 6.8). */
const OR = 'or';

/** The operator of `filter[field]=value`. */
const EQ = 'eq';

/** Table's column filters of `state`. */
export function columnFiltersOf(state: Query): Array<AnyColumnFilter> {
  return Object.entries(state.filter ?? {}).flatMap(([id, condition]) =>
    id === OR || condition === undefined
      ? []
      : [{ id, value: isRecord(condition) ? condition : { [EQ]: condition } }],
  );
}

function isFilterEntry(entry: unknown): entry is AnyColumnFilter {
  if (!isRecord(entry)) {
    return false;
  }
  const { id } = entry;
  return typeof id === 'string';
}

/** Whether an operator holds nothing to send: `undefined`, or a list no parameter repeats (jsonapi SPEC 15.5). */
function isUnset(values: unknown): boolean {
  return values === undefined || (Array.isArray(values) && values.length === 0);
}

/** The set operators of `value`, each declared for the member; `undefined` when none is set. */
function operatorsOf(
  caller: string,
  definition: AnyResource,
  declared: ReadonlyArray<string>,
  value: unknown,
): Condition<string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new TypeError(
      `${caller}: a column filter's value must be an object of operators`,
    );
  }
  if (Object.keys(value).some((operator) => !declared.includes(operator))) {
    throw new TypeError(
      `${caller}: a filter of ${definition.type} has an operator its member does not declare`,
    );
  }
  const set = Object.entries(value).filter(([, values]) => !isUnset(values));
  if (set.length === 0) {
    return undefined;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: values are not checked (resource SPEC 20.7), and `serializeQuery` refuses one no parameter can carry
  return Object.fromEntries(set) as Condition<string>;
}

/** Each column filter with a set operator, as a member and its condition. */
function conditionsOf(
  caller: string,
  definition: AnyResource,
  filters: unknown,
): Array<readonly [string, Condition<string>]> {
  if (
    !Array.isArray(filters) ||
    !filters.every((entry) => isFilterEntry(entry))
  ) {
    throw new TypeError(`${caller}: filters must be a list of { id, value }`);
  }
  return filters.flatMap(({ id, value }) => {
    const declared = ownValue(definition.query.filter, id);
    if (declared === undefined) {
      throw new TypeError(
        `${caller}: a filter of ${definition.type} names a member that does not filter`,
      );
    }
    const condition = operatorsOf(caller, definition, declared, value);
    return condition === undefined ? [] : [[id, condition] as const];
  });
}

/** `state` filtered by `update`, keeping `or`, at its first page; no filter left removes `filter`. */
export function filteredState(
  caller: string,
  definition: AnyResource,
  state: Query,
  update: ColumnFiltersUpdate,
): Query {
  const filters =
    typeof update === 'function' ? update(columnFiltersOf(state)) : update;
  const conditions = conditionsOf(caller, definition, filters);
  const or = state.filter?.[OR];
  const { filter: _filter, ...rest } = firstPage(state);
  if (conditions.length === 0 && or === undefined) {
    return rest;
  }
  const filter = Object.fromEntries<Condition<string>>(conditions);
  return { ...rest, filter: or === undefined ? filter : { ...filter, or } };
}
