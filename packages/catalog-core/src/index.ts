/**
 * `@nizam-os/catalog-core`: the PostgreSQL catalog model as TypeScript types
 * and the pure functions over it. `@nizam-os/pg-catalog` writes catalogs of
 * this shape from your migrations; `toPublicCatalog` slices one for
 * browsers, `diffCatalogs` compares two, and `toCamelCase` and `toSnakeCase`
 * name keys as Kysely's CamelCasePlugin does. See `docs/catalog/SPEC.md` for
 * the contract.
 * @packageDocumentation
 */
export type {
  Catalog,
  CatalogColumn,
  CatalogDomain,
  CatalogIndex,
  CatalogTable,
  CheckConstraint,
  ColumnDefault,
  ColumnGenerated,
  Constraint,
  DomainConstraint,
  ExclusionConstraint,
  ForeignKeyConstraint,
  Identity,
  Policy,
  PolicyCommand,
  PrimaryKeyConstraint,
  ReferentialAction,
  RowSecurity,
  TypeKind,
  UniqueConstraint,
} from './model';
export { CATALOG_FORMAT } from './model';
export type { CamelCaseOptions } from './camel-case';
export { toCamelCase, toSnakeCase } from './camel-case';
export type { CatalogChange, CatalogDiff } from './diff';
export { diffCatalogs } from './diff';
export type { JsonValue } from './internal/json';
export type {
  PublicCatalog,
  PublicCheckConstraint,
  PublicColumn,
  PublicColumnDefault,
  PublicColumnGenerated,
  PublicConstraint,
  PublicDomain,
  PublicDomainConstraint,
  PublicExclusionConstraint,
  PublicForeignKeyConstraint,
  PublicPrimaryKeyConstraint,
  PublicTable,
  PublicUniqueConstraint,
} from './public-types';
export { toPublicCatalog } from './public';
export type {
  EnumRule,
  LengthRule,
  NotNullRule,
  PatternRule,
  RangeBound,
  RangeRule,
  Rule,
} from './rules';
