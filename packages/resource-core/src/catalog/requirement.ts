/**
 * Whether a column is required on insert (SPEC 6.3), for any column of a
 * table, declared or not: it is effectively NOT NULL (the column itself, a
 * `notNull` rule among its enforced single-column CHECKs, or a NOT NULL
 * domain or a domain's `notNull` rule above its first array), has no
 * default on the column or on such a domain, and is neither an identity
 * nor a generated column. The member specs compute the same facts while
 * building values (`schema/field-spec.ts`), and `IsRequired` is the
 * type-level twin; `server-values.test.ts` holds the three to one case
 * table.
 * @packageDocumentation
 */
import type {
  PublicCatalog,
  PublicColumn,
  PublicTable,
} from '@nizam-os/catalog-core';

import { ownValue } from '../internal/object';

function hasNotNullRule(table: PublicTable, column: string): boolean {
  return Object.values(table.constraints).some(
    (constraint) =>
      constraint.kind === 'check' &&
      constraint.enforced &&
      constraint.columns.length === 1 &&
      constraint.columns[0] === column &&
      constraint.rule?.kind === 'notNull',
  );
}

/** Whether an insert that leaves `column` out of `table` fails (SPEC 6.3). */
export function isRequiredOnInsert(
  catalog: PublicCatalog,
  table: PublicTable,
  column: string,
): boolean {
  const columnDef = ownValue(table.columns, column);
  if (
    columnDef === undefined ||
    columnDef.identity !== null ||
    columnDef.generated !== null
  ) {
    return false;
  }
  let notNull = !columnDef.nullable || hasNotNullRule(table, column);
  let hasDefault = columnDef.default !== null;
  let record: Pick<PublicColumn, 'type' | 'typeKind' | 'array'> = columnDef;
  while (!record.array && record.typeKind === 'domain') {
    const domain = ownValue(catalog.domains, record.type);
    if (domain === undefined) {
      break;
    }
    notNull ||=
      !domain.nullable ||
      Object.values(domain.constraints).some(
        ({ rule }) => rule?.kind === 'notNull',
      );
    hasDefault ||= domain.default !== null;
    record = domain;
  }
  return notNull && !hasDefault;
}
