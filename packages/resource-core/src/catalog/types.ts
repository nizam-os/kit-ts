/**
 * Type-level lookups into a public catalog (SPEC 3, ADR 0002). Every name a
 * declaration uses is a key of the catalog's literal type, so a wrong name
 * fails `tsc` where it is written.
 * @packageDocumentation
 */
import type { PublicCatalog, PublicTable } from '@nizam-os/catalog-core';

/** The catalog keys of the tables. */
export type TableName<TCatalog extends PublicCatalog> =
  keyof TCatalog['tables'] & string;

/** A table's column names. */
export type ColumnName<TTableDef extends PublicTable> =
  keyof TTableDef['columns'] & string;

/** A table's constraint names. */
export type ConstraintName<TTableDef extends PublicTable> =
  keyof TTableDef['constraints'] & string;

/** The column of a single-column primary key; `never` for none or several. */
export type PrimaryKeyColumn<TTableDef extends PublicTable> =
  TTableDef['primaryKey'] extends readonly [infer TColumn extends string]
    ? TColumn
    : never;

/** The column of each single-column foreign key. */
export type ForeignKeyColumn<TTableDef extends PublicTable> = {
  [K in keyof TTableDef['constraints']]: TTableDef['constraints'][K] extends {
    readonly kind: 'foreignKey';
    readonly columns: readonly [infer TColumn extends string];
  }
    ? TColumn
    : never;
}[keyof TTableDef['constraints']];

/** The table and column a foreign-key column's single-column foreign key references. */
export type ForeignKeyReference<
  TTableDef extends PublicTable,
  TColumn extends string,
> = {
  [K in keyof TTableDef['constraints']]: TTableDef['constraints'][K] extends {
    readonly kind: 'foreignKey';
    readonly columns: readonly [TColumn];
    readonly references: {
      readonly table: infer TTarget extends string;
      readonly columns: readonly [infer TTargetColumn extends string];
    };
  }
    ? { readonly table: TTarget; readonly column: TTargetColumn }
    : never;
}[keyof TTableDef['constraints']];

/** The `tsvector` columns, which only `search.column` may name (SPEC 3.7). */
export type SearchColumn<TTableDef extends PublicTable> = {
  [C in ColumnName<TTableDef>]: TTableDef['columns'][C] extends {
    readonly type: 'tsvector';
    readonly typeKind: 'base';
    readonly array: false;
  }
    ? C
    : never;
}[ColumnName<TTableDef>];

/**
 * The enforced CHECK constraints whose rule the recognizer could not read.
 * A NOT ENFORCED CHECK has no rule either, but the database never applies
 * it, so no validator covers it (catalog ADR 0010).
 */
export type UntranslatedCheck<TTableDef extends PublicTable> = {
  [K in ConstraintName<TTableDef>]: TTableDef['constraints'][K] extends {
    readonly kind: 'check';
    readonly rule: null;
    readonly enforced: true;
  }
    ? K
    : never;
}[ConstraintName<TTableDef>];

/** `<table>_<column>_not_null` for every NOT NULL column (SPEC 3.5). */
type NotNullKey<TTableDef extends PublicTable> = {
  [
    C in ColumnName<TTableDef>
  ]: TTableDef['columns'][C]['nullable'] extends false
    ? `${TTableDef['name']}_${C}_not_null`
    : never;
}[ColumnName<TTableDef>];

/** The keys `rules` accepts: constraint names and NOT NULL keys. */
export type RuleKey<TTableDef extends PublicTable> =
  | ConstraintName<TTableDef>
  | NotNullKey<TTableDef>;
