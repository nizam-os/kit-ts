/**
 * The server values of a create (SPEC 3.3, 6.3, 12.3): the columns
 * required on insert that no client-writable member, the scope, or a
 * client id covers. `ServerValuesOf<typeof Contacts>` types what
 * `operations.create.values` returns, keyed by column and exactly those
 * columns, each in its wire form, and `serverValueColumns` lists them for
 * `defineResource`'s runtime check. A field the client may only read
 * covers nothing, so a required column behind it is a server value.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type {
  AnyDeclaredResource,
  DeclaredInternals,
} from '../declare/declared-resource';
import type { DeclareContext } from '../declare/registries';
import type { Declaration, DeclaredMembers, MemberOf } from '../declare/types';
import type { IsRequired } from '../schema/member-types';
import type {
  ColumnRules,
  Creatable,
  TableDefOf,
} from '../schema/resource-types';
import type { ColumnValue } from '../schema/value-types';

import { primaryKeyColumn } from '../catalog/columns';
import { isRequiredOnInsert } from '../catalog/requirement';
import { writtenColumns } from '../declare/members';
import { ownValue } from '../internal/object';

type Fields<TDecl extends Declaration> = TDecl['fields'];
type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

/** Columns a create's client members write. */
type ClientColumn<TDecl extends Declaration> =
  | {
      [K in keyof Fields<TDecl>]: Fields<TDecl>[K]['access'] extends Creatable
        ? K
        : never;
    }[keyof Fields<TDecl>]
  | {
      [K in keyof Relationships<TDecl>]: MemberOf<
        Relationships<TDecl>[K],
        'access'
      > extends 'readWrite' | 'immutable'
        ? K
        : never;
    }[keyof Relationships<TDecl>];

type ScopeColumnOf<TContext extends DeclareContext, TDecl extends Declaration> =
  MemberOf<TDecl, 'scope'> extends infer TScope extends keyof TContext['scopes']
    ? TContext['scopes'][TScope]['column']
    : never;

type ClientIdColumn<TTableDef extends PublicTable, TDecl extends Declaration> =
  MemberOf<TDecl, 'clientIds'> extends true
    ? TTableDef['primaryKey'] extends readonly [infer TKey extends string]
      ? TKey
      : never
    : never;

type ServerColumn<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = {
  [K in keyof TTableDef['columns'] & string]: K extends
    | ClientColumn<TDecl>
    | ScopeColumnOf<TContext, TDecl>
    | ClientIdColumn<TTableDef, TDecl>
    ? never
    : IsRequired<TContext['catalog'], TTableDef, K> extends true
      ? K
      : never;
}[keyof TTableDef['columns'] & string];

type ServerValues<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = {
  readonly [K in ServerColumn<TContext, TTableDef, TDecl>]: ColumnValue<
    TContext['catalog'],
    TTableDef['columns'][K],
    ColumnRules<TTableDef, K>
  >;
};

/** What `values` returns for a resource: each server value by column, in its wire form. */
export type ServerValuesOf<TResource extends AnyDeclaredResource> =
  TResource extends {
    readonly table: infer TTable extends string;
    readonly declaration: infer TDecl extends Declaration;
    readonly '~context'?: infer TContext;
  }
    ? string extends TTable
      ? Readonly<Record<string, unknown>>
      : NonNullable<TContext> extends infer TDefined extends DeclareContext
        ? ServerValues<TDefined, TableDefOf<TDefined, TTable>, TDecl>
        : Readonly<Record<string, unknown>>
    : never;

/** Whether a create of the resource needs server values; false for a resource whose table TypeScript does not know. */
export type HasServerValues<TResource extends AnyDeclaredResource> =
  string extends keyof ServerValuesOf<TResource>
    ? false
    : [keyof ServerValuesOf<TResource>] extends [never]
      ? false
      : 'create' extends TResource['declaration']['operations'][number]
        ? true
        : false;

/** The columns a create of the resource leaves to the server, in column order; none without `create`. */
export function serverValueColumns(
  internals: DeclaredInternals,
): ReadonlyArray<string> {
  const { resource, catalog, scopeColumn } = internals;
  const tableDef = ownValue(catalog.tables, resource.table);
  const { declaration } = resource;
  if (tableDef === undefined || !declaration.operations.includes('create')) {
    return [];
  }
  const covered = new Set(writtenColumns(declaration));
  if (scopeColumn !== undefined) {
    covered.add(scopeColumn);
  }
  const id = primaryKeyColumn(tableDef);
  if (declaration.clientIds === true && id !== undefined) {
    covered.add(id);
  }
  return Object.keys(tableDef.columns).filter(
    (column) =>
      !covered.has(column) && isRequiredOnInsert(catalog, tableDef, column),
  );
}
