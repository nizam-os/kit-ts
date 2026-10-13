/**
 * What the type tables of SPEC 9.2 are made of: a TypeScript type's text
 * with the helper types it names, a type's select and insert types, and the
 * table each driver gives (`kysely-node-postgres.ts`, `kysely-pglite.ts`).
 * @packageDocumentation
 */
import type { TypeKind } from '@nizam-os/catalog-core';

/** The helper types a generated file declares when it uses them. */
export type Helper =
  | 'JsonValue'
  | 'JsonParameter'
  | 'PostgresInterval'
  | 'Point'
  | 'Circle';

/** A TypeScript type and the helper types it mentions. */
export interface TsType {
  readonly text: string;
  readonly helpers: ReadonlyArray<Helper>;
}

/** A column's types in Kysely's three positions. */
export interface PositionTypes {
  readonly select: TsType;
  readonly insert: TsType;
  readonly update: TsType;
}

/** A column's or a domain's type: its reference name, its kind, and whether it is an array of it. */
export interface TypeRef {
  readonly type: string;
  readonly typeKind: TypeKind;
  readonly array: boolean;
}

/** A type's select type and the parameter values its driver writes for it. */
export interface Scalar {
  readonly select: TsType;
  readonly insert: TsType;
  /** The values `String(value)` writes as the type's text, when they differ from `insert`. */
  readonly text?: TsType;
}

/** How one driver turns values of PostgreSQL types into JavaScript and back. */
export interface DriverTable {
  /** The types it parses or serializes, by name; every other type is text. */
  readonly scalars: ReadonlyMap<string, Scalar>;
  /** The types of an array of `ref`, whose element type maps to `element`. */
  array(ref: TypeRef, element: PositionTypes): PositionTypes;
  /** The insert and update type of a domain over `base`, which maps to `types`. */
  domainParameter(base: TypeRef, types: PositionTypes): TsType;
}

export function ts(text: string, ...helpers: ReadonlyArray<Helper>): TsType {
  return { text, helpers };
}

export function same(text: string, ...helpers: ReadonlyArray<Helper>): Scalar {
  return { select: ts(text, ...helpers), insert: ts(text, ...helpers) };
}

export function positions(scalar: Scalar): PositionTypes {
  return {
    select: scalar.select,
    insert: scalar.insert,
    update: scalar.insert,
  };
}

/** `Array<T>`: an array of the type `element`. */
export function arrayOf(element: TsType): TsType {
  return ts(`Array<${element.text}>`, ...element.helpers);
}

/** `Array<T> | string`: an array, or PostgreSQL's array text. */
export function arrayParameter(element: TsType): TsType {
  return ts(`Array<${element.text}> | string`, ...element.helpers);
}

export const NUMBER: Scalar = same('number');
export const TEXT: Scalar = same('string');
export const BOOLEAN: Scalar = same('boolean');
export const NUMERIC_TEXT: Scalar = {
  select: ts('string'),
  insert: ts('string | number'),
};
