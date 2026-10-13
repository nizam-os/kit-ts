/**
 * `deriveNames` (SPEC 4): the public names of a declared resource, with
 * both directions of each mapping, checked as SPEC 4.2 requires within one
 * resource. Each mistake throws `TypeError` whose message starts with the
 * option's path in database names (SPEC 14); a derived name that fails
 * asks for `as` or `code`, which nothing else can set (ADR 0003). The
 * type-level twins are `names-check.ts` and `codes-check.ts`.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type { Declaration } from '../declare/types';
import type { ResourceNames } from './types';

import { toCamelCase } from '@nizam-os/catalog-core';

import { ownValue } from '../internal/object';
import { deriveCode, isCode } from './code';
import { codedKeys } from './coded-keys';
import { memberNameProblem, typeNameProblem } from './member-name';
import { camelCaseDiverges, idBase } from './public-names';

const NOT_A_CODE = 'is not A-Z, 0-9, _';
const DIVERGES =
  "a letter outside the Basic Multilingual Plane follows _, which Kysely's CamelCasePlugin leaves as is and TypeScript upper-cases; set as";

/** A name and whether the declaration gave it (`as`, `code`) or it was derived. */
interface Named {
  readonly name: string;
  readonly given: boolean;
}

/** `<path>: <what> "<name>" <problem>; set <option>` when derived, `<path>.<option>: "<name>" <problem>` when given. */
function nameError(
  path: string,
  [what, option]: readonly [string, 'as' | 'code'],
  { name, given }: Named,
  problem: string,
): TypeError {
  return new TypeError(
    given
      ? `${path}.${option}: "${name}" ${problem}`
      : `${path}: ${what} "${name}" ${problem}; set ${option}`,
  );
}

function typeName(
  table: string,
  tableDef: PublicTable,
  declaration: Declaration,
): string {
  const named: Named =
    declaration.as === undefined
      ? { name: tableDef.name, given: false }
      : { name: declaration.as, given: true };
  const problem = typeNameProblem(named.name);
  if (problem !== undefined) {
    throw nameError(table, ['the type', 'as'], named, problem);
  }
  return named.name;
}

/** The derived name of a member's column, or a `TypeError` for a column that needs `as`. */
function derivedName(
  path: string,
  column: string,
  relationship: boolean,
): string {
  const base = relationship ? idBase(column) : column;
  if (base === undefined) {
    throw new TypeError(`${path}: the column does not end in _id; set as`);
  }
  if (camelCaseDiverges(base)) {
    throw new TypeError(`${path}: ${DIVERGES}`);
  }
  return toCamelCase(base);
}

interface MemberNames {
  readonly fields: ReadonlyMap<string, string>;
  readonly relationships: ReadonlyMap<string, string>;
  readonly columns: ReadonlyMap<string, string>;
}

function memberNames(table: string, declaration: Declaration): MemberNames {
  const groups = {
    fields: new Map<string, string>(),
    relationships: new Map<string, string>(),
  };
  const columns = new Map<string, string>();
  const owners = new Map<string, string>();
  const members = [
    ...Object.entries(declaration.fields).map(
      ([column, { as }]) => ['fields', column, as] as const,
    ),
    ...Object.entries(declaration.relationships ?? {}).map(
      ([column, { as }]) => ['relationships', column, as] as const,
    ),
  ];
  for (const [group, column, as] of members) {
    const path = `${table}.${group}.${column}`;
    const named: Named =
      as === undefined
        ? {
            name: derivedName(path, column, group === 'relationships'),
            given: false,
          }
        : { name: as, given: true };
    const owner = owners.get(named.name);
    const problem =
      memberNameProblem(named.name) ??
      (owner === undefined ? undefined : `collides with ${owner}`);
    if (problem !== undefined) {
      throw nameError(path, ['public name', 'as'], named, problem);
    }
    owners.set(named.name, `${group}.${column}`);
    groups[group].set(named.name, column);
    columns.set(column, named.name);
  }
  return { ...groups, columns };
}

interface CodeNames {
  readonly codes: ReadonlyMap<string, string>;
  readonly rules: ReadonlyMap<string, string>;
}

function codeNames(
  table: string,
  tableDef: PublicTable,
  declaration: Declaration,
  scopeColumn: string | undefined,
): CodeNames {
  const keys = codedKeys(tableDef, declaration, scopeColumn);
  const declared = declaration.rules ?? {};
  for (const [key, rule] of Object.entries(declared)) {
    if (rule.code !== undefined && !keys.includes(key)) {
      throw new TypeError(
        `${table}.rules.${key}.code: the key has no code, since clients cannot violate it`,
      );
    }
  }
  const codes = new Map<string, string>();
  const rules = new Map<string, string>();
  for (const key of keys) {
    const code = ownValue(declared, key)?.code;
    const named: Named =
      code === undefined
        ? { name: deriveCode(key), given: false }
        : { name: code, given: true };
    const owner = codes.get(named.name);
    const problem = isCode(named.name)
      ? owner === undefined
        ? undefined
        : `collides with ${owner}`
      : NOT_A_CODE;
    if (problem !== undefined) {
      throw nameError(
        `${table}.rules.${key}`,
        ['code', 'code'],
        named,
        problem,
      );
    }
    codes.set(named.name, key);
    rules.set(key, named.name);
  }
  return { codes, rules };
}

/**
 * The names of a resource over `table` (SPEC 4.3), whose primary key
 * column is `id` and whose scope, if any, names `scopeColumn`. Runs after
 * the declaration checks, so every member names a column of the right
 * kind.
 */
export function deriveNames(
  table: string,
  tableDef: PublicTable,
  {
    id,
    scopeColumn,
  }: { readonly id: string; readonly scopeColumn: string | undefined },
  declaration: Declaration,
): ResourceNames {
  return Object.freeze({
    type: typeName(table, tableDef, declaration),
    table,
    id,
    ...memberNames(table, declaration),
    ...codeNames(table, tableDef, declaration, scopeColumn),
  });
}
