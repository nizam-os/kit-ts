/**
 * The declaration's shape (SPEC 3, 14): member names, value types, and the
 * closed vocabularies (operations, access modes, operators, search modes),
 * checked before anything is looked up in the catalog, so a declaration
 * written in JavaScript fails with the option's path instead of a later
 * `TypeError` from deep inside.
 * @packageDocumentation
 */
import type { Declaration } from './types';

import { isOperator } from '@nizam-os/keyset-core';

import {
  expectKnownKeys,
  expectOneOf,
  expectRecord,
  optionalArray,
  optionalBoolean,
  optionalString,
} from '../internal/expect';
import { describe } from '../internal/object';
import { checkPageInit } from './check-page';

const DECLARATION_KEYS: ReadonlyArray<string> = [
  'as',
  'operations',
  'scope',
  'clientIds',
  'fields',
  'relationships',
  'search',
  'sort',
  'page',
  'rules',
  'description',
];
const FIELD_KEYS: ReadonlyArray<string> = [
  'access',
  'as',
  'codec',
  'filter',
  'sort',
  'description',
  'example',
];
const RELATIONSHIP_KEYS: ReadonlyArray<string> = [
  'target',
  'access',
  'as',
  'filter',
  'include',
  'description',
];
/** The values of `Access`. */
export const ACCESS_MODES = [
  'read',
  'readWrite',
  'immutable',
  'write',
] as const;
/** The accesses a relationship takes: never `write` (SPEC 3.1). */
export const RELATIONSHIP_ACCESS = ['read', 'readWrite', 'immutable'] as const;
/** The values of `RelationshipOperator`. */
export const RELATIONSHIP_OPERATORS = [
  'eq',
  'ne',
  'in',
  'nin',
  'isNull',
] as const;
const SEARCH_MODES = ['websearch', 'plain', 'phrase'] as const;
const SORT_DIRECTIONS = ['asc', 'desc'] as const;

/**
 * `filter` lists at least one operator, each once, as `@nizam-os/jsonapi-core`
 * requires of the resource's query capabilities (SPEC 11.1); `check` names
 * the vocabulary.
 */
function checkFilterList(
  path: string,
  value: unknown,
  check: (path: string, operator: unknown) => void,
): void {
  const operators = optionalArray(`${path}.filter`, value);
  if (operators === undefined) {
    return;
  }
  if (operators.length === 0) {
    throw new TypeError(`${path}.filter: list at least one operator`);
  }
  const seen = new Set<unknown>();
  for (const [index, operator] of operators.entries()) {
    const at = `${path}.filter[${String(index)}]`;
    check(at, operator);
    if (seen.has(operator)) {
      throw new TypeError(`${at}: ${describe(operator)} is listed twice`);
    }
    seen.add(operator);
  }
}

function checkFieldOperator(path: string, operator: unknown): void {
  if (!isOperator(operator)) {
    throw new TypeError(
      `${path}: ${describe(operator)} is not an operator of @nizam-os/keyset-core`,
    );
  }
}

function checkRelationshipOperator(path: string, operator: unknown): void {
  expectOneOf(path, operator, RELATIONSHIP_OPERATORS);
}

function checkField(path: string, value: unknown): void {
  const field = expectRecord(path, value);
  expectKnownKeys(path, field, FIELD_KEYS);
  expectOneOf(`${path}.access`, field['access'], ACCESS_MODES);
  optionalString(`${path}.as`, field['as']);
  optionalString(`${path}.codec`, field['codec']);
  checkFilterList(path, field['filter'], checkFieldOperator);
  optionalBoolean(`${path}.sort`, field['sort']);
  optionalString(`${path}.description`, field['description']);
}

function checkRelationship(path: string, value: unknown): void {
  const relationship = expectRecord(path, value);
  expectKnownKeys(path, relationship, RELATIONSHIP_KEYS);
  if (typeof relationship['target'] !== 'function') {
    throw new TypeError(
      `${path}.target: must be a function returning the target's declared resource`,
    );
  }
  expectOneOf(`${path}.access`, relationship['access'], RELATIONSHIP_ACCESS);
  optionalString(`${path}.as`, relationship['as']);
  checkFilterList(path, relationship['filter'], checkRelationshipOperator);
  optionalBoolean(`${path}.include`, relationship['include']);
  optionalString(`${path}.description`, relationship['description']);
}

function checkMembers(
  path: string,
  value: unknown,
  check: (path: string, member: unknown) => void,
): void {
  for (const [key, member] of Object.entries(expectRecord(path, value))) {
    check(`${path}.${key}`, member);
  }
}

function checkSearch(path: string, value: unknown): void {
  const search = expectRecord(path, value);
  expectKnownKeys(path, search, ['column', 'config', 'mode']);
  if (typeof search['column'] !== 'string') {
    throw new TypeError(
      `${path}.column: must be a column name, received ${describe(search['column'])}`,
    );
  }
  optionalString(`${path}.config`, search['config']);
  if (search['mode'] !== undefined) {
    expectOneOf(`${path}.mode`, search['mode'], SEARCH_MODES);
  }
}

function checkSortEntry(path: string, entry: unknown): void {
  if (typeof entry === 'string') {
    return;
  }
  const record = expectRecord(path, entry);
  expectKnownKeys(path, record, ['field', 'direction']);
  if (typeof record['field'] !== 'string') {
    throw new TypeError(
      `${path}.field: must be a column name, received ${describe(record['field'])}`,
    );
  }
  expectOneOf(`${path}.direction`, record['direction'], SORT_DIRECTIONS);
}

function checkRule(path: string, value: unknown): void {
  const rule = expectRecord(path, value);
  expectKnownKeys(path, rule, ['code', 'validator']);
  optionalString(`${path}.code`, rule['code']);
  optionalString(`${path}.validator`, rule['validator']);
}

/** Checks the shape of a declaration over `table`; once it returns, `value` is a `Declaration`. */
export function checkDeclarationShape(
  table: string,
  value: unknown,
): asserts value is Declaration {
  const declaration = expectRecord(table, value);
  expectKnownKeys(table, declaration, DECLARATION_KEYS);
  optionalString(`${table}.as`, declaration['as']);
  if (!Array.isArray(declaration['operations'])) {
    throw new TypeError(
      `${table}.operations: must be an array, received ${describe(declaration['operations'])}`,
    );
  }
  optionalString(`${table}.scope`, declaration['scope']);
  optionalBoolean(`${table}.clientIds`, declaration['clientIds']);
  checkMembers(`${table}.fields`, declaration['fields'], checkField);
  if (declaration['relationships'] !== undefined) {
    checkMembers(
      `${table}.relationships`,
      declaration['relationships'],
      checkRelationship,
    );
  }
  if (declaration['search'] !== undefined) {
    checkSearch(`${table}.search`, declaration['search']);
  }
  if (declaration['sort'] !== undefined) {
    const sort = expectRecord(`${table}.sort`, declaration['sort']);
    expectKnownKeys(`${table}.sort`, sort, ['default']);
    for (const [index, entry] of (
      optionalArray(`${table}.sort.default`, sort['default']) ?? []
    ).entries()) {
      checkSortEntry(`${table}.sort.default[${String(index)}]`, entry);
    }
  }
  if (declaration['rules'] !== undefined) {
    checkMembers(`${table}.rules`, declaration['rules'], checkRule);
  }
  checkPageInit(`${table}.page`, declaration['page']);
  optionalString(`${table}.description`, declaration['description']);
}
