/**
 * The members columns and domains share: the type, its modifiers, and the
 * default (SPEC 2.4, 2.8).
 * @packageDocumentation
 */
import type { ColumnDefault, TypeKind } from '@nizam-os/catalog-core';

import type { CheckSubject } from '../recognize/subject';
import type { TypeModifiers } from './modifiers';
import type { TypeFactsRow } from './rows';

import { TYPE_KINDS, decode } from './codes';
import { defaultLiteral } from './defaults';
import { typeModifiers } from './modifiers';
import { referenceName } from './names';

const BUILTIN_SCHEMA = 'pg_catalog';
const NO_MODIFIERS: TypeModifiers = {
  maxLength: null,
  precision: null,
  scale: null,
};

/** `type`, `typeKind`, and `array`. */
export interface TypeMembers {
  readonly type: string;
  readonly typeKind: TypeKind;
  readonly array: boolean;
}

export function typeMembers(
  row: TypeFactsRow,
  defaultSchema: string,
): TypeMembers {
  return {
    type: referenceName(row.typeSchema, row.typeName, defaultSchema),
    typeKind: decode(TYPE_KINDS, row.typeType, 'typtype'),
    array: row.array,
  };
}

/** The modifiers of a built-in type; a type of another schema that shares a built-in name has none. */
export function modifierMembers(row: TypeFactsRow): TypeModifiers {
  return row.typeSchema === BUILTIN_SCHEMA
    ? typeModifiers(row.typeName, row.typmod)
    : NO_MODIFIERS;
}

/** Whether the row's own type is the built-in `name`, not an array of it. */
export function isBuiltin(row: TypeFactsRow, name: string): boolean {
  return (
    row.typeSchema === BUILTIN_SCHEMA && row.typeName === name && !row.array
  );
}

export function defaultMember(row: TypeFactsRow): ColumnDefault | null {
  if (row.default === null) {
    return null;
  }
  const base = {
    schema: row.baseSchema,
    name: row.baseName,
    spelling: row.baseSpelling,
  };
  return {
    expression: row.default,
    literal: defaultLiteral(row.default, base),
  };
}

/**
 * The subject of a CHECK over `row`'s type (SPEC 8.1): `column` names the
 * column of a table CHECK, and `null` stands for a domain's `VALUE`, whose
 * own type is the one the domain is declared over.
 */
export function checkSubject(
  row: TypeFactsRow,
  column: string | null,
): CheckSubject {
  return {
    column,
    domain: row.typeType === 'd',
    array: row.array,
    baseSchema: row.baseSchema,
    baseName: row.baseName,
    baseType: row.baseType,
    baseSpelling: row.baseSpelling,
    deterministic: row.deterministic,
  };
}
