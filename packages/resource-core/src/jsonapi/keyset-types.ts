/**
 * A member's keyset type in types (SPEC 11.2), the twin of `keysetTypeOf`
 * in `keyset-type.ts`: its column's type followed through its domains, an
 * enum or a text type with an `enum` rule as `enum`, and an array of a
 * scalar as `array`. A type without one gives the reason the messages
 * print instead. As in `ColumnValue`, rules are read by their presence,
 * where the runtime intersects their values, so only the runtime refuses
 * a text column whose rules leave no value.
 *
 * The work is keyed by what columns share: `ResolvedKeysetType` by the
 * resolved type, which every plain `text` column has in common, and
 * `EnumRuleColumns` by the table; TypeScript caches an alias by its
 * arguments, so a column costs a lookup (package README, performance
 * notes).
 * @packageDocumentation
 */
import type { PublicCatalog, PublicTable } from '@nizam-os/catalog-core';
import type { FieldType } from '@nizam-os/keyset-core';

import type { ResolveColumnType } from '../catalog/resolve-type';
import type { DomainEnumValues } from '../schema/value-types';

/** The keyset type of each base type of SPEC 5.1 but `json` and `jsonb`. */
interface BaseKeysetTypes {
  readonly text: 'text';
  readonly varchar: 'text';
  readonly bpchar: 'text';
  readonly citext: 'text';
  readonly int2: 'integer';
  readonly int4: 'integer';
  readonly int8: 'bigint';
  readonly numeric: 'decimal';
  readonly float4: 'float';
  readonly float8: 'float';
  readonly bool: 'boolean';
  readonly uuid: 'uuid';
  readonly date: 'date';
  readonly timestamp: 'timestamp';
  readonly timestamptz: 'timestamptz';
}

type BaseKeysetType<TType extends string> = TType extends keyof BaseKeysetTypes
  ? BaseKeysetTypes[TType]
  : TType extends `${string}.citext`
    ? 'text'
    : `type ${TType}`;

type EnumKeysetType<
  TCatalog extends PublicCatalog,
  TType extends string,
> = TType extends keyof TCatalog['enums']
  ? TCatalog['enums'][TType] extends readonly []
    ? 'an enum without values'
    : 'enum'
  : 'enum';

/** The columns with an `enum` rule among the enforced CHECKs over exactly them; computed once per table. */
type EnumRuleColumns<TTableDef extends PublicTable> = {
  [K in keyof TTableDef['constraints']]: TTableDef['constraints'][K] extends {
    readonly kind: 'check';
    readonly columns: readonly [infer TColumn extends string];
    readonly rule: { readonly kind: 'enum' };
    readonly enforced: true;
  }
    ? TColumn
    : never;
}[keyof TTableDef['constraints']];

type ScalarKeysetType<
  TCatalog extends PublicCatalog,
  TType extends string,
  TKind,
  TDomains extends ReadonlyArray<string>,
> = TKind extends 'enum'
  ? EnumKeysetType<TCatalog, TType>
  : BaseKeysetType<TType> extends 'text'
    ? [DomainEnumValues<TCatalog, TDomains>] extends [never]
      ? 'text'
      : 'enum'
    : BaseKeysetType<TType>;

/** A keyset type an array's element may have: a scalar other than `enum`. */
type ElementKeysetType = Exclude<FieldType, 'enum' | 'array'>;

/** The keyset type of a resolved type, before the column's own rules. */
type ResolvedKeysetType<
  TCatalog extends PublicCatalog,
  TResolved,
> = TResolved extends {
  readonly type: infer TType extends string;
  readonly typeKind: infer TKind;
  readonly depth: infer TDepth;
  readonly domains: infer TDomains extends ReadonlyArray<string>;
}
  ? TDepth extends 0
    ? ScalarKeysetType<TCatalog, TType, TKind, TDomains>
    : ScalarKeysetType<
          TCatalog,
          TType,
          TKind,
          TDomains
        > extends ElementKeysetType
      ? 'array'
      : 'an array of enum values'
  : never;

/** A scalar text column's own `enum` rule makes it an enum; an array's elements take no column rule. */
type WithColumnRule<
  TKeyset,
  TTableDef extends PublicTable,
  TColumn,
> = TKeyset extends 'text'
  ? TColumn extends EnumRuleColumns<TTableDef>
    ? 'enum'
    : 'text'
  : TKeyset;

/**
 * A member's keyset type, or why it has none: `type json` or `type jsonb`,
 * `an array of enum values`, or `an enum without values`.
 */
export type KeysetTypeOf<
  TCatalog extends PublicCatalog,
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
> = WithColumnRule<
  ResolvedKeysetType<
    TCatalog,
    ResolveColumnType<TCatalog, TTableDef['columns'][TColumn]>
  >,
  TTableDef,
  TColumn
>;
