import type { $ZodType, output } from 'zod/v4/core';

/**
 * The TypeScript type of each wire form (SPEC 5.1, 6.1), the type-level
 * twin of `value-form.ts` and `value-spec.ts`: a column's type followed
 * through its domains, an enum's labels, an `enum` rule's values in place
 * of `string`, an array of the element's type, and a codec's output.
 * @packageDocumentation
 */
import type { PublicCatalog, PublicTable } from '@nizam-os/catalog-core';

import type { ResolveColumnType, TypedRecord } from '../catalog/resolve-type';

/** A JSON value; inside a `json` or `jsonb` value, `null` is the JSON value. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | { [key: string]: JsonValue };

/** What a `json` or `jsonb` member holds: any JSON value but `null`, which is SQL NULL there. */
export type JsonData = Exclude<JsonValue, null>;

/** The type of each base type's wire form. */
interface WireValues {
  readonly text: string;
  readonly varchar: string;
  readonly bpchar: string;
  readonly citext: string;
  readonly int2: number;
  readonly int4: number;
  readonly float4: number;
  readonly float8: number;
  readonly int8: string;
  readonly numeric: string;
  readonly bool: boolean;
  readonly uuid: string;
  readonly date: string;
  readonly timestamp: string;
  readonly timestamptz: string;
  readonly json: JsonData;
  readonly jsonb: JsonData;
}

type BaseValue<TType extends string> = TType extends keyof WireValues
  ? WireValues[TType]
  : TType extends `${string}.citext`
    ? string
    : unknown;

/** The values of the `enum` rules of the domains passed, `never` when none has one. */
export type DomainEnumValues<
  TCatalog extends PublicCatalog,
  TDomains extends ReadonlyArray<string>,
> = {
  [I in keyof TDomains]: TDomains[I] extends keyof TCatalog['domains']
    ? {
        [
          K in keyof TCatalog['domains'][TDomains[I]]['constraints']
        ]: TCatalog['domains'][TDomains[I]]['constraints'][K] extends {
          readonly rule: {
            readonly kind: 'enum';
            readonly values: ReadonlyArray<infer TValue extends string>;
          };
        }
          ? TValue
          : never;
      }[keyof TCatalog['domains'][TDomains[I]]['constraints']]
    : never;
}[number];

/**
 * The values of each column's `enum` rules, from the enforced CHECKs over
 * exactly that column; computed once per table, since TypeScript caches an
 * alias by its arguments.
 */
export type ColumnEnumValues<TTableDef extends PublicTable> = {
  [
    K in keyof TTableDef['constraints'] as TTableDef['constraints'][K] extends {
      readonly kind: 'check';
      readonly columns: readonly [string];
      readonly rule: { readonly kind: 'enum' };
      readonly enforced: true;
    }
      ? TTableDef['constraints'][K]['columns'][0]
      : never
  ]: TTableDef['constraints'][K] extends {
    readonly rule: {
      readonly values: ReadonlyArray<infer TValue extends string>;
    };
  }
    ? TValue
    : never;
};

/** A scalar's type: an enum's labels, the rules' values, or the base type's. */
type ScalarValue<
  TCatalog extends PublicCatalog,
  TType extends string,
  TKind,
  TRuleValues,
> = TKind extends 'enum'
  ? TType extends keyof TCatalog['enums']
    ? TCatalog['enums'][TType][number]
    : string
  : [TRuleValues] extends [never]
    ? BaseValue<TType>
    : TRuleValues;

/**
 * The type of a column's non-null value through its wire form: the
 * scalar's, or an array of it. `TColumnRules` are the values of the
 * column's own `enum` rules.
 */
export type ColumnValue<
  TCatalog extends PublicCatalog,
  TColumn extends TypedRecord,
  TColumnRules = never,
> =
  ResolveColumnType<TCatalog, TColumn> extends {
    readonly type: infer TType extends string;
    readonly typeKind: infer TKind;
    readonly depth: infer TDepth;
    readonly domains: infer TDomains extends ReadonlyArray<string>;
  }
    ? TDepth extends 0
      ? ScalarValue<
          TCatalog,
          TType,
          TKind,
          DomainEnumValues<TCatalog, TDomains> | TColumnRules
        >
      : Array<
          ScalarValue<
            TCatalog,
            TType,
            TKind,
            DomainEnumValues<TCatalog, TDomains>
          >
        >
    : unknown;

/** A scalar's options: an enum's labels, or the rules' values; `null` when any value of its type goes. */
type ScalarOptions<
  TCatalog extends PublicCatalog,
  TType extends string,
  TKind,
  TRuleValues,
> = TKind extends 'enum'
  ? ReadonlyArray<
      TType extends keyof TCatalog['enums']
        ? TCatalog['enums'][TType][number]
        : string
    >
  : [TRuleValues] extends [never]
    ? null
    : ReadonlyArray<TRuleValues>;

/**
 * The options of a column's value (SPEC 8), the type-level twin of
 * `ValueSpec.options`: a scalar's, or an array's elements' with `array`
 * set. As in `ColumnValue`, the rules' values are a union where the
 * runtime keeps their intersection, so the type admits every option the
 * runtime lists.
 */
export type ColumnOptions<
  TCatalog extends PublicCatalog,
  TColumn extends TypedRecord,
  TColumnRules = never,
> =
  ResolveColumnType<TCatalog, TColumn> extends {
    readonly type: infer TType extends string;
    readonly typeKind: infer TKind;
    readonly depth: infer TDepth;
    readonly domains: infer TDomains extends ReadonlyArray<string>;
  }
    ? TDepth extends 0
      ? {
          readonly array: false;
          readonly options: ScalarOptions<
            TCatalog,
            TType,
            TKind,
            DomainEnumValues<TCatalog, TDomains> | TColumnRules
          >;
        }
      : {
          readonly array: true;
          readonly options: ScalarOptions<
            TCatalog,
            TType,
            TKind,
            DomainEnumValues<TCatalog, TDomains>
          >;
        }
    : {
        readonly array: boolean;
        readonly options: ReadonlyArray<string> | null;
      };

/** A codec's value: its schema's output (SPEC 7.1). */
export type CodecValue<TCodec> = TCodec extends {
  readonly schema: infer TSchema extends $ZodType;
}
  ? output<TSchema>
  : unknown;
