/**
 * The rule keys a resource derives a code for (SPEC 9.1): each enforced
 * constraint with a column that is a public field or relationship other
 * than the scope column, the primary key when `clientIds` is true, and the
 * NOT NULL key (SPEC 3.5) of each public member an operation writes.
 * Clients can cause and see exactly these, so no other key takes `code`.
 * The server writes the scope column (SPEC 3.2), so declaring it as a read
 * relationship changes no code: a foreign key over it alone is the
 * server's to violate. A NOT ENFORCED CHECK or foreign key is no one's to
 * violate, since the database never raises it (catalog ADR 0010).
 * @packageDocumentation
 */
import type { PublicConstraint, PublicTable } from '@nizam-os/catalog-core';

import type { ColumnName, ConstraintName } from '../catalog/types';
import type { MemberColumn, WrittenColumn } from '../declare/members';
import type { Declaration, MemberOf } from '../declare/types';
import type { CodeOf } from './code';

import { isEnforced, notNullKey } from '../catalog/columns';
import { memberColumns, writtenColumns } from '../declare/members';

/** The member columns whose constraints clients can cause: every one but the scope column. */
export type CodingColumn<TDecl extends Declaration, TScopeColumn> = Exclude<
  MemberColumn<TDecl>,
  TScopeColumn
>;

/** The constraints with a code. */
export type CodedConstraint<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
> = {
  [K in ConstraintName<TTableDef>]: TTableDef['constraints'][K] extends {
    readonly enforced: false;
  }
    ? never
    : [
          Extract<
            TTableDef['constraints'][K]['columns'][number],
            CodingColumn<TDecl, TScopeColumn>
          >,
        ] extends [never]
      ? TTableDef['constraints'][K]['kind'] extends 'primaryKey'
        ? MemberOf<TDecl, 'clientIds'> extends true
          ? K
          : never
        : never
      : K;
}[ConstraintName<TTableDef>];

type CodedNotNullKey<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = {
  [
    C in WrittenColumn<TDecl> & ColumnName<TTableDef>
  ]: TTableDef['columns'][C]['nullable'] extends false
    ? `${TTableDef['name']}_${C}_not_null`
    : never;
}[WrittenColumn<TDecl> & ColumnName<TTableDef>];

/** The rule keys with a code. */
export type CodedKey<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
> = (
  | CodedConstraint<TTableDef, TDecl, TScopeColumn>
  | CodedNotNullKey<TTableDef, TDecl>
) &
  string;

/**
 * Each code mapped to the keys that take it, the type-level twin of
 * `names.codes`. Remapped keys that coincide merge into a union, so a code
 * two keys take maps to both (`codes-check.ts`).
 * @ref https://www.typescriptlang.org/docs/handbook/2/mapped-types.html#key-remapping-via-as
 */
export type CodeNames<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
> = {
  [K in CodedKey<TTableDef, TDecl, TScopeColumn> as CodeOf<TDecl, K>]: K;
};

function isCoded(
  constraint: PublicConstraint,
  members: ReadonlySet<string>,
  clientIds: boolean,
): boolean {
  return (
    isEnforced(constraint) &&
    (constraint.columns.some((column) => members.has(column)) ||
      (constraint.kind === 'primaryKey' && clientIds))
  );
}

/** The rule keys with a code: constraints in catalog order, then NOT NULL keys in column order. */
export function codedKeys(
  tableDef: PublicTable,
  declaration: Declaration,
  scopeColumn: string | undefined,
): ReadonlyArray<string> {
  const members = new Set(memberColumns(declaration));
  if (scopeColumn !== undefined) {
    members.delete(scopeColumn);
  }
  const clientIds = declaration.clientIds === true;
  const constraints = Object.entries(tableDef.constraints)
    .filter(([, constraint]) => isCoded(constraint, members, clientIds))
    .map(([name]) => name);
  const written = writtenColumns(declaration);
  const notNull = Object.entries(tableDef.columns)
    .filter(([column, columnDef]) => written.has(column) && !columnDef.nullable)
    .map(([column]) => notNullKey(tableDef, column));
  return [...constraints, ...notNull];
}
