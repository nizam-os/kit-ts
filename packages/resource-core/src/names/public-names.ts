/**
 * The derivations of SPEC 4.1, in types and at runtime: a type is the
 * table's name without its schema, a field the camelCase of its column, a
 * relationship the camelCase of its column without the `_id` suffix, and
 * `as` replaces any of them. `deriveNames` checks the results; this module
 * only derives.
 * @packageDocumentation
 */
import type { PublicTable } from '@nizam-os/catalog-core';

import type { Declaration, DeclaredMembers, MemberOf } from '../declare/types';
import type { CamelCase } from './camel-case';

/** The suffix a relationship column needs for a derived name (SPEC 17). */
const ID_SUFFIX = '_id';

/** A relationship column without its `_id` suffix; `never` without one or with nothing before it. */
export type IdBase<TColumn extends string> = string extends TColumn
  ? string
  : TColumn extends `${infer TBase}${typeof ID_SUFFIX}`
    ? TBase extends ''
      ? never
      : TBase
    : never;

/** The resource type: `as`, or the table's name. */
export type TypeNameOf<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> =
  MemberOf<TDecl, 'as'> extends string
    ? MemberOf<TDecl, 'as'>
    : TTableDef['name'];

/** A field's public name: `as`, or the camelCase of its column. */
export type FieldNameOf<TColumn extends string, TField> =
  MemberOf<TField, 'as'> extends string
    ? MemberOf<TField, 'as'>
    : CamelCase<TColumn>;

/** A relationship's public name: `as`, or the camelCase of its column without `_id`; `never` when it needs `as`. */
export type RelationshipNameOf<TColumn extends string, TRelationship> =
  MemberOf<TRelationship, 'as'> extends string
    ? MemberOf<TRelationship, 'as'>
    : CamelCase<IdBase<TColumn>>;

/** Public field name to column, the type-level twin of `names.fields`. */
export type FieldNames<TDecl extends Declaration> = {
  [
    K in keyof TDecl['fields'] & string as FieldNameOf<K, TDecl['fields'][K]>
  ]: K;
};

type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

/** Public relationship name to column, the type-level twin of `names.relationships`. */
export type RelationshipNames<TDecl extends Declaration> = {
  [
    K in keyof Relationships<TDecl> & string as RelationshipNameOf<
      K,
      Relationships<TDecl>[K]
    >
  ]: K;
};

/** A relationship column without its `_id` suffix, or `undefined` when it needs `as`. */
export function idBase(column: string): string | undefined {
  return column.length > ID_SUFFIX.length && column.endsWith(ID_SUFFIX)
    ? column.slice(0, -ID_SUFFIX.length)
    : undefined;
}

/**
 * Whether a cased letter outside the Basic Multilingual Plane follows a
 * `_`: there `toCamelCase` upper-cases a lone surrogate, which changes
 * nothing, and `CamelCase` the whole letter (`camel-case.ts`).
 */
export function camelCaseDiverges(column: string): boolean {
  let afterUnderscore = false;
  for (const character of column) {
    if (
      afterUnderscore &&
      character.length > 1 &&
      character.toUpperCase() !== character
    ) {
      return true;
    }
    afterUnderscore = character === '_';
  }
  return false;
}
