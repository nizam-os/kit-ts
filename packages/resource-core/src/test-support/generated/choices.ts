/**
 * What a generated declaration exposes of its table (SPEC 15.2): every
 * column it can, each field with an access its column allows (SPEC 3.1),
 * each foreign key to a public table as a relationship, filters and sorts
 * its keyset type takes (SPEC 11.3), client ids where the key takes a
 * client value (SPEC 3.4), and a validator for each enforced CHECK without
 * a rule over a written column (SPEC 3.5). The keyset types and the
 * nullability come from the model, never from the code under test.
 * Not published with the package.
 * @packageDocumentation
 */
import type {
  PublicCatalog,
  PublicColumn,
  PublicTable,
} from '@nizam-os/catalog-core';

import type { Access, ModelMember } from '../model/members';
import type { Random } from './random';

import { effectivelyNotNull } from '../model/insert';
import {
  fieldOperators,
  keysetTypeOf,
  relationshipOperators,
} from '../model/keyset';
import { camelCase, relationshipName } from '../model/names';
import { columnRules, levelOf } from '../model/value-levels';
import { SCOPE_COLUMN } from './tables';

/** An entry of a declaration's `rules` or of the definer's `domains`. */
export interface RuleEntry {
  readonly validator?: string;
  readonly code?: string;
}

/** Everything a generated declaration states. */
export interface TableChoices {
  readonly table: string;
  readonly members: ReadonlyArray<ModelMember>;
  readonly scoped: boolean;
  readonly clientIds: boolean;
  readonly operations: ReadonlyArray<string>;
  readonly rules: Readonly<Record<string, RuleEntry>>;
}

const ACCESSES: ReadonlyArray<Access> = [
  'read',
  'readWrite',
  'immutable',
  'write',
];
/** A relationship is never write-only (SPEC 3, `RelationshipDeclaration`). */
const RELATIONSHIP_ACCESSES: ReadonlyArray<Access> = [
  'read',
  'readWrite',
  'immutable',
];
const OPERATIONS = ['list', 'get', 'create', 'update', 'remove'] as const;

function accessesFor(column: PublicColumn): ReadonlyArray<Access> {
  if (column.generated !== null || column.identity === 'always') {
    return ['read'];
  }
  return column.identity === 'byDefault' ? ['read', 'immutable'] : ACCESSES;
}

function someOf(random: Random, list: ReadonlyArray<string>): Array<string> {
  const chosen = random.subset(list);
  return chosen.length > 0 ? chosen : [random.pick(list)];
}

function field(
  random: Random,
  catalog: PublicCatalog,
  table: PublicTable,
  column: string,
): ModelMember {
  const definition = table.columns[column]!;
  const type = keysetTypeOf(
    catalog,
    levelOf(catalog, definition),
    columnRules(table, column),
  );
  const nullable = !effectivelyNotNull(catalog, table, column);
  return {
    kind: 'field',
    column,
    name: camelCase(column),
    access: random.pick(accessesFor(definition)),
    filter:
      type !== null && random.chance(0.4)
        ? someOf(random, fieldOperators(type.type, nullable))
        : null,
    sort: type !== null && type.type !== 'array' && random.chance(0.3),
    target: null,
    codec: false,
  };
}

function relationship(
  random: Random,
  catalog: PublicCatalog,
  table: PublicTable,
  column: string,
  target: string,
): ModelMember {
  const type = keysetTypeOf(
    catalog,
    levelOf(catalog, table.columns[column]!),
    [],
  )!;
  const nullable = !effectivelyNotNull(catalog, table, column);
  return {
    kind: 'relationship',
    column,
    name: relationshipName(column),
    access: random.pick(RELATIONSHIP_ACCESSES),
    filter: random.chance(0.3)
      ? someOf(random, relationshipOperators(type.type, nullable))
      : null,
    sort: false,
    target,
    codec: false,
  };
}

/** The single-column foreign keys of `table`, column to target table. */
function foreignKeyTargets(table: PublicTable): Map<string, string> {
  return new Map(
    Object.values(table.constraints).flatMap((constraint) =>
      constraint.kind === 'foreignKey' && constraint.columns.length === 1
        ? [[constraint.columns[0]!, constraint.references.table] as const]
        : [],
    ),
  );
}

function members(
  random: Random,
  catalog: PublicCatalog,
  table: PublicTable,
  scoped: boolean,
): Array<ModelMember> {
  const targets = foreignKeyTargets(table);
  return Object.keys(table.columns).flatMap((column) => {
    const target = targets.get(column);
    if (column === table.primaryKey?.[0]) {
      return [];
    }
    if (target === undefined) {
      return [field(random, catalog, table, column)];
    }
    if (catalog.tables[target] === undefined) {
      return [];
    }
    if (scoped && column === SCOPE_COLUMN) {
      const scope = {
        ...relationship(random, catalog, table, column, target),
        access: 'read',
        filter: null,
      } as const;
      return random.chance(0.5) ? [scope] : [];
    }
    return [relationship(random, catalog, table, column, target)];
  });
}

/** A validator for each enforced CHECK without a rule whose columns a declared operation writes. */
function validatedChecks(
  table: PublicTable,
  chosen: ReadonlyArray<ModelMember>,
): Record<string, RuleEntry> {
  const written = new Set(
    chosen
      .filter(({ access }) => access !== 'read')
      .map(({ column }) => column),
  );
  return Object.fromEntries(
    Object.entries(table.constraints).flatMap(([key, constraint]) =>
      constraint.kind === 'check' &&
      constraint.enforced &&
      constraint.rule === null &&
      constraint.columns.some((column) => written.has(column))
        ? [[key, { validator: 'anything' }] as const]
        : [],
    ),
  );
}

/** The declaration of `table`, before any code is given. */
export function chooseTable(
  random: Random,
  catalog: PublicCatalog,
  table: PublicTable,
): TableChoices {
  const scoped =
    table.columns[SCOPE_COLUMN] !== undefined && random.chance(0.7);
  const chosen = members(random, catalog, table, scoped);
  const key = table.columns[table.primaryKey![0]!]!;
  const updatable = chosen.some(
    ({ access }) => access === 'readWrite' || access === 'write',
  );
  return {
    table: table.name,
    members: chosen,
    scoped,
    clientIds:
      key.generated === null && key.identity !== 'always' && random.chance(0.3),
    operations: OPERATIONS.filter(
      (operation) => operation !== 'update' || updatable,
    ),
    rules: validatedChecks(table, chosen),
  };
}
