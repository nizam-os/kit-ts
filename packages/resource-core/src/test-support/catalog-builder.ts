/**
 * Builders for small public catalogs a test writes for one case, where the
 * unit-test catalog has no table of that shape. Wide types: runtime tests
 * only. Not published with the package.
 * @packageDocumentation
 */
import type {
  PublicCatalog,
  PublicCheckConstraint,
  PublicColumn,
  PublicConstraint,
  PublicDomain,
  PublicTable,
  Rule,
} from '@nizam-os/catalog-core';

import type { DeclaredResource } from '../declare/declared-resource';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from './contacts';
import { TEST_REGISTRIES } from './definer';

/** A nullable `text` column without default, identity, or generation, with `overrides`. */
export function column(overrides: Partial<PublicColumn> = {}): PublicColumn {
  return {
    type: 'text',
    typeKind: 'base',
    array: false,
    sqlType: 'text',
    maxLength: null,
    precision: null,
    scale: null,
    nullable: true,
    default: null,
    identity: null,
    generated: null,
    ...overrides,
  };
}

/** A table in schema `public` keyed by `id` unless `primaryKey` says otherwise. */
export function table(
  name: string,
  columns: Readonly<Record<string, PublicColumn>>,
  constraints: Readonly<Record<string, PublicConstraint>> = {},
  primaryKey: ReadonlyArray<string> | null = ['id'],
): PublicTable {
  return { schema: 'public', name, primaryKey, columns, constraints };
}

/** An enforced CHECK over the column `name`, with the rule read from it or `null`. */
export function check(name: string, rule: Rule | null): PublicCheckConstraint {
  return { kind: 'check', columns: [name], rule, enforced: true };
}

/** A domain over `text` with `overrides`. */
export function domain(
  name: string,
  overrides: Partial<PublicDomain> = {},
): PublicDomain {
  return {
    schema: 'public',
    name,
    type: 'text',
    typeKind: 'base',
    array: false,
    sqlType: 'text',
    maxLength: null,
    precision: null,
    scale: null,
    nullable: true,
    default: null,
    constraints: {},
    ...overrides,
  };
}

/** A public catalog of the given tables and domains. */
export function catalogOf(
  tables: Readonly<Record<string, PublicTable>>,
  domains: Readonly<Record<string, PublicDomain>> = {},
): PublicCatalog {
  return { format: 3, enums: {}, domains, tables };
}

/** `declareResource` with its types erased, as JavaScript calls it. */
export type UntypedDeclare = (
  table: unknown,
  declaration: unknown,
) => DeclaredResource;

/**
 * An untyped `declareResource` over `catalog` and `config`: by default the
 * unit-test catalog with the test registries, and for any other catalog
 * the registries that do not name its contents.
 */
export function untypedDeclare(
  catalog: PublicCatalog = contactsCatalog,
  config: object = catalog === contactsCatalog
    ? TEST_REGISTRIES
    : {
        codecs: TEST_REGISTRIES.codecs,
        validators: TEST_REGISTRIES.validators,
      },
): UntypedDeclare {
  const configure = createDeclareResource as unknown as (
    config: unknown,
  ) => UntypedDeclare;
  return configure({ catalog, ...config });
}
