/**
 * A column's type as PostgreSQL's text forms of its values depend on it
 * (SPEC 5.4, 7.3): the base type its domains end in, whether that is an
 * enum, and whether the column, or a domain on the way, is an array.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

import { ownValue } from '../internal/object';

/** What a column holds, followed through its domains. */
export interface ColumnType {
  /** The base type's name (`citext` in any schema is `citext`), or the enum's. */
  readonly base: string;
  readonly enum: boolean;
  readonly array: boolean;
}

/** The members of a column or a domain that name its type. */
export interface TypedRecord {
  readonly type: string;
  readonly typeKind: string;
  readonly array: boolean;
}

/** `citext` is an extension's type, so it carries its schema when that is not the default. */
const CITEXT = /(?:^|\.)citext$/u;

/** The type of a column, or of a domain written as `{ type, typeKind: 'domain', array: false }`. */
export function columnType(
  catalog: PublicCatalog,
  record: TypedRecord,
): ColumnType {
  let current = record;
  let { array } = record;
  while (current.typeKind === 'domain') {
    const domain = ownValue(catalog.domains, current.type);
    if (domain === undefined) {
      throw new TypeError(`domain ${current.type} is not in the catalog`);
    }
    array ||= domain.array;
    current = domain;
  }
  return {
    base: CITEXT.test(current.type) ? 'citext' : current.type,
    enum: current.typeKind === 'enum',
    array,
  };
}
