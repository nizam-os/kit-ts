/**
 * A column's type as the oracle needs it: the base type its domains end
 * in, whether it is an enum, and whether the column is an array, read
 * from the public catalog (resource SPEC 5.1).
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

/** What a column holds, followed through its domains. */
export interface ColumnType {
  /** The base type's name (`citext` in any schema is `citext`), or the enum's. */
  readonly base: string;
  readonly enum: boolean;
  readonly array: boolean;
}

interface TypedRecord {
  readonly type: string;
  readonly typeKind: string;
  readonly array: boolean;
}

/** The type of a column, or of a key column. */
export function columnType(
  catalog: PublicCatalog,
  column: TypedRecord,
): ColumnType {
  let record = column;
  let { array } = column;
  while (record.typeKind === 'domain') {
    const domain = catalog.domains[record.type];
    if (domain === undefined) {
      throw new Error(`domain ${record.type} is not in the catalog`);
    }
    array ||= domain.array;
    record = domain;
  }
  return {
    base: record.type.endsWith('citext') ? 'citext' : record.type,
    enum: record.typeKind === 'enum',
    array,
  };
}
