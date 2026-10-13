/**
 * The registry check TypeScript makes where a list of resources is
 * assembled (SPEC 3.8, 4.2): each relationship's target is a resource of
 * the table its foreign key references, and is listed. A declaration types
 * `target` as `() => void`, so declarations may reference each other in
 * either order; by the time a list is assembled, every one exists. The
 * check is reported at the listed resource as a `Requirement` whose key is
 * the runtime's message; the other registry checks are the runtime's.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type { ForeignKeyReference } from '../catalog/types';
import type { DeclareContext } from '../declare/registries';
import type { Requirement } from '../declare/requirement';
import type { Declaration, DeclaredMembers } from '../declare/types';
import type { RelationshipNameOf, TypeNameOf } from '../names/public-names';

type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

/** What a declared resource's type records: its table, declaration, and definer context. */
interface Recorded<
  TContext extends DeclareContext,
  TTable extends string,
  TDecl extends Declaration,
> {
  readonly context: TContext;
  readonly table: TTable;
  readonly tableDef: TContext['catalog']['tables'][TTable];
  readonly declaration: TDecl;
}

/** The record of a resource whose table TypeScript knows, or `never`. */
type RecordOf<TResource> = TResource extends {
  readonly table: infer TTable extends string;
  readonly declaration: infer TDecl extends Declaration;
  readonly '~context'?: infer TContext;
}
  ? string extends TTable
    ? never
    : NonNullable<TContext> extends infer TDefined extends DeclareContext
      ? Recorded<TDefined, TTable, TDecl>
      : never
  : never;

type TypeOf<TRecord extends Recorded<DeclareContext, string, Declaration>> =
  TRecord['tableDef'] extends infer TTableDef extends PublicTable
    ? TypeNameOf<TTableDef, TRecord['declaration']>
    : never;

/** The message for a relationship whose target fails, or `never`. */
type TargetError<
  TRecord extends Recorded<DeclareContext, string, Declaration>,
  TColumn extends string,
  TRelationship,
  TListed,
> = TRelationship extends { readonly target: () => infer TTarget }
  ? RecordOf<TTarget> extends infer TTargetRecord extends Recorded<
      DeclareContext,
      string,
      Declaration
    >
    ? TRecord['tableDef'] extends infer TTableDef extends PublicTable
      ? TTargetRecord['table'] extends ForeignKeyReference<
          TTableDef,
          TColumn
        >['table']
        ? TTarget extends TListed
          ? never
          : `relationship ${TypeOf<TRecord>}.${RelationshipNameOf<
              TColumn,
              TRelationship
            >} targets ${TypeOf<TTargetRecord>}, which is not listed`
        : `${TRecord['table']}.relationships.${TColumn}.target: the target is a resource of ${TTargetRecord['table']}; the foreign key references ${ForeignKeyReference<
            TTableDef,
            TColumn
          >['table']}`
      : never
    : never
  : never;

/** Every failing relationship's message for one listed resource. */
type TargetErrors<TResource, TListed> =
  RecordOf<TResource> extends infer TRecord extends Recorded<
    DeclareContext,
    string,
    Declaration
  >
    ? {
        [
          K in keyof Relationships<TRecord['declaration']> & string
        ]: TargetError<
          TRecord,
          K,
          Relationships<TRecord['declaration']>[K],
          TListed
        >;
      }[keyof Relationships<TRecord['declaration']> & string]
    : never;

/** `resources` held to SPEC 3.8: a `Requirement` at each listed resource with a failing target, `unknown` elsewhere. */
export type RegistryCheck<TResources extends ReadonlyArray<unknown>> = {
  readonly [I in keyof TResources]: [
    TargetErrors<TResources[I], TResources[number]>,
  ] extends [never]
    ? unknown
    : Requirement<TargetErrors<TResources[I], TResources[number]>>;
};
