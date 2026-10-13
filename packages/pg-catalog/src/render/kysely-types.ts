/**
 * The Kysely types (SPEC 9.2, ADR 0007, ADR 0013): one string literal
 * union per enum, one interface per table with each column's select,
 * insert, and update types as the configured driver returns and sends
 * them, and the `DB` interface, rendered from the catalog so the types and
 * the catalog cannot disagree.
 * @ref https://kysely.dev/docs/generating-types
 * @ref https://kysely-org.github.io/kysely-apidoc/types/ColumnType.html
 * @packageDocumentation
 */
import type {
  CamelCaseOptions,
  Catalog,
  CatalogColumn,
  CatalogDomain,
  CatalogTable,
} from '@nizam-os/catalog-core';

import type { KyselyDriver, TypeOverride } from '../config';
import type { MappingContext } from './kysely-mapping';
import type {
  Helper,
  PositionTypes,
  TsType,
  TypeRef,
} from './kysely-type-table';

import { PgCatalogError } from '../errors';
import { compareCodeUnits } from '../internal/code-units';
import { FILE_HEADER } from './catalog-module';
import { KeyNames } from './key-names';
import { HELPER_DECLARATIONS, HELPER_ORDER } from './kysely-helpers';
import { mapType } from './kysely-mapping';
import { memberName, pascalCase, stringLiteral } from './kysely-names';

/** How `renderKyselyTypes` maps types: `TypesConfig` without its file; the driver defaults to node-postgres. */
export interface KyselyTypesOptions {
  readonly driver?: KyselyDriver;
  readonly overrides?: Readonly<Record<string, string | TypeOverride>>;
  readonly imports?: ReadonlyArray<string>;
  readonly camelCase?: boolean | CamelCaseOptions;
}

type KyselyImport = 'ColumnType' | 'Generated' | 'GeneratedAlways';

const UNKNOWN = 'unknown';

const RESERVED: ReadonlyArray<readonly [string, string]> = [
  ['DB', 'the DB interface'],
  ['ColumnType', "Kysely's ColumnType"],
  ['Generated', "Kysely's Generated"],
  ['GeneratedAlways', "Kysely's GeneratedAlways"],
  ...HELPER_ORDER.map((name): [string, string] => [name, `the helper ${name}`]),
];

function plain(text: string): TsType {
  return { text, helpers: [] };
}

function resolveOverrides(
  overrides: Readonly<Record<string, string | TypeOverride>>,
): ReadonlyMap<string, PositionTypes> {
  return new Map(
    Object.entries(overrides).map(([key, value]): [string, PositionTypes] => {
      const {
        select,
        insert = select,
        update = select,
      } = typeof value === 'string' ? { select: value } : value;
      return [
        key,
        { select: plain(select), insert: plain(insert), update: plain(update) },
      ];
    }),
  );
}

/** The domains a column's own type passes through, outermost first. */
function domainChain(
  ref: TypeRef,
  catalog: Catalog,
): ReadonlyArray<CatalogDomain> {
  const domain =
    ref.typeKind === 'domain' && !ref.array
      ? catalog.domains[ref.type]
      : undefined;
  return domain === undefined ? [] : [domain, ...domainChain(domain, catalog)];
}

/** Assigns every TypeScript name once; a second claim of a name is a `name_collision`. */
class Names {
  private readonly owners = new Map<string, string>(RESERVED);

  public claim(name: string, owner: string): string {
    const taken = this.owners.get(name);
    if (taken !== undefined) {
      throw new PgCatalogError(
        'name_collision',
        `${owner} and ${taken} map to the same TypeScript name ${name}`,
      );
    }
    this.owners.set(name, owner);
    return name;
  }
}

/** Renders the members while collecting the helpers and Kysely types they use. */
class Renderer {
  public readonly helpers = new Set<Helper>();
  public readonly kysely = new Set<KyselyImport>();
  private readonly context: MappingContext;
  private readonly names: KeyNames;

  public constructor(context: MappingContext, names: KeyNames) {
    this.context = context;
    this.names = names;
  }

  public table(name: string, key: string, table: CatalogTable): string {
    const members = Object.entries(table.columns).map(([column, facts]) => {
      const member = this.names.key(column, `column ${key}.${column}`);
      return `  ${memberName(member)}: ${this.column(facts)};`;
    });
    return members.length === 0
      ? `export interface ${name} {}`
      : `export interface ${name} {\n${members.join('\n')}\n}`;
  }

  private column(column: CatalogColumn): string {
    const chain = domainChain(column, this.context.catalog);
    const types = mapType(column, this.context);
    // A NOT NULL domain refuses null on write, but a column of one can still
    // read as null: an empty scalar sub-select stores one unchecked.
    // @ref https://www.postgresql.org/docs/18/sql-createdomain.html (Notes)
    const writesNull =
      column.nullable && chain.every((domain) => domain.nullable);
    const select = this.text(types.select, column.nullable);
    const insert = this.text(types.insert, writesNull);
    const update = this.text(types.update, writesNull);
    const equal = select === insert && insert === update;
    if (column.identity === 'always' || column.generated !== null) {
      return this.wrap('GeneratedAlways', select);
    }
    const optional =
      column.default !== null ||
      column.identity === 'byDefault' ||
      chain.some((domain) => domain.default !== null);
    if (optional) {
      return equal
        ? this.wrap('Generated', select)
        : this.wrap(
            'ColumnType',
            `${select}, ${insert} | undefined, ${update}`,
          );
    }
    return equal
      ? select
      : this.wrap('ColumnType', `${select}, ${insert}, ${update}`);
  }

  /** The type's text, with `| null` for a nullable column; records the helpers it names. */
  private text(type: TsType, nullable: boolean): string {
    for (const helper of type.helpers) {
      this.helpers.add(helper);
    }
    // `unknown` already admits null.
    return nullable && type.text !== UNKNOWN
      ? `${type.text} | null`
      : type.text;
  }

  private wrap(kysely: KyselyImport, argument: string): string {
    this.kysely.add(kysely);
    return `${kysely}<${argument}>`;
  }
}

function enumLine(name: string, labels: ReadonlyArray<string>): string {
  const union =
    labels.length === 0
      ? 'never'
      : labels.map((label) => stringLiteral(label)).join(' | ');
  return `export type ${name} = ${union};`;
}

function byKey<TValue>(
  record: Readonly<Record<string, TValue>>,
): ReadonlyArray<readonly [string, TValue]> {
  return Object.entries(record).toSorted(([left], [right]) =>
    compareCodeUnits(left, right),
  );
}

function importLines(
  kysely: ReadonlySet<KyselyImport>,
  imports: ReadonlyArray<string>,
): ReadonlyArray<string> {
  if (kysely.size === 0) {
    return imports;
  }
  const names = [...kysely].toSorted(compareCodeUnits).join(', ');
  return [`import type { ${names} } from 'kysely';`, ...imports];
}

/**
 * The text of the Kysely types file: the header, Kysely's helper types and
 * the configured imports, the helper types the file uses, the enums, one
 * interface per table, and `DB`. Two objects with the same TypeScript name,
 * or an object named like a helper, fail with `name_collision`; with
 * `camelCase`, a table or column name CamelCasePlugin would not turn back
 * into itself fails with `camel_case_mismatch`.
 */
export function renderKyselyTypes(
  catalog: Catalog,
  options: KyselyTypesOptions = {},
): string {
  const names = new Names();
  const enums = byKey(catalog.enums).map(([key, labels]) => ({
    name: names.claim(pascalCase(key), `enum ${key}`),
    key,
    labels,
  }));
  const tables = byKey(catalog.tables).map(([key, table]) => ({
    name: names.claim(`${pascalCase(key)}Table`, `table ${key}`),
    key,
    table,
  }));
  const keys = new KeyNames(options.camelCase);
  const renderer = new Renderer(
    {
      catalog,
      enumNames: new Map(enums.map(({ key, name }) => [key, name])),
      overrides: resolveOverrides(options.overrides ?? {}),
      driver: options.driver ?? 'node-postgres',
    },
    keys,
  );
  const interfaces = tables.map(({ name, key, table }) =>
    renderer.table(name, key, table),
  );
  // Kysely reads `schema.table`, and the plugin converts each part.
  const members = tables.map(({ key, name }) => {
    const parts = key.split('.').map((part) => keys.key(part, `table ${key}`));
    return `  ${memberName(parts.join('.'))}: ${name};`;
  });
  keys.assertMapped();
  const blocks = [
    [FILE_HEADER, ...importLines(renderer.kysely, options.imports ?? [])].join(
      '\n',
    ),
    ...HELPER_ORDER.filter((helper) => renderer.helpers.has(helper)).map(
      (helper) => HELPER_DECLARATIONS[helper].join('\n'),
    ),
    ...(enums.length === 0
      ? []
      : [enums.map(({ name, labels }) => enumLine(name, labels)).join('\n')]),
    ...interfaces,
    members.length === 0
      ? 'export interface DB {}'
      : `export interface DB {\n${members.join('\n')}\n}`,
  ];
  return `${blocks.join('\n\n')}\n`;
}
