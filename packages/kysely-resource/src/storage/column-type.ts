/**
 * A column's type as the adapter reads and writes its values (SPEC 18.2):
 * the base type its domains end in, whether that is an enum, and whether
 * the column, or a domain on the way, is an array.
 * @packageDocumentation
 */
import type { PublicCatalog, PublicColumn } from '@nizam-os/catalog-core';

import { ownValue } from '../internal/object';

/** What a column holds, followed through its domains. */
export interface ColumnType {
  /** The base type's name, `citext` in any schema as `citext`, or the enum's. */
  readonly base: string;
  readonly enum: boolean;
  readonly array: boolean;
}

/** `citext` is an extension's type, so it carries its schema when that is not the default. */
const CITEXT = /(?:^|\.)citext$/u;

/** The type of `column`; throws for a domain the catalog does not hold. */
export function columnType(
  catalog: PublicCatalog,
  column: PublicColumn,
): ColumnType {
  let { type, typeKind, array } = column;
  while (typeKind === 'domain') {
    const domain = ownValue(catalog.domains, type);
    if (domain === undefined) {
      throw new Error(`the catalog has no domain ${type}`);
    }
    ({ type, typeKind } = domain);
    array ||= domain.array;
  }
  return {
    base: CITEXT.test(type) ? 'citext' : type,
    enum: typeKind === 'enum',
    array,
  };
}
