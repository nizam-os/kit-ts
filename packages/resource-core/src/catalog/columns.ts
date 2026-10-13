/**
 * Runtime lookups into a public catalog's tables (SPEC 3.1, 5.1): the
 * single-column keys, the search columns, the NOT NULL keys, whether a
 * constraint is enforced, and a column's type followed through its domains.
 * Every lookup is prototype-safe.
 * @packageDocumentation
 */
import type {
  PublicCatalog,
  PublicColumn,
  PublicConstraint,
  PublicForeignKeyConstraint,
  PublicTable,
  TypeKind,
} from '@nizam-os/catalog-core';

import { ownValue } from '../internal/object';
import { isWireType, JSON_TYPES } from '../wire/types';

/** PostgreSQL 18's suffix for a NOT NULL constraint's name, used as the rule key (SPEC 3.5). */
const NOT_NULL_SUFFIX = '_not_null';

/** A column's type followed to its base (the runtime `ResolvedTypeOf`). */
export interface ResolvedType {
  readonly type: string;
  readonly typeKind: TypeKind;
  readonly depth: number;
  readonly domains: ReadonlyArray<string>;
}

/**
 * Follows a column's type through its domains. A domain the catalog does not
 * hold, or one that leads back to itself, can only come from a hand-edited
 * catalog and throws `TypeError` naming `what`.
 */
export function resolveColumnType(
  catalog: PublicCatalog,
  column: PublicColumn,
  what: string,
): ResolvedType {
  let { type, typeKind } = column;
  let depth = column.array ? 1 : 0;
  const domains: Array<string> = [];
  while (typeKind === 'domain') {
    if (domains.includes(type)) {
      throw new TypeError(`${what}: domain ${type} refers to itself`);
    }
    const domain = ownValue(catalog.domains, type);
    if (domain === undefined) {
      throw new TypeError(`${what}: domain ${type} is not in the catalog`);
    }
    domains.push(type);
    if (domain.array) {
      depth += 1;
    }
    ({ type, typeKind } = domain);
  }
  return { type, typeKind, depth, domains };
}

/** Whether a resolved type has a wire form (SPEC 5.1). */
export function hasWireForm(resolved: ResolvedType): boolean {
  if (resolved.depth > 1) {
    return false;
  }
  if (resolved.typeKind === 'enum') {
    return true;
  }
  if (resolved.typeKind !== 'base' || !isWireType(resolved.type)) {
    return false;
  }
  return resolved.depth === 0 || !JSON_TYPES.includes(resolved.type);
}

/**
 * Whether a column can carry a resource id, which is a string on the wire:
 * a scalar wire form other than JSON (SPEC 3.4).
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-identification
 */
export function isIdentifierColumn(
  catalog: PublicCatalog,
  column: PublicColumn,
  what: string,
): boolean {
  const resolved = resolveColumnType(catalog, column, what);
  return (
    hasWireForm(resolved) &&
    resolved.depth === 0 &&
    !JSON_TYPES.includes(resolved.type)
  );
}

/** The name a codec's `types` must hold for a column (SPEC 7.1). */
export function codecTypeName(column: PublicColumn): string {
  return column.array ? `${column.type}[]` : column.type;
}

/** The column of a single-column primary key, or `undefined`. */
export function primaryKeyColumn(table: PublicTable): string | undefined {
  const key = table.primaryKey;
  return key?.length === 1 ? key[0] : undefined;
}

/** The single-column foreign key on `column`, or `undefined`. */
export function foreignKeyOf(
  table: PublicTable,
  column: string,
): PublicForeignKeyConstraint | undefined {
  return Object.values(table.constraints).find(
    (constraint): constraint is PublicForeignKeyConstraint =>
      constraint.kind === 'foreignKey' &&
      constraint.columns.length === 1 &&
      constraint.columns[0] === column,
  );
}

/**
 * Whether PostgreSQL checks the constraint: every kind but a CHECK or a
 * foreign key declared NOT ENFORCED, which the database never raises, so
 * no schema applies it and no client can violate it (catalog ADR 0010).
 * @ref https://www.postgresql.org/docs/18/sql-createtable.html (`NOT ENFORCED`)
 */
export function isEnforced(constraint: PublicConstraint): boolean {
  return !('enforced' in constraint) || constraint.enforced;
}

/** Whether a column is a `tsvector` column, which only `search.column` names. */
export function isSearchColumn(column: PublicColumn): boolean {
  return (
    column.type === 'tsvector' && column.typeKind === 'base' && !column.array
  );
}

/** The rule key of a column's NOT NULL constraint (SPEC 3.5). */
export function notNullKey(table: PublicTable, column: string): string {
  return `${table.name}_${column}${NOT_NULL_SUFFIX}`;
}
