/**
 * What an insert needs of a column (SPEC 6.1 step 4, 6.3): whether its
 * value is effectively NOT NULL, whether a default fills it, and so
 * whether a create must carry it.
 * Not published with the package.
 * @packageDocumentation
 */
import type { PublicCatalog, PublicTable } from '@nizam-os/catalog-core';

import { columnRules, domainRules, levelOf } from './value-levels';

/**
 * NOT NULL in the catalog, under a `notNull` rule of the column or of a
 * domain above the first array, or of a NOT NULL domain there.
 */
export function effectivelyNotNull(
  catalog: PublicCatalog,
  table: PublicTable,
  name: string,
): boolean {
  const column = table.columns[name]!;
  const level = levelOf(catalog, column);
  const rules = [...domainRules(level), ...columnRules(table, name)];
  return (
    !column.nullable ||
    rules.some(({ kind }) => kind === 'notNull') ||
    level.domains.some(({ nullable }) => !nullable)
  );
}

/** A default on the column or on a domain above the first array. */
function hasDefault(
  catalog: PublicCatalog,
  table: PublicTable,
  name: string,
): boolean {
  const column = table.columns[name]!;
  return (
    column.default !== null ||
    levelOf(catalog, column).domains.some((domain) => domain.default !== null)
  );
}

/** Effectively NOT NULL, with no default, and neither identity nor generated (SPEC 6.3). */
export function requiredOnInsert(
  catalog: PublicCatalog,
  table: PublicTable,
  name: string,
): boolean {
  const column = table.columns[name]!;
  return (
    effectivelyNotNull(catalog, table, name) &&
    !hasDefault(catalog, table, name) &&
    column.identity === null &&
    column.generated === null
  );
}
