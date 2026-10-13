/**
 * Small hand-built catalogs for the Kysely renderer's edge cases: name
 * collisions, overrides, and domains the test schema cannot express; and
 * the mapping contexts and type references the mapping tests read.
 */
import type {
  Catalog,
  CatalogColumn,
  CatalogDomain,
  CatalogTable,
} from '@nizam-os/catalog-core';

import type { KyselyDriver } from '../config';
import type { MappingContext } from '../render/kysely-mapping';
import type { PositionTypes, TypeRef } from '../render/kysely-type-table';

import { CATALOG_FORMAT } from '@nizam-os/catalog-core';

/** A nullable base-type column without a default; `facts` replaces any member. */
export function column(
  type: string,
  facts: Partial<CatalogColumn> = {},
): CatalogColumn {
  return {
    type,
    typeKind: 'base',
    array: false,
    sqlType: type,
    maxLength: null,
    precision: null,
    scale: null,
    collation: null,
    nullable: true,
    default: null,
    identity: null,
    generated: null,
    comment: null,
    ...facts,
  };
}

/** A nullable domain over the base type `type`; `facts` replaces any member. */
export function domain(
  name: string,
  type: string,
  facts: Partial<CatalogDomain> = {},
): CatalogDomain {
  return {
    schema: 'public',
    name,
    type,
    typeKind: 'base',
    array: false,
    sqlType: type,
    maxLength: null,
    precision: null,
    scale: null,
    collation: null,
    nullable: true,
    default: null,
    constraints: {},
    comment: null,
    ...facts,
  };
}

/** A table of `columns` with no constraints, indexes, or policies. */
export function table(
  name: string,
  columns: Readonly<Record<string, CatalogColumn>>,
): CatalogTable {
  return {
    schema: 'public',
    name,
    comment: null,
    primaryKey: null,
    columns,
    constraints: {},
    indexes: {},
    rowSecurity: { enabled: false, forced: false, policies: {} },
  };
}

/** A catalog of the given enums, domains, and tables. */
export function catalogOf(parts: {
  readonly enums?: Catalog['enums'];
  readonly domains?: Catalog['domains'];
  readonly tables?: Catalog['tables'];
}): Catalog {
  return {
    format: CATALOG_FORMAT,
    schemas: ['public'],
    extensions: [],
    enums: parts.enums ?? {},
    domains: parts.domains ?? {},
    tables: parts.tables ?? {},
  };
}

/** A mapping context over `catalog` with the enum `mood` named `Mood`. */
export function mappingContext(
  catalog: Catalog,
  driver: KyselyDriver = 'node-postgres',
  overrides: Readonly<Record<string, PositionTypes>> = {},
): MappingContext {
  return {
    catalog,
    enumNames: new Map([['mood', 'Mood']]),
    overrides: new Map(Object.entries(overrides)),
    driver,
  };
}

/** The select, insert, and update type texts. */
export function texts(types: PositionTypes): ReadonlyArray<string> {
  return [types.select.text, types.insert.text, types.update.text];
}

/** A reference to the base type `type`, or to its arrays. */
export function baseRef(type: string, array = false): TypeRef {
  return { type, typeKind: 'base', array };
}

/** The same type, without helpers, in all three positions, as an override gives it. */
export function plainTypes(text: string): PositionTypes {
  return {
    select: { text, helpers: [] },
    insert: { text, helpers: [] },
    update: { text, helpers: [] },
  };
}
