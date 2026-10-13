import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * The definition types of `createDefineKeyset(schema)` (SPEC 14.1): the
 * core's, with every table and column name checked against the type of
 * the application's Drizzle schema object. A table is the key of a member
 * that is a PostgreSQL table; a column is a property of its table's
 * columns, named as the application's code names it. A column whose
 * selected type includes `null` must be declared `nullable: true`: the
 * seek trusts a field's nullability (keyset ADR 0016), so a nullable
 * column declared otherwise would have its pages skip every row whose
 * value is null.
 * @ref https://orm.drizzle.team/docs/goodies#type-api ($inferSelect)
 * @packageDocumentation
 */
import type {
  AggregateFieldInit,
  ColumnFieldInit,
  CursorInit,
  PageInit,
  SortInit,
  TextSearchMode,
} from '@nizam-os/keyset-core';

/** The keys of the schema's members that are PostgreSQL tables. */
export type TablesOf<TSchema> = {
  [TKey in keyof TSchema & string]: TSchema[TKey] extends PgTable
    ? TKey
    : never;
}[keyof TSchema & string];

/** A table's columns, by property name: what `db.select().from(table)` selects. */
export type ColumnsOf<
  TSchema,
  TTable extends keyof TSchema,
> = TSchema[TTable] extends PgTable ? TSchema[TTable]['_']['columns'] : never;

type ColumnNameOf<TSchema, TTable extends keyof TSchema> = keyof ColumnsOf<
  TSchema,
  TTable
> &
  string;

/** A column's value in the table's selected row. */
type ValueOf<
  TSchema,
  TTable extends keyof TSchema,
  TColumn extends string,
> = TSchema[TTable] extends PgTable
  ? TColumn extends keyof TSchema[TTable]['$inferSelect']
    ? TSchema[TTable]['$inferSelect'][TColumn]
    : never
  : never;

/** A column field over one of the table's columns, `nullable: true` when the column is. */
export type TypedColumnFieldInit<TSchema, TTable extends keyof TSchema> = {
  readonly [TColumn in ColumnNameOf<TSchema, TTable>]: ColumnFieldInit & {
    readonly column: TColumn;
  } & (null extends ValueOf<TSchema, TTable, TColumn>
      ? { readonly nullable: true }
      : unknown);
}[ColumnNameOf<TSchema, TTable>];

/** A relation to one of the schema's tables, joined on its columns. */
export interface TypedRelationInit<
  TSchema,
  TTable extends keyof TSchema,
  TRelated extends TablesOf<TSchema>,
> {
  readonly table: TRelated;
  /** Each key a column of the related table, its value a column of the main table. */
  readonly on: {
    readonly [TColumn in ColumnNameOf<TSchema, TRelated>]?: ColumnNameOf<
      TSchema,
      TTable
    >;
  };
  readonly fields?:
    | Readonly<Record<string, TypedColumnFieldInit<TSchema, TRelated>>>
    | undefined;
}

export type TypedRelationsInit<
  TSchema,
  TTable extends keyof TSchema,
> = Readonly<
  Record<
    string,
    {
      [TRelated in TablesOf<TSchema>]: TypedRelationInit<
        TSchema,
        TTable,
        TRelated
      >;
    }[TablesOf<TSchema>]
  >
>;

/** What `RelationsOf` reads of a typed relation. */
interface RelationShape {
  readonly table: string;
  readonly fields?: Readonly<Record<string, ColumnFieldInit>> | undefined;
}

/** The typed relations as the core sees them: `on` is a plain name map. */
export type RelationsOf<
  TRelations extends Readonly<Record<string, RelationShape>>,
> = {
  readonly [TName in keyof TRelations]: {
    readonly table: TRelations[TName]['table'];
    readonly on: Readonly<Record<string, string>>;
    readonly fields: TRelations[TName]['fields'];
  };
};

/** An aggregate over a declared relation, of a column of that relation's table. */
export type TypedAggregateFieldInit<
  TSchema,
  TRelations extends Readonly<
    Record<string, { readonly table: keyof TSchema }>
  >,
> = AggregateFieldInit & {
  readonly aggregate: {
    [TName in keyof TRelations & string]: {
      readonly relation: TName;
      readonly column?:
        | ColumnNameOf<TSchema, TRelations[TName]['table']>
        | undefined;
    };
  }[keyof TRelations & string];
};

export type TypedFieldsInit<
  TSchema,
  TTable extends keyof TSchema,
  TRelations extends Readonly<
    Record<string, { readonly table: keyof TSchema }>
  >,
> = Readonly<
  Record<
    string,
    | TypedColumnFieldInit<TSchema, TTable>
    | TypedAggregateFieldInit<TSchema, TRelations>
  >
>;

export type TypedSearchInit<TSchema, TTable extends keyof TSchema> =
  | {
      readonly mode: 'like';
      readonly columns: ReadonlyArray<ColumnNameOf<TSchema, TTable>>;
    }
  | {
      readonly mode?: TextSearchMode | undefined;
      readonly columns: ReadonlyArray<ColumnNameOf<TSchema, TTable>>;
      readonly vector?: undefined;
      readonly config?: string | undefined;
    }
  | {
      readonly mode?: TextSearchMode | undefined;
      readonly columns?: undefined;
      readonly vector: ColumnNameOf<TSchema, TTable>;
      readonly config?: string | undefined;
    };

export interface TypedKeysetInit<
  TSchema,
  TTable extends TablesOf<TSchema>,
  TFields extends TypedFieldsInit<TSchema, TTable, TRelations>,
  TRelations extends TypedRelationsInit<TSchema, TTable>,
> {
  readonly table: TTable;
  readonly key: ReadonlyArray<keyof TFields & string>;
  readonly fields: TFields;
  readonly relations?: TRelations | undefined;
  readonly search?: TypedSearchInit<TSchema, TTable> | undefined;
  readonly sort?: SortInit<keyof TFields & string> | undefined;
  readonly page?: PageInit | undefined;
  readonly cursor: CursorInit;
}

/**
 * A typed definition for a definer whose defaults carry a cursor (SPEC
 * 14.1): its own `cursor` is optional, and the members it sets replace the
 * default's.
 */
export interface DefaultedTypedKeysetInit<
  TSchema,
  TTable extends TablesOf<TSchema>,
  TFields extends TypedFieldsInit<TSchema, TTable, TRelations>,
  TRelations extends TypedRelationsInit<TSchema, TTable>,
> extends Omit<
  TypedKeysetInit<TSchema, TTable, TFields, TRelations>,
  'cursor'
> {
  readonly cursor?: Partial<CursorInit> | undefined;
}
