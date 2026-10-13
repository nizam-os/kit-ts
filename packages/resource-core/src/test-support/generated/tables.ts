/**
 * Generated tables (SPEC 15.2): a primary key, an optional scope column,
 * generated columns, foreign keys to the other tables, to the table itself,
 * and to a table outside the public catalog, and constraints of every
 * kind: CHECKs with a rule, without one, and NOT ENFORCED, over one column
 * or two, UNIQUE constraints and unique indexes, and exclusions.
 * Not published with the package.
 * @packageDocumentation
 */
import type {
  PublicCheckConstraint,
  PublicColumn,
  PublicConstraint,
  PublicTable,
  Rule,
} from '@nizam-os/catalog-core';

import type { TypeScope } from './domains';
import type { Random } from './random';

import { generateColumn, generateKey } from './columns';
import { subjectOf } from './domains';
import { letters } from './naming';
import { ruleFor } from './rules';

/** The column every scoped table has, a foreign key to `organizations`. */
export const SCOPE_COLUMN = 'organization_id';

/** A table no public catalog holds, which some foreign keys reference. */
const OUTSIDE_TABLE = 'archive_rows';

const TABLE_WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
const MIN_TABLES = 2;
const MAX_COLUMNS = 10;
const MAX_FOREIGN_KEYS = 3;

const UUID_KEY: PublicColumn = {
  type: 'uuid',
  typeKind: 'base',
  array: false,
  sqlType: 'uuid',
  maxLength: null,
  precision: null,
  scale: null,
  nullable: false,
  default: { literal: null },
  identity: null,
  generated: null,
};

const ORGANIZATIONS: PublicTable = {
  schema: 'public',
  name: 'organizations',
  primaryKey: ['id'],
  columns: {
    id: UUID_KEY,
    name: { ...UUID_KEY, type: 'text', sqlType: 'text', default: null },
  },
  constraints: { organizations_pkey: { kind: 'primaryKey', columns: ['id'] } },
};

function check(
  columns: ReadonlyArray<string>,
  rule: Rule | null,
  enforced = true,
): PublicCheckConstraint {
  return { kind: 'check', columns, rule, enforced };
}

function plainColumns(
  random: Random,
  scope: TypeScope,
): Record<string, PublicColumn> {
  const columns: Record<string, PublicColumn> = {};
  const count = random.int(1, MAX_COLUMNS);
  for (let index = 0; index < count; index += 1) {
    const column = generateColumn(random, scope);
    columns[`c${letters(index)}_${column.type}${column.array ? '_list' : ''}`] =
      column;
  }
  return columns;
}

/** CHECKs over one column: a rule its type takes, none, or NOT ENFORCED, and sometimes a second. */
function columnChecks(
  random: Random,
  scope: TypeScope,
  table: string,
  columns: Readonly<Record<string, PublicColumn>>,
): Record<string, PublicConstraint> {
  const checks: Record<string, PublicConstraint> = {};
  for (const [name, column] of Object.entries(columns)) {
    const subject = subjectOf(scope, column, column.array);
    if (random.chance(0.35)) {
      checks[`${table}_${name}_check`] = check(
        [name],
        ruleFor(random, subject),
      );
    } else if (random.chance(0.1)) {
      checks[`${table}_${name}_check`] = check([name], null);
    } else if (random.chance(0.06)) {
      checks[`${table}_${name}_check`] = check([name], null, false);
    }
    if (random.chance(0.1)) {
      checks[`${table}_${name}_check_b`] = check(
        [name],
        ruleFor(random, subject),
      );
    }
  }
  return checks;
}

/** Foreign-key columns, each typed as the key it references. */
function foreignKeys(
  random: Random,
  table: string,
  key: PublicColumn,
  tables: Readonly<Record<string, PublicTable>>,
): readonly [Record<string, PublicColumn>, Record<string, PublicConstraint>] {
  const columns: Record<string, PublicColumn> = {};
  const constraints: Record<string, PublicConstraint> = {};
  const count = random.int(0, MAX_FOREIGN_KEYS);
  for (let index = 0; index < count; index += 1) {
    const target = random.pick([...Object.keys(tables), table, OUTSIDE_TABLE]);
    const name = `f${letters(index)}_${target}_id`;
    const referenced = target === table ? key : tables[target]?.columns['id'];
    const base = referenced ?? { ...UUID_KEY, type: 'int8', sqlType: 'bigint' };
    columns[name] = {
      ...base,
      nullable: random.chance(0.5),
      default: null,
      identity: null,
    };
    constraints[`${table}_${name}_fkey`] = {
      kind: 'foreignKey',
      columns: [name],
      references: { table: target, columns: ['id'] },
      enforced: random.chance(0.9),
    };
  }
  return [columns, constraints];
}

/** CHECKs over two columns, UNIQUE constraints, unique indexes, and exclusions. */
function tableConstraints(
  random: Random,
  table: string,
  columns: Readonly<Record<string, PublicColumn>>,
): Record<string, PublicConstraint> {
  const constraints: Record<string, PublicConstraint> = {};
  const names = Object.keys(columns).filter((name) => name !== 'id');
  const comparable = names.filter((name) => columns[name]!.type !== 'json');
  if (names.length > 1 && random.chance(0.3)) {
    const pair = [random.pick(names), random.pick(names)].filter(
      (name, index, all) => all.indexOf(name) === index,
    );
    constraints[`${table}_${pair.join('_')}_check`] = check(
      pair,
      null,
      random.chance(0.8),
    );
  }
  if (comparable.length > 0 && random.chance(0.5)) {
    const set = [
      ...new Set([random.pick(comparable), random.pick(comparable)]),
    ];
    constraints[`${table}_${set.join('_')}_key`] = {
      kind: 'unique',
      columns: set,
      nullsDistinct: random.chance(0.8),
      partial: false,
    };
  }
  if (comparable.length > 0 && random.chance(0.25)) {
    const column = random.pick(comparable);
    constraints[`${table}_${column}_unique`] = {
      kind: 'unique',
      columns: [column],
      nullsDistinct: true,
      partial: random.chance(0.5),
    };
  }
  if (comparable.length > 0 && random.chance(0.15)) {
    const column = random.pick(comparable);
    constraints[`${table}_${column}_excl`] = {
      kind: 'exclusion',
      columns: [column],
    };
  }
  return constraints;
}

function generateTable(
  random: Random,
  scope: TypeScope,
  name: string,
  tables: Readonly<Record<string, PublicTable>>,
): PublicTable {
  const key = generateKey(random, scope);
  const scoped = random.chance(0.4);
  const plain = plainColumns(random, scope);
  const [references, keys] = foreignKeys(random, name, key, tables);
  const scopeColumns: Record<string, PublicColumn> = scoped
    ? { [SCOPE_COLUMN]: { ...UUID_KEY, default: null } }
    : {};
  const columns = { id: key, ...scopeColumns, ...plain, ...references };
  const scopeKey: Record<string, PublicConstraint> = scoped
    ? {
        [`${name}_${SCOPE_COLUMN}_fkey`]: {
          kind: 'foreignKey',
          columns: [SCOPE_COLUMN],
          references: { table: 'organizations', columns: ['id'] },
          enforced: true,
        },
      }
    : {};
  return {
    schema: 'public',
    name,
    primaryKey: ['id'],
    columns,
    constraints: {
      [`${name}_pkey`]: { kind: 'primaryKey', columns: ['id'] },
      ...scopeKey,
      ...keys,
      ...columnChecks(random, scope, name, plain),
      ...tableConstraints(random, name, columns),
    },
  };
}

/** `organizations` and two to six tables over the types of `scope`. */
export function generateTables(
  random: Random,
  scope: TypeScope,
): Record<string, PublicTable> {
  const tables: Record<string, PublicTable> = { organizations: ORGANIZATIONS };
  const words = random.subset(TABLE_WORDS);
  const names =
    words.length >= MIN_TABLES ? words : TABLE_WORDS.slice(0, MIN_TABLES);
  for (const name of names) {
    tables[name] = generateTable(random, scope, name, tables);
  }
  return tables;
}
