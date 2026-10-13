/**
 * The type-level check of a whole declaration (SPEC 3): `declareResource`
 * takes `TDecl & DeclarationCheck<...>`, so TypeScript infers the literal
 * declaration and then holds it against what the catalog allows, reporting
 * each mistake as a requirement named by its message (`requirement.ts`).
 * Nothing here reads a relationship's target (SPEC 3.8). The runtime twins
 * are `check-shape.ts` and `check-options.ts`; fields and relationships are
 * in `fields-check.ts` and `relationships-check.ts`, rules in
 * `rules-check.ts`, and the derived names and codes in
 * `names/names-check.ts` and `names/codes-check.ts`.
 * @packageDocumentation
 */
import type {
  PublicCatalog,
  PublicColumn,
  PublicTable,
} from '@nizam-os/catalog-core';
import type { FieldType } from '@nizam-os/keyset-core';

import type {
  CodecTypeName,
  IsIdentifierColumn,
} from '../catalog/resolve-type';
import type { ColumnName, PrimaryKeyColumn, TableName } from '../catalog/types';
import type { KeysetTypeOf } from '../jsonapi/keyset-types';
import type { CodesCheck } from '../names/codes-check';
import type { KeysetNamesCheck } from '../names/keyset-names-check';
import type { NamesCheck } from '../names/names-check';
import type { OperationOf } from './access-check';
import type { FieldsCheck } from './fields-check';
import type { HasRepeat } from './lists';
import type { DeclareContext } from './registries';
import type { RelationshipsCheck } from './relationships-check';
import type {
  AtMember,
  KnownMembers,
  Requirement,
  RequireWhen,
} from './requirement';
import type { RulesCheck } from './rules-check';
import type { SearchCheck, SortCheck } from './search-sort-check';
import type { Declaration, DeclaredMembers, MemberOf } from './types';

type Fields<TDecl extends Declaration> = TDecl['fields'];
type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

/** Members an update can write. */
type UpdatableMember<TDecl extends Declaration> =
  | {
      [K in keyof Fields<TDecl>]: Fields<TDecl>[K]['access'] extends
        | 'readWrite'
        | 'write'
        ? K
        : never;
    }[keyof Fields<TDecl>]
  | {
      [K in keyof Relationships<TDecl>]: MemberOf<
        Relationships<TDecl>[K],
        'access'
      > extends 'readWrite'
        ? K
        : never;
    }[keyof Relationships<TDecl>];

/**
 * A literal list of operations, checked; a list typed only as
 * `Operation[]` (a variable, or a declaration TypeScript could not infer)
 * says nothing at compile time, and the runtime check covers it.
 */
type OperationsCheck<TDecl extends Declaration> =
  number extends TDecl['operations']['length']
    ? unknown
    : TDecl['operations'] extends readonly []
      ? Requirement<'operations: list at least one operation'>
      : HasRepeat<TDecl['operations']> extends true
        ? Requirement<'operations: an operation is listed twice'>
        : 'update' extends OperationOf<TDecl>
          ? RequireWhen<
              [UpdatableMember<TDecl>] extends [never] ? true : false,
              'operations: update needs a field or relationship writable on update'
            >
          : unknown;

/** The column of the declaration's scope, if it names one the definer has. */
export type ScopeColumnOf<
  TContext extends DeclareContext,
  TDecl extends Declaration,
> = TDecl['scope'] extends keyof TContext['scopes']
  ? TContext['scopes'][TDecl['scope']]['column']
  : never;

type ScopeCheck<
  TContext extends DeclareContext,
  TTable extends string,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = TDecl['scope'] extends string
  ? TDecl['scope'] extends keyof TContext['scopes']
    ? RequireWhen<
        ScopeColumnOf<TContext, TDecl> extends ColumnName<TTableDef>
          ? false
          : true,
        `scope: scope ${TDecl['scope']} names column ${ScopeColumnOf<TContext, TDecl>}, which ${TTable} does not have`
      >
    : Requirement<`scope: "${TDecl['scope']}" is not a scope of createDeclareResource`>
  : unknown;

/** Why the primary key takes no client value (SPEC 3.4), or `never`. */
type ClientIdError<TColumn extends PublicColumn> =
  TColumn['generated'] extends null
    ? TColumn['identity'] extends 'always'
      ? 'the primary key is an identity column generated always, which takes no client value'
      : never
    : 'the primary key is a generated column, which takes no client value';

/**
 * `clientIds: true` needs a primary key PostgreSQL accepts a value for.
 * @ref https://www.postgresql.org/docs/18/sql-createtable.html#SQL-CREATETABLE-PARMS-GENERATED-IDENTITY
 */
type ClientIdsCheck<TTableDef extends PublicTable, TClientIds> = [
  PrimaryKeyColumn<TTableDef>,
] extends [never]
  ? unknown
  : TClientIds extends true
    ? [
        ClientIdError<TTableDef['columns'][PrimaryKeyColumn<TTableDef>]>,
      ] extends [never]
      ? unknown
      : Requirement<`clientIds: ${ClientIdError<TTableDef['columns'][PrimaryKeyColumn<TTableDef>]>}`>
    : unknown;

/** Why keyset-core cannot order pages by the primary key `TKey` (SPEC 11.2), or `never`. */
type KeyOrderError<
  TCatalog extends PublicCatalog,
  TTable extends string,
  TTableDef extends PublicTable,
  TKey extends keyof TTableDef['columns'] & string,
> =
  KeysetTypeOf<TCatalog, TTableDef, TKey> extends FieldType
    ? never
    : `${TTable}: the primary key is ${KeysetTypeOf<TCatalog, TTableDef, TKey> & string}, which @nizam-os/keyset-core cannot order`;

/** Why `TTableDef`'s primary key cannot be a resource id (SPEC 3.4, 11.2), or `never`. */
type IdentityError<
  TCatalog extends PublicCatalog,
  TTable extends string,
  TTableDef extends PublicTable,
> = [PrimaryKeyColumn<TTableDef>] extends [never]
  ? `${TTable}: a resource needs a single-column primary key`
  : IsIdentifierColumn<
        TCatalog,
        TTableDef['columns'][PrimaryKeyColumn<TTableDef>]
      > extends true
    ? PrimaryKeyColumn<TTableDef> extends infer TKey extends
        keyof TTableDef['columns'] & string
      ? KeyOrderError<TCatalog, TTable, TTableDef, TKey>
      : never
    : `${TTable}: the primary key's type ${CodecTypeName<TTableDef['columns'][PrimaryKeyColumn<TTableDef>]>} cannot carry a resource id`;

/** Checked on the `table` argument: a resource needs a single-column primary key that can carry an id (SPEC 3.4). */
export type IdentityCheck<
  TContext extends DeclareContext,
  TTable extends TableName<TContext['catalog']>,
> = [
  IdentityError<
    TContext['catalog'],
    TTable,
    TContext['catalog']['tables'][TTable]
  >,
] extends [never]
  ? unknown
  : Requirement<
      IdentityError<
        TContext['catalog'],
        TTable,
        TContext['catalog']['tables'][TTable]
      >
    >;

type DeclarationMember = keyof Declaration;

type DeclarationCheckOf<
  TContext extends DeclareContext,
  TTable extends string,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
> = KnownMembers<TDecl, DeclarationMember, 'a declaration'> &
  AtMember<'operations', OperationsCheck<TDecl>> &
  AtMember<
    'clientIds',
    ClientIdsCheck<TTableDef, MemberOf<TDecl, 'clientIds'>>
  > &
  AtMember<'scope', ScopeCheck<TContext, TTable, TTableDef, TDecl>> &
  AtMember<'search', SearchCheck<TTable, TTableDef, TDecl['search']>> &
  AtMember<'sort', SortCheck<TDecl>> &
  RulesCheck<TContext, TTable, TTableDef, TDecl> &
  NamesCheck<TTableDef, TDecl> &
  KeysetNamesCheck<TTableDef, TDecl> &
  CodesCheck<TTableDef, TDecl, TScopeColumn> & {
    readonly fields: FieldsCheck<
      TContext,
      TTable,
      TTableDef,
      TDecl,
      TScopeColumn
    >;
  } & (TDecl['relationships'] extends object
    ? {
        readonly relationships: RelationshipsCheck<
          TContext,
          TTable,
          TTableDef,
          TDecl,
          TScopeColumn
        >;
      }
    : unknown);

/** What `table` requires of a declaration under the definer's context. */
export type DeclarationCheck<
  TContext extends DeclareContext,
  TTable extends TableName<TContext['catalog']>,
  TDecl extends Declaration,
> = DeclarationCheckOf<
  TContext,
  TTable,
  TContext['catalog']['tables'][TTable],
  TDecl,
  ScopeColumnOf<TContext, TDecl>
>;
