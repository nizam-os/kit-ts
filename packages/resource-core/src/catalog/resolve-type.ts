/**
 * A column's type followed through its domains to the base type, as a type
 * (SPEC 5.1). `resolveColumnType` in `columns.ts` is its runtime twin, and
 * `resolve-type.test-d.ts` pins both to the same cases.
 * @packageDocumentation
 */
import type {
  PublicCatalog,
  PublicColumn,
  TypeKind,
} from '@nizam-os/catalog-core';

import type { WireTypeName } from '../wire/types';

/** A type followed to its base: the base type, its array depth, and the domains passed. */
interface ResolvedTypeOf<
  TType extends string = string,
  TKind extends TypeKind = TypeKind,
  TDepth extends number = number,
  TDomains extends ReadonlyArray<string> = ReadonlyArray<string>,
> {
  readonly type: TType;
  readonly typeKind: TKind;
  /** 0 for a scalar, 1 for an array; more is a nested array, which has no wire form. */
  readonly depth: TDepth;
  /** The domains from the column's own type down to the base, outermost first. */
  readonly domains: TDomains;
}

type Follow<
  TCatalog extends PublicCatalog,
  TType extends string,
  TKind extends TypeKind,
  TDepth extends ReadonlyArray<0>,
  TDomains extends ReadonlyArray<string>,
> = TKind extends 'domain'
  ? TType extends TDomains[number]
    ? never
    : TType extends keyof TCatalog['domains']
      ? Follow<
          TCatalog,
          TCatalog['domains'][TType]['type'],
          TCatalog['domains'][TType]['typeKind'],
          TCatalog['domains'][TType]['array'] extends true
            ? [...TDepth, 0]
            : TDepth,
          [...TDomains, TType]
        >
      : never
  : ResolvedTypeOf<TType, TKind, TDepth['length'], TDomains>;

/** The members of a column or a domain that name its type. */
export type TypedRecord = Pick<PublicColumn, 'type' | 'typeKind' | 'array'>;

/** A column's (or a domain's) type, followed through its domains; `never` for a dangling domain. */
export type ResolveColumnType<
  TCatalog extends PublicCatalog,
  TColumn extends TypedRecord,
> = Follow<
  TCatalog,
  TColumn['type'],
  TColumn['typeKind'],
  TColumn['array'] extends true ? [0] : [],
  []
>;

type WireCapable<TResolved> = TResolved extends {
  readonly typeKind: 'enum';
  readonly depth: 0 | 1;
}
  ? true
  : TResolved extends {
        readonly typeKind: 'base';
        readonly type: infer TType;
        readonly depth: infer TDepth;
      }
    ? TType extends WireTypeName
      ? TDepth extends 0
        ? true
        : TDepth extends 1
          ? TType extends 'json' | 'jsonb'
            ? false
            : true
          : false
      : false
    : false;

/** Whether a column has a wire form (SPEC 5.1), or needs a codec. */
export type HasWireForm<
  TCatalog extends PublicCatalog,
  TColumn extends PublicColumn,
> = WireCapable<ResolveColumnType<TCatalog, TColumn>>;

/**
 * Whether a column can carry a resource id, which is a string on the wire:
 * a scalar wire form other than JSON (SPEC 3.4). The twin of
 * `isIdentifierColumn`.
 */
export type IsIdentifierColumn<
  TCatalog extends PublicCatalog,
  TColumn extends PublicColumn,
> =
  ResolveColumnType<TCatalog, TColumn> extends {
    readonly depth: 0;
    readonly type: 'json' | 'jsonb';
  }
    ? false
    : ResolveColumnType<TCatalog, TColumn> extends { readonly depth: 0 }
      ? HasWireForm<TCatalog, TColumn>
      : false;

/** The type name a codec's `types` must hold for a column: its type, with `[]` for an array. */
export type CodecTypeName<TColumn extends PublicColumn> =
  `${TColumn['type']}${TColumn['array'] extends true ? '[]' : ''}`;
