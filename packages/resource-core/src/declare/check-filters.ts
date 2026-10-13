/**
 * `filter` and `sort` against `@nizam-os/keyset-core` (SPEC 11.2, 11.3): a
 * member filters with the operators its keyset type accepts, `isNull` only
 * when it is effectively nullable, and sorts only by a scalar keyset type;
 * its public name becomes a keyset-core field name and takes no member of
 * `filter` the JSON:API definition reserves; and the primary key, by which
 * keyset-core orders every page, has a keyset type. It runs once the
 * members' specs are known, since keyset types and nullability come from
 * them, so a declaration that passes derives definitions keyset-core and
 * `@nizam-os/jsonapi-core` accept; it returns the members with their keyset
 * types, which the keyset definition is built from
 * (`jsonapi/keyset-definition.ts`). The type-level twins are
 * `FilterRequirement` in `filter-check.ts`, `KeysetNamesCheck` in
 * `names/keyset-names-check.ts`, and `IdentityCheck` in
 * `declaration-check.ts`.
 * @ref https://github.com/nizam-os/kit-ts/blob/main/docs/keyset/SPEC.md (sections 3, 4.2, and 5)
 * @ref https://jsonapi.org/recommendations/#naming
 * @ref https://jsonapi.org/format/1.1/#document-member-names-allowed-characters (a space and non-ASCII characters: "not recommended, not URL safe")
 * @packageDocumentation
 */
import type { Operator } from '@nizam-os/keyset-core';

import type { KeysetType } from '../jsonapi/keyset-type';
import type { MemberSpec } from '../schema/field-spec';
import type { ResourceSpecs } from '../schema/resource-specs';
import type { ValueForm } from '../schema/value-form';
import type { Declaration } from './types';

import { isFieldName, operatorsFor } from '@nizam-os/keyset-core';

import { ownValue } from '../internal/object';
import { FIELD_NAME_SYNTAX } from '../jsonapi/keyset-names';
import { keysetTypeOf } from '../jsonapi/keyset-type';
import { FILTER_OR_MEMBER, SEARCH_MEMBER } from '../jsonapi/query-names';

/** What a member declares about filtering and sorting. */
interface Filtering {
  readonly filter?: ReadonlyArray<Operator> | undefined;
  readonly sort?: boolean | undefined;
}

/** A member keyset-core filters or sorts by, with its keyset type: what a keyset field is built from (SPEC 11.2). */
export interface KeysetMember {
  readonly spec: MemberSpec;
  readonly keyset: KeysetType;
  readonly sortable: boolean;
  /** The declared `filter`, or none. */
  readonly operators: ReadonlyArray<Operator>;
}

/** The primary key, by which keyset-core orders every page, and the members that filter or sort. */
export interface KeysetMembers {
  readonly id: KeysetMember;
  readonly members: ReadonlyArray<KeysetMember>;
}

/**
 * Names a value without a keyset type by why it has none. Every other form
 * has one, so the last case is a text or enum form whose options are empty.
 */
function unkeyed(form: ValueForm): string {
  if (form.kind === 'codec') {
    return 'a codec field';
  }
  if (form.kind === 'json') {
    return `type ${form.type}`;
  }
  return form.kind === 'array'
    ? 'an array of enum values'
    : 'an enum without values';
}

function checkOperators(
  path: string,
  keyset: KeysetType,
  nullable: boolean,
  filter: ReadonlyArray<Operator>,
): void {
  const accepted = operatorsFor(keyset.type, nullable);
  for (const operator of filter) {
    if (operator === 'isNull' && !nullable) {
      throw new TypeError(
        `${path}.filter: operator "isNull" is not available for non-null fields`,
      );
    }
    if (!accepted.has(operator)) {
      throw new TypeError(
        `${path}.filter: operator "${operator}" is not available for ${keyset.type} fields`,
      );
    }
  }
}

/** The public name of a filtered or sortable member, as keyset-core and jsonapi-core take it. */
function checkName(
  path: string,
  spec: MemberSpec,
  filtered: boolean,
  search: boolean,
): void {
  const { name } = spec;
  const option = filtered ? 'filter' : 'sort';
  if (!isFieldName(name)) {
    throw new TypeError(
      `${path}.${option}: public name "${name}" is outside @nizam-os/keyset-core's field names (${FIELD_NAME_SYNTAX})`,
    );
  }
  if (filtered && name === FILTER_OR_MEMBER) {
    throw new TypeError(
      `${path}.filter: public name "${name}" is the filter disjunction, filter[${name}]`,
    );
  }
  if (filtered && search && name === SEARCH_MEMBER) {
    throw new TypeError(
      `${path}.filter: public name "${name}" is the search parameter, filter[${name}]`,
    );
  }
}

function checkMember(
  path: string,
  spec: MemberSpec,
  member: Filtering,
  search: boolean,
): KeysetMember | undefined {
  const { filter, sort } = member;
  if (filter === undefined && sort !== true) {
    return undefined;
  }
  checkName(path, spec, filter !== undefined, search);
  const keyset = keysetTypeOf(spec.value);
  if (keyset === undefined) {
    const what = unkeyed(spec.value.form);
    throw new TypeError(
      filter === undefined
        ? `${path}.sort: ${what} is not sortable`
        : `${path}.filter: ${what} is not filterable`,
    );
  }
  if (filter !== undefined) {
    checkOperators(path, keyset, spec.nullable, filter);
  }
  if (sort === true && keyset.type === 'array') {
    throw new TypeError(`${path}.sort: an array field is not sortable`);
  }
  return { spec, keyset, sortable: sort === true, operators: filter ?? [] };
}

/**
 * Checks the primary key and the `filter` and `sort` of every field and
 * relationship `declaration` names, and returns those keyset-core reads.
 */
export function checkFilters(
  table: string,
  declaration: Declaration,
  specs: Pick<ResourceSpecs, 'id' | 'fields' | 'relationships'>,
): KeysetMembers {
  const key = keysetTypeOf(specs.id.value);
  if (key === undefined) {
    throw new TypeError(
      `${table}: the primary key is ${unkeyed(specs.id.value.form)}, which @nizam-os/keyset-core cannot order`,
    );
  }
  const search = declaration.search !== undefined;
  const members: Array<KeysetMember> = [];
  const add = (path: string, spec: MemberSpec, member?: Filtering): void => {
    const checked =
      member === undefined
        ? undefined
        : checkMember(path, spec, member, search);
    if (checked !== undefined) {
      members.push(checked);
    }
  };
  for (const spec of specs.fields) {
    add(
      `${table}.fields.${spec.column}`,
      spec,
      ownValue(declaration.fields, spec.column),
    );
  }
  const relationships = declaration.relationships ?? {};
  for (const spec of specs.relationships) {
    add(
      `${table}.relationships.${spec.column}`,
      spec,
      ownValue(relationships, spec.column),
    );
  }
  return {
    id: { spec: specs.id, keyset: key, sortable: true, operators: [] },
    members,
  };
}
