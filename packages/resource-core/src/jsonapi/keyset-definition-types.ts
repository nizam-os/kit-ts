/**
 * A declared resource's keyset definition in types (SPEC 11.2): a
 * `DefaultedKeysetInit` whose fields are `id` and the public names of the
 * members that filter or sort, each saying whether it sorts. Those are the
 * two things keyset-core's request type reads (`KeysetRequestOf`), so a
 * keyset defined from it takes requests in the resource's own names; the
 * rest of each field is left as wide as `ColumnFieldInit`. It is spelled
 * out rather than written as `DefaultedKeysetInit<TFields>`: that type
 * reads `keyof TFields`, which makes TypeScript relate two of them
 * invariantly, so a typed resource would not be assignable to a wide one.
 * @packageDocumentation
 */
import type {
  ColumnFieldInit,
  SearchInit,
  SortInit,
} from '@nizam-os/keyset-core';

import type { Declaration } from '../declare/types';
import type { FilterNameOf, SortNameOf } from './query-name-types';

/** A derived field: a column field whose `sortable` is known. */
type KeysetField<TSortable extends boolean> = ColumnFieldInit & {
  readonly sortable: TSortable;
};

/** `id`, the key, and every member that filters or sorts, by public name. */
type KeysetFieldsOf<TDecl extends Declaration> = {
  readonly id: KeysetField<true>;
} & {
  readonly [K in SortNameOf<TDecl> | FilterNameOf<TDecl>]: KeysetField<
    K extends SortNameOf<TDecl> ? true : false
  >;
};

/** The keyset definition of the resource `TDecl` declares, assignable to `DefaultedKeysetInit<KeysetFieldsOf<TDecl>>`. */
export interface KeysetInitOf<TDecl extends Declaration> {
  readonly table: string;
  readonly key: readonly ['id'];
  readonly fields: KeysetFieldsOf<TDecl>;
  readonly search?: SearchInit | undefined;
  readonly sort?: SortInit<SortNameOf<TDecl>> | undefined;
  readonly page: {
    readonly default: number;
    readonly max: number;
    readonly range: boolean;
  };
}
