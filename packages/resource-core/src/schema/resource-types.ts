import type { z } from 'zod/v4';
import type { $strict } from 'zod/v4/core';

/**
 * The types of a declared resource's schemas (SPEC 6.2, 6.5): `Infer`, and
 * the typed `schema`, `linkage`, `validate`, and `write` members. Each type
 * is computed only where it is read, so declaring a resource costs nothing
 * here. Members are keyed by public name; an optional member is optional
 * (`?`) and, the parse never outputting `undefined`, never `undefined`.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type { DeclareContext } from '../declare/registries';
import type { Declaration, DeclaredMembers, MemberOf } from '../declare/types';
import type {
  FieldNameOf,
  RelationshipNameOf,
  TypeNameOf,
} from '../names/public-names';
import type { IsNullable, IsRequired } from './member-types';
import type { ResourceValidator } from './validate';
import type { CodecValue, ColumnEnumValues, ColumnValue } from './value-types';

type Readable = 'read' | 'readWrite' | 'immutable';
/** The accesses `create` takes (SPEC 3.1), the twin of `schemaHolds('create', access)`. */
export type Creatable = 'readWrite' | 'immutable' | 'write';
type Updatable = 'readWrite' | 'write';

type Fields<TDecl extends Declaration> = TDecl['fields'];
type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

/** A table's definition in the context's catalog. */
export type TableDefOf<
  TContext extends DeclareContext,
  TTable extends string,
> = TContext['catalog']['tables'][TTable] extends infer TTableDef extends
  PublicTable
  ? TTableDef
  : never;

type Simplify<TValue> = { [K in keyof TValue]: TValue[K] };

/** `null` when a member is nullable. */
export type NullWhen<TNullable> = TNullable extends true ? null : never;

/** The values of a column's own `enum` rules, `never` when it has none. */
export type ColumnRules<
  TTableDef extends PublicTable,
  TColumn,
> = TColumn extends keyof ColumnEnumValues<TTableDef>
  ? ColumnEnumValues<TTableDef>[TColumn]
  : never;

/** A declaration key as a column of the table. */
export type ColumnOf<TTableDef extends PublicTable, TKey> = TKey &
  keyof TTableDef['columns'] &
  string;

/** A field's output: its value through the wire form or codec, and `null` when it is nullable. */
export type FieldOut<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TColumn extends string,
  TField,
> =
  | (MemberOf<TField, 'codec'> extends infer TCodec extends string
      ? CodecValue<TContext['codecs'][TCodec]>
      : ColumnValue<
          TContext['catalog'],
          TTableDef['columns'][TColumn],
          ColumnRules<TTableDef, TColumn>
        >)
  | NullWhen<IsNullable<TContext['catalog'], TTableDef, TColumn>>;

/** The public type of a relationship's target, read from its declared resource's type. */
export type TargetType<TRelationship> = TRelationship extends {
  readonly target: () => infer TTarget;
}
  ? TTarget extends {
      readonly table: infer TTable extends string;
      readonly declaration: infer TDecl extends Declaration;
      readonly '~context'?: infer TContext;
    }
    ? NonNullable<TContext> extends infer TDefined extends DeclareContext
      ? TypeNameOf<TableDefOf<TDefined, TTable>, TDecl>
      : string
    : string
  : string;

/** A relationship's linkage: a resource identifier, and `null` when its column is nullable. */
type LinkageOut<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TColumn extends string,
  TRelationship,
> =
  | { type: TargetType<TRelationship>; id: string }
  | NullWhen<IsNullable<TContext['catalog'], TTableDef, TColumn>>;

type AttributesOf<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TAccess,
  TRequired,
> = {
  -readonly [
    K in keyof Fields<TDecl> as Fields<TDecl>[K]['access'] extends TAccess
      ? IsRequired<
          TContext['catalog'],
          TTableDef,
          ColumnOf<TTableDef, K>
        > extends TRequired
        ? FieldNameOf<K & string, Fields<TDecl>[K]>
        : never
      : never
  ]: FieldOut<TContext, TTableDef, ColumnOf<TTableDef, K>, Fields<TDecl>[K]>;
};

type LinkagesOf<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TAccess,
  TRequired,
> = {
  -readonly [
    K in keyof Relationships<TDecl> as MemberOf<
      Relationships<TDecl>[K],
      'access'
    > extends TAccess
      ? IsRequired<
          TContext['catalog'],
          TTableDef,
          ColumnOf<TTableDef, K>
        > extends TRequired
        ? RelationshipNameOf<K & string, Relationships<TDecl>[K]>
        : never
      : never
  ]: LinkageOut<
    TContext,
    TTableDef,
    ColumnOf<TTableDef, K>,
    Relationships<TDecl>[K]
  >;
};

/** A create object: the required members, and the others optional. */
type CreateOf<TRequired, TOptional> = Simplify<TRequired & Partial<TOptional>>;

/** The output types of a declared resource's schemas (SPEC 6.2). */
interface ResourceTypes<TRead, TCreate, TUpdate, TLinkage> {
  readonly read: TRead;
  readonly create: TCreate;
  readonly update: TUpdate;
  readonly linkage: TLinkage;
}

/** The three linkage objects. */
interface LinkageTypes<TRead, TCreate, TUpdate> {
  readonly read: TRead;
  readonly create: TCreate;
  readonly update: TUpdate;
}

/** The output types of the schemas of the resource `TDecl` declares over `TTable`. */
export type TypesOf<
  TContext extends DeclareContext,
  TTable extends string,
  TDecl extends Declaration,
> = ResourceTypesOf<TContext, TableDefOf<TContext, TTable>, TDecl>;

type ResourceTypesOf<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = ResourceTypes<
  Simplify<AttributesOf<TContext, TTableDef, TDecl, Readable, boolean>>,
  CreateOf<
    AttributesOf<TContext, TTableDef, TDecl, Creatable, true>,
    AttributesOf<TContext, TTableDef, TDecl, Creatable, false>
  >,
  Simplify<
    Partial<AttributesOf<TContext, TTableDef, TDecl, Updatable, boolean>>
  >,
  LinkageTypes<
    Simplify<LinkagesOf<TContext, TTableDef, TDecl, Readable, boolean>>,
    CreateOf<
      LinkagesOf<TContext, TTableDef, TDecl, Creatable, true>,
      LinkagesOf<TContext, TTableDef, TDecl, Creatable, false>
    >,
    Simplify<
      Partial<LinkagesOf<TContext, TTableDef, TDecl, Updatable, boolean>>
    >
  >
>;

/** Whether a member of `TValue` is optional. */
type IsOptional<TValue, K extends keyof TValue> =
  Pick<TValue, K> extends Required<Pick<TValue, K>> ? false : true;

/** A Zod shape whose parse outputs `TValue`: an optional member as `.optional()`. */
type ShapeOf<TValue> = {
  [K in keyof TValue]-?: IsOptional<TValue, K> extends true
    ? z.ZodOptional<z.ZodType<Exclude<TValue[K], undefined>>>
    : z.ZodType<TValue[K]>;
};

/** What a schema of output `TValue` takes: an optional member may also be `undefined`. */
export type InputOf<TValue> = {
  [K in keyof TValue]: IsOptional<TValue, K> extends true
    ? TValue[K] | undefined
    : TValue[K];
};

/** Typed object schemas: `read` strips unknown keys, `create` and `update` reject them. */
export interface TypedObjectSchemas<TRead, TCreate, TUpdate> {
  readonly read: z.ZodObject<ShapeOf<TRead>>;
  readonly create: z.ZodObject<ShapeOf<TCreate>, $strict>;
  readonly update: z.ZodObject<ShapeOf<TUpdate>, $strict>;
}

/** Typed attribute schemas, and the schema of an id (SPEC 3.4). */
export interface TypedAttributeSchemas<
  TRead,
  TCreate,
  TUpdate,
> extends TypedObjectSchemas<TRead, TCreate, TUpdate> {
  readonly id: z.ZodType<string>;
}

/** Typed Standard Schema validators of create and update, and of an id. */
export interface TypedValidators<TCreate, TUpdate> {
  readonly create: ResourceValidator<InputOf<TCreate>, TCreate>;
  readonly update: ResourceValidator<InputOf<TUpdate>, TUpdate>;
  readonly id: ResourceValidator<string>;
}

/** A write's two parts. */
interface WriteOf<TAttributes, TRelationships> {
  readonly attributes: TAttributes;
  readonly relationships: TRelationships;
}

/** Typed write validators. */
export interface TypedWrite<
  TTypes extends ResourceTypes<
    unknown,
    unknown,
    unknown,
    LinkageTypes<unknown, unknown, unknown>
  >,
> {
  readonly create: ResourceValidator<
    WriteOf<InputOf<TTypes['create']>, InputOf<TTypes['linkage']['create']>>,
    WriteOf<TTypes['create'], TTypes['linkage']['create']>
  >;
  readonly update: ResourceValidator<
    WriteOf<InputOf<TTypes['update']>, InputOf<TTypes['linkage']['update']>>,
    WriteOf<TTypes['update'], TTypes['linkage']['update']>
  >;
}
