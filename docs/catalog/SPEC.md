# catalog: implementation specification

- Status: normative for the 0.x line of `@nizam-os/catalog-core` and `@nizam-os/pg-catalog`;
  `docs/catalog/DESIGN.md` explains the why

The key words MUST, MUST NOT, SHOULD, and MAY are used as in RFC 2119. Every section names the
source file that implements it and the tests that prove it. When this document and the code
disagree, fix one of them in the same pull request. PostgreSQL references are to the version 18
manual; the behavior they describe is the same on every supported major (14 to 18) unless a section
says otherwise.

Contents

1. Public surface and module map
2. The catalog model
3. The public catalog
4. The diff
5. Migrations
6. Replay targets
7. Extraction
8. The CHECK recognizer
9. Output files
10. Commands
11. Configuration and the CLI
12. Errors
13. Test plan
14. Packaging
15. Constants

---

## 1. Public surface and module map

Two packages (ADR 0002). `@nizam-os/catalog-core` is the model and the pure functions over it; it
has no dependencies and runs anywhere the other cores run. `@nizam-os/pg-catalog` replays, extracts,
renders, compares, checks declared resources against the database (10.3), records their API surface
(10.4), and runs the CLI; it depends on `@nizam-os/catalog-core` (and re-exports all of it) and on
`pg`, and takes `@electric-sql/pglite` and `@nizam-os/resource-core` as optional peer dependencies.

| Package                  | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nizam-os/catalog-core` | Values: `toPublicCatalog`, `diffCatalogs`, `toCamelCase`, `toSnakeCase`, `CATALOG_FORMAT`; and the types of sections 2 to 4 and 9.2 (`CamelCaseOptions`, `Catalog`, `CatalogTable`, `CatalogColumn`, `ColumnDefault`, `ColumnGenerated`, `TypeKind`, `Identity`, `Constraint`, `PrimaryKeyConstraint`, `UniqueConstraint`, `ForeignKeyConstraint`, `CheckConstraint`, `ExclusionConstraint`, `ReferentialAction`, `CatalogIndex`, `RowSecurity`, `Policy`, `PolicyCommand`, `CatalogDomain`, `DomainConstraint`, `Rule`, `LengthRule`, `RangeRule`, `RangeBound`, `EnumRule`, `NotNullRule`, `PatternRule`, `PublicCatalog`, `PublicTable`, `PublicColumn`, `PublicColumnDefault`, `PublicColumnGenerated`, `PublicConstraint` and its five kinds, `PublicDomain`, `PublicDomainConstraint`, `CatalogDiff`, `CatalogChange`, `JsonValue`)                                                                                                                                                                               |
| `@nizam-os/pg-catalog`   | Everything of `@nizam-os/catalog-core` (the same bindings), plus `defineExtraction`, `extract`, `drift`, `extractCatalog`, `introspectCatalog`, `renderCatalogModule`, `renderPublicCatalogModule`, `parseCatalogModule`, `renderKyselyTypes`, `formatDiff`, `checkRules`, `formatRules`, `writeSurface`, `checkSurface`, `formatSurface`, `PgCatalogError`, `isPgCatalogError`; the types `ExtractionConfig`, `MigrationSource`, `Migration`, `DatabaseConfig`, `PgliteExtension`, `OutputConfig`, `CatalogFileConfig`, `PublicFileConfig`, `CatalogModuleOptions`, `TypesConfig`, `KyselyDriver`, `TypeOverride`, `DriftEnvironment`, `ResourcesConfig`, `TextStorageCodec`, `DriftOptions`, `DriftReport`, `ExtractOptions`, `ExtractReport`, `ExtractedFile`, `ExtractCatalogOptions`, `IntrospectOptions`, `KyselyTypesOptions`, `RulesOptions`, `RulesReport`, `RuleCaseReport`, `RuleDisagreement`, `SurfaceOptions`, `SurfaceWriteReport`, `SurfaceCheckReport`, `PgCatalogErrorCode`; and the `pg-catalog` bin |

`e2e/catalog/package-surface.e2e.test.ts` asserts the exact value export lists against the built
packages and that the re-exports are the core's own bindings.

Source layout. Every module with behavior has a sibling `*.test.ts`; contract types have
`*.test-d.ts`. Imports form a DAG; nothing under `packages/catalog-core` imports a driver, PGlite,
or a Node.js module, and `packages/pg-catalog` imports the core only through its package name.

```
packages/catalog-core/src/
  index.ts                     root entry
  model.ts                     the catalog model types, CATALOG_FORMAT (3)
  rules.ts                     the rule types (2.9)
  public.ts                    toPublicCatalog() (3)
  public-types.ts              the public types (3)
  diff.ts                      diffCatalogs(), CatalogDiff, CatalogChange (4)
  camel-case.ts                toCamelCase(), toSnakeCase(), CamelCaseOptions: CamelCasePlugin's conversions (9.2)
  internal/json.ts             JsonValue, isPlainObject(), jsonEqual() (4)
packages/pg-catalog/src/
  index.ts                     root entry: re-exports @nizam-os/catalog-core, adds the rest
  cli.ts                       the bin entry (11.2)
  errors.ts                    PgCatalogError, isPgCatalogError() (12)
  config.ts                    defineExtraction(), the config types (11.1)
  config-validate.ts           validateConfig(): the checks defineExtraction runs (11.1)
  config-options.ts            the option checks validateConfig() composes (11.1)
  config-file.ts               findConfigFile(), loadConfigFile() (11.1)
  migrations/order.ts          orderMigrations(), naturalCompare() (5)
  migrations/load.ts           loadMigrations() (5)
  internal/code-units.ts       compareCodeUnits(), the order of every key (2.10)
  internal/read-existing.ts    readExisting(): a file a command compares with what it writes (10.1, 10.4)
  target/session.ts            SqlSession, SESSION_SETTINGS, useSession() (6, 7.1)
  target/pglite.ts             openPglite() (6.1)
  target/server.ts             openThrowawayDatabase(), openLiveDatabase() (6.2, 10.2)
  target/open-target.ts        openTarget(): the replay target a configuration names (6)
  target/failure.ts            failureOf(), failureMessage(): a PostgreSQL error's fields (6.3, 10.3)
  replay.ts                    replay(), lineAndColumn() (6.3)
  extract/names.ts             referenceName(), assertSafeKey(), sortedRecord() (2.1, 2.10)
  extract/queries.ts           the extraction SQL by server version (7.2)
  extract/read-catalog.ts      readCatalog() (7)
  extract/modifiers.ts         typeModifiers() (7.3)
  extract/defaults.ts          defaultLiteral() (7.3)
  extract/search-config.ts     searchConfig() (7.3)
  extract/rows.ts              the row shapes the queries return (7.2)
  extract/codes.ts             the pg_catalog code tables (2.4 to 2.8)
  extract/type-facts.ts        the type, modifier, default, and CHECK-subject members of columns and domains (2.4, 2.8, 8.1)
  extract/build-table.ts       buildTable() (2.3 to 2.7)
  sql/tokenize.ts              tokenize() over deparsed SQL (8.2)
  sql/parse.ts                 parseExpression() (8.2)
  sql/nodes.ts                 the expression tree (8.2)
  sql/cursor.ts                TokenCursor, Unparsable (8.2)
  sql/type-name.ts             readTypeName() (8.2)
  recognize/recognize.ts       recognizeCheck(): guards and conjunctions (8.3)
  recognize/terms.ts           the single-term shapes (8.3)
  recognize/subject.ts         CheckSubject, the subject and applicability (8.1, 8.3)
  recognize/constants.ts       N, L, and string constants (8.3)
  recognize/pattern.ts         translatePattern() (8.4)
  render/catalog-module.ts     renderCatalogModule(), renderPublicCatalogModule(), parseCatalogModule() (9.1)
  render/kysely-type-table.ts  the parts of a type table: TsType, Scalar, DriverTable (9.2)
  render/kysely-node-postgres.ts the node-postgres table (9.2)
  render/kysely-pglite.ts      the PGlite table (9.2, ADR 0013)
  render/kysely-mapping.ts     mapType(): overrides, domains, and the driver's table (9.2)
  render/kysely-helpers.ts     the helper types' declarations (9.2)
  render/kysely-names.ts       pascalCase(), memberName(), stringLiteral() (9.2)
  render/key-names.ts          KeyNames: the camelCase keys and the names that do not map back (9.2)
  render/kysely-types.ts       renderKyselyTypes() (9.2)
  commands/extract.ts          extractCatalog(), extract() (10.1)
  commands/drift.ts            introspectCatalog(), drift() (10.2)
  commands/format-diff.ts      formatDiff() (10.2)
  commands/registry.ts         resourcesOf(), callRegistry(): the configured declared resources (10.3, 10.4)
  commands/rules.ts            checkRules() (10.3)
  commands/format-rules.ts     formatRules() (10.3)
  commands/show-value.ts       showValue(), showShort(), plural(): values and counts in a report (10.3, 10.4)
  commands/surface.ts          writeSurface(), checkSurface() (10.4)
  commands/format-surface.ts   formatSurface() (10.4)
  surface/openapi-module.ts    OpenapiModule, importOpenapi(): resource-core's OpenAPI entry (10.4)
  oracle/oracle-module.ts      OracleModule, importOracle(): the optional resource-core peer (10.3)
  oracle/probe-sql.ts          the probe, template, and attempt function SQL (10.3)
  oracle/probe.ts              buildProbe(), dropProbe() (10.3)
  oracle/attempt.ts            installAttempt(), attempt(): the database's verdicts (10.3)
  oracle/run-cases.ts          runCases() (10.3)
  oracle/report.ts             RulesReport, RuleCaseReport, RuleDisagreement (10.3)
  cli/arguments.ts             parseCommand(), USAGE, UsageError (11.2)
  cli/main.ts                  runCli() (11.2)
```

---

## 2. The catalog model (`packages/catalog-core/src/model.ts`, `rules.ts`)

The model is plain JSON data: strings, numbers, booleans, `null`, arrays, and objects. Every type is
deeply readonly, so a generated `as const` literal is assignable to it. Interfaces below list their
members in the order the renderer writes them (2.10).

### 2.1 Names and keys (`pg-catalog/src/extract/names.ts`)

The **default schema** is the first configured schema (11.1). An object's **reference name** is its
name when its schema is the default schema or `pg_catalog`, and `<schema>.<name>` otherwise.
Reference names key tables, enums, and domains, name column and domain base types, and name the
table a foreign key references. Names are PostgreSQL's own, never case-folded or quoted.

Extraction MUST fail with `unsafe_name` (12) when any key it would write (a table, column,
constraint, index, policy, enum, or domain) is `__proto__`, because an object literal with that key
sets its prototype instead of creating a member, and with `duplicate_key` when two objects map to
the same reference name (a table `"a.b"` in the default schema and a table `b` in schema `a`).

### 2.2 Catalog

```ts
interface Catalog {
  readonly format: 3; // CATALOG_FORMAT; any change to the model's shape increments it
  readonly schemas: ReadonlyArray<string>; // the configured schemas, in order
  readonly extensions: ReadonlyArray<string>; // installed into a configured schema, sorted
  readonly enums: Readonly<Record<string, ReadonlyArray<string>>>; // labels in declaration order
  readonly domains: Readonly<Record<string, CatalogDomain>>;
  readonly tables: Readonly<Record<string, CatalogTable>>;
}
```

The catalog describes ordinary and partitioned tables (`relkind` `r` and `p`, partitions excluded),
enums, and domains in the configured schemas, and the extensions installed into them. Objects that
belong to an extension (a `pg_depend` row with `deptype = 'e'`, the test pg_dump uses) are left out:
`earthdistance`'s `earth` domain is not the application's. Views, functions, triggers, sequences,
composite types, ranges, and privileges are not modeled. @ref
https://www.postgresql.org/docs/18/catalog-pg-depend.html

### 2.3 Tables

```ts
interface CatalogTable {
  readonly schema: string;
  readonly name: string;
  readonly comment: string | null; // obj_description
  readonly primaryKey: ReadonlyArray<string> | null; // the primary key constraint's columns
  readonly columns: Readonly<Record<string, CatalogColumn>>; // attnum order
  readonly constraints: Readonly<Record<string, Constraint>>;
  readonly indexes: Readonly<Record<string, CatalogIndex>>;
  readonly rowSecurity: RowSecurity;
}
```

### 2.4 Columns

```ts
type TypeKind = 'base' | 'enum' | 'domain' | 'composite' | 'range' | 'multirange';
type Identity = 'always' | 'byDefault';

interface CatalogColumn {
  readonly type: string; // reference name of the type, of the element type for an array
  readonly typeKind: TypeKind; // of `type`
  readonly array: boolean;
  readonly sqlType: string; // format_type(atttypid, atttypmod), e.g. "character varying(320)"
  readonly maxLength: number | null; // n of varchar(n) and char(n)
  readonly precision: number | null; // p of numeric(p), numeric(p, s), timestamp(p), timestamptz(p), time(p), timetz(p)
  readonly scale: number | null; // s of numeric(p, s); 0 for numeric(p)
  readonly collation: string | null; // an explicit COLLATE; null for the default or none
  readonly nullable: boolean; // not attnotnull
  readonly default: ColumnDefault | null;
  readonly identity: Identity | null;
  readonly generated: ColumnGenerated | null;
  readonly comment: string | null; // col_description
}

interface ColumnDefault {
  readonly expression: string; // pg_get_expr(adbin, adrelid)
  readonly literal: string | null; // the constant's text when the default is a constant (7.3)
}

interface ColumnGenerated {
  readonly kind: 'stored' | 'virtual'; // attgenerated 's' and, from PostgreSQL 18, 'v'
  readonly expression: string; // pg_get_expr(adbin, adrelid)
  readonly searchConfig: string | null; // the regconfig of a tsvector expression (7.3)
}
```

- `type` is `pg_type.typname` (`int4`, `varchar`, `timestamptz`, `bpchar`), so the Kysely mapping
  and the recognizer key on one unambiguous name; `sqlType` is the spelling a human reads. A column
  is an array when its type is a base type of category `A` with an element type; a domain over an
  array is a column of kind `domain` that is not itself an array (the domain records the array).
- `maxLength`, `precision`, and `scale` are decoded from `atttypmod` (7.3), the column's own
  modifier; a column of a domain type carries `null` and the domain carries the modifier.
- `collation` is `pg_collation.collname` when `attcollation` is set and differs from the type's
  default collation, so it is `null` for a plain `text` column and `"C"` for `text COLLATE "C"`.
- A generated column has `default` `null`; its expression lives in `generated`. An identity column
  has no `pg_attrdef` row, so its `default` is `null` too.

### 2.5 Constraints

```ts
type ReferentialAction = 'noAction' | 'restrict' | 'cascade' | 'setNull' | 'setDefault';
type Constraint =
  | PrimaryKeyConstraint
  | UniqueConstraint
  | ForeignKeyConstraint
  | CheckConstraint
  | ExclusionConstraint;

interface PrimaryKeyConstraint {
  readonly kind: 'primaryKey';
  readonly columns: ReadonlyArray<string>;
  readonly definition: string; // pg_get_constraintdef(oid)
}
interface UniqueConstraint {
  readonly kind: 'unique';
  readonly columns: ReadonlyArray<string>;
  readonly nullsDistinct: boolean; // false for NULLS NOT DISTINCT (PostgreSQL 15+)
  readonly definition: string;
}
interface ForeignKeyConstraint {
  readonly kind: 'foreignKey';
  readonly columns: ReadonlyArray<string>;
  readonly references: { readonly table: string; readonly columns: ReadonlyArray<string> };
  readonly onUpdate: ReferentialAction;
  readonly onDelete: ReferentialAction;
  readonly validated: boolean; // false after NOT VALID until VALIDATE CONSTRAINT
  readonly enforced: boolean; // false for NOT ENFORCED (PostgreSQL 18+)
  readonly definition: string;
}
interface CheckConstraint {
  readonly kind: 'check';
  readonly columns: ReadonlyArray<string>;
  readonly expression: string; // pg_get_expr(conbin, conrelid)
  readonly rule: Rule | null; // section 8
  readonly validated: boolean;
  readonly enforced: boolean;
  readonly definition: string;
}
interface ExclusionConstraint {
  readonly kind: 'exclusion';
  readonly columns: ReadonlyArray<string>; // the plain columns among the elements
  readonly definition: string;
}
```

Constraints come from `pg_constraint` rows with `contype` `p`, `u`, `f`, `c`, and `x`; NOT NULL rows
(`n`, PostgreSQL 18) and constraint triggers (`t`) are left out, because nullability is `attnotnull`
on every major (ADR 0004). A foreign key that references a partitioned table is cloned once per
partition of that table, with `conparentid` pointing at it and a name that differs between majors
(PostgreSQL 14 derives it from the table and columns, PostgreSQL 18 from the constraint); these
clones are left out, as pg_dump leaves them out. @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/bin/pg_dump/pg_dump.c (`getConstraints`)
`columns` maps `conkey` to names in `conkey` order, dropping the zero entries of expression
elements; `references.columns` maps `confkey` the same way. The actions decode `confupdtype` and
`confdeltype` (`a`, `r`, `c`, `n`, `d`). `nullsDistinct` reads the backing index's
`indnullsnotdistinct`, and `enforced` reads `conenforced`; on majors without those columns they are
`true`. @ref https://www.postgresql.org/docs/18/catalog-pg-constraint.html

### 2.6 Indexes

```ts
interface CatalogIndex {
  readonly method: string; // pg_am.amname: "btree", "gin", "gist", ...
  readonly unique: boolean;
  readonly primary: boolean;
  readonly nullsDistinct: boolean;
  readonly columns: ReadonlyArray<string | null>; // key columns; null for an expression element
  readonly include: ReadonlyArray<string>; // INCLUDE columns
  readonly predicate: string | null; // pg_get_expr(indpred, indrelid)
  readonly definition: string; // pg_get_indexdef(indexrelid)
}
```

Every `pg_index` row of a cataloged table is listed, including the indexes behind primary key,
unique, and exclusion constraints, so the index set is what the planner sees. The first
`indnkeyatts` entries of `indkey` are the key columns and the rest are the INCLUDE columns. @ref
https://www.postgresql.org/docs/18/catalog-pg-index.html

### 2.7 Row security

```ts
type PolicyCommand = 'all' | 'select' | 'insert' | 'update' | 'delete';

interface RowSecurity {
  readonly enabled: boolean; // relrowsecurity
  readonly forced: boolean; // relforcerowsecurity
  readonly policies: Readonly<Record<string, Policy>>;
}
interface Policy {
  readonly command: PolicyCommand; // polcmd '*', 'r', 'a', 'w', 'd'
  readonly permissive: boolean;
  readonly roles: ReadonlyArray<string>; // sorted; "public" for the PUBLIC pseudo-role
  readonly using: string | null; // pg_get_expr(polqual, polrelid)
  readonly withCheck: string | null; // pg_get_expr(polwithcheck, polrelid)
}
```

@ref https://www.postgresql.org/docs/18/catalog-pg-policy.html

### 2.8 Enums and domains

An enum is its labels in `enumsortorder`. A domain is:

```ts
interface CatalogDomain {
  readonly schema: string;
  readonly name: string;
  readonly type: string; // the base type, as CatalogColumn.type
  readonly typeKind: TypeKind;
  readonly array: boolean;
  readonly sqlType: string; // format_type(typbasetype, typtypmod)
  readonly maxLength: number | null;
  readonly precision: number | null;
  readonly scale: number | null;
  readonly collation: string | null;
  readonly nullable: boolean; // not typnotnull
  readonly default: ColumnDefault | null; // pg_get_expr(typdefaultbin, 0)
  readonly constraints: Readonly<Record<string, DomainConstraint>>;
  readonly comment: string | null;
}
interface DomainConstraint {
  readonly kind: 'check';
  readonly expression: string; // over VALUE
  readonly rule: Rule | null;
  readonly validated: boolean;
  readonly definition: string;
}
```

The domain's `default` reads `typdefaultbin` rather than `typdefault`, which holds text deparsed
when the domain was created, under that session's `search_path`. Domain NOT NULL constraints (stored
as `pg_constraint` rows from PostgreSQL 17) are carried by `nullable`. @ref
https://www.postgresql.org/docs/18/catalog-pg-type.html

### 2.9 Rules (`rules.ts`)

```ts
type Rule = LengthRule | RangeRule | EnumRule | NotNullRule | PatternRule;

interface LengthRule {
  readonly kind: 'length';
  readonly min: number | null; // in Unicode code points, inclusive
  readonly max: number | null;
}
interface RangeRule {
  readonly kind: 'range';
  readonly min: RangeBound | null;
  readonly max: RangeBound | null;
}
interface RangeBound {
  readonly value: string; // a decimal literal: /^-?\d+(\.\d+)?$/
  readonly inclusive: boolean;
}
interface EnumRule {
  readonly kind: 'enum';
  readonly values: ReadonlyArray<string>; // in the CHECK's order
}
interface NotNullRule {
  readonly kind: 'notNull';
}
interface PatternRule {
  readonly kind: 'pattern';
  readonly source: string; // the PostgreSQL pattern, valid JavaScript with the flags below
  readonly flags: 'su';
}
```

A rule states a predicate over the non-null values of the column's type, after PostgreSQL's input
conversion and type modifier coercion (a `numeric(10,2)` value is already rounded to two places); a
codec that accepts other representations must apply the same conversion before the rule. Within that
domain a rule is true exactly when the CHECK is, with two stated limits: a range rule speaks of
finite numbers only (PostgreSQL orders `NaN` above every number and JSON carries neither `NaN` nor
infinities), and every rule assumes a UTF-8 database, which replay always creates (6.2). Range bound
values stay decimal strings so that `numeric` and `int8` bounds keep every digit. A bound compares
in the column's type: exactly as a decimal for the integer types and `numeric`, and for `float8` as
the nearest double, which `Number(value)` gives. A length counts code points, which
`Array.from(value).length` gives and `value.length` does not.

### 2.10 Order and serialization

- Tables, enums, domains, constraints, indexes, and policies are ordered by key, comparing UTF-16
  code units (`Array.prototype.sort` without a comparator); columns by `attnum`; enum labels by
  `enumsortorder`; `extensions` and policy `roles` by code units; `schemas` as configured.
- Sorting happens in JavaScript after the queries, so the database's collation never decides it.
- Integer-like keys (a column named `"2024"`) are an exception JavaScript imposes: object literals
  list them first, in numeric order. The output stays deterministic.

---

## 3. The public catalog (`packages/catalog-core/src/public.ts`, ADR 0005, 0009, 0010)

`toPublicCatalog(catalog, tables)` returns the slice a browser may see. `tables` is the configured
list of table keys; a key the catalog does not hold throws `TypeError` naming it, and a duplicate
key throws too. The function is pure: same inputs, same output, in the same order.

```ts
interface PublicCatalog {
  readonly format: 3;
  readonly enums: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly domains: Readonly<Record<string, PublicDomain>>;
  readonly tables: Readonly<Record<string, PublicTable>>;
}
interface PublicTable {
  readonly schema: string;
  readonly name: string;
  readonly primaryKey: ReadonlyArray<string> | null;
  readonly columns: Readonly<Record<string, PublicColumn>>;
  readonly constraints: Readonly<Record<string, PublicConstraint>>;
}
interface PublicColumn {
  readonly type: string;
  readonly typeKind: TypeKind;
  readonly array: boolean;
  readonly sqlType: string;
  readonly maxLength: number | null;
  readonly precision: number | null;
  readonly scale: number | null;
  readonly nullable: boolean;
  readonly default: PublicColumnDefault | null; // { literal }: a client may omit the column
  readonly identity: Identity | null;
  readonly generated: PublicColumnGenerated | null; // { kind, searchConfig }
}
```

- Constraints keep `kind` and `columns`, plus `nullsDistinct` and `partial` (unique), `references`
  and `enforced` (foreign key), and `rule` and `enforced` (check). They drop `definition`,
  `expression`, `validated`, and the referential actions. A UNIQUE constraint's `partial` is
  `false`.
- `enforced` is `false` for a NOT ENFORCED constraint (PostgreSQL 18), which the database never
  checks, so a consumer derives no client-facing check or error code from it (ADR 0010); its `rule`
  is `null` (8.1). The constraint stays, with its columns and reference, as documentation of the
  data. @ref https://www.postgresql.org/docs/18/sql-createtable.html
- After its constraints, in the catalog's order, a table lists each unique index whose name none of
  its constraints has, as a unique constraint keyed by the index name (ADR 0009): `columns` are its
  key columns, without INCLUDE columns, `nullsDistinct` is its own, and `partial` says whether a
  predicate limits it; the predicate stays private. PostgreSQL reports a violated unique index with
  its name in `constraint`, as it does a constraint. @ref
  https://www.postgresql.org/docs/18/protocol-error-fields.html A constraint's own index has the
  constraint's name, which PostgreSQL keeps in step when either is renamed, so the constraint stands
  for it. @ref https://www.postgresql.org/docs/18/sql-alterindex.html An index with an expression
  element stays out, and so does one whose name a CHECK or FOREIGN KEY constraint of the table has,
  which keeps the key.
- Domains keep everything but `collation`, `comment`, the default's `expression`, and the
  constraints' `expression`, `validated`, and `definition`; each domain constraint keeps `kind` and
  `rule`.
- Columns drop `collation` and `comment`, the default's `expression`, and the generation
  `expression`. Tables drop `comment`, `rowSecurity`, and `indexes`, but for the unique indexes
  above.
- `enums` and `domains` hold exactly the ones the kept columns use, directly or through a kept
  domain's base type, recursively; tables keep the order of the full catalog, not of `tables`.

---

## 4. The diff (`packages/catalog-core/src/diff.ts`, ADR 0008)

`diffCatalogs(expected, actual)` compares two catalogs structurally and returns
`{ changes: ReadonlyArray<CatalogChange> }`:

```ts
type CatalogChange =
  | { readonly kind: 'added'; readonly path: ReadonlyArray<string>; readonly actual: JsonValue }
  | { readonly kind: 'removed'; readonly path: ReadonlyArray<string>; readonly expected: JsonValue }
  | {
      readonly kind: 'changed';
      readonly path: ReadonlyArray<string>;
      readonly expected: JsonValue;
      readonly actual: JsonValue;
    };
```

- Two objects are compared member by member: a member only in `actual` is `added` with its whole
  value, one only in `expected` is `removed`, one in both recurses when both values are plain
  objects and is `changed` when the values are not equal. Arrays and scalars are compared as values
  (an enum that gained a label is one `changed` entry with both label lists).
- `path` is the member names from the root, such as
  `["tables", "contacts", "constraints", "contacts_name_length", "definition"]`.
- Changes are listed depth first, visiting the members of `expected` in order and then the members
  only `actual` has, in order; equal catalogs give an empty list.
- Catalogs of different `format` throw `TypeError`, because their members are not comparable; the
  drift command reports it as `catalog_format` (12).

`formatDiff` (10.2) groups changes by the object kind of their path: the nearest `extensions`,
`enums.<e>`, `domains.<d>`, `tables.<t>`, `columns.<c>`, `constraints.<k>`, `indexes.<i>`, or
`policies.<p>` segment.

---

## 5. Migrations (`packages/pg-catalog/src/migrations/`, ADR 0003)

A migration is `{ name, sql }`. The source is a directory path (relative to the configuration file)
or a function returning the migrations in the order they must run; a function's order is used as
given.

A directory is walked recursively; names are paths relative to it with `/` separators. Then:

1. Files whose name does not end in `.sql`, and files ending in `.down.sql`, are ignored.
2. When every remaining basename follows Flyway's naming, `V<version>__<description>.sql` files run
   first, ordered by version, and `R__<description>.sql` files run after them, ordered by
   description; `U<version>__<description>.sql` undo files never run. A version is digit groups
   separated by `.` or `_`, compared group by group as numbers (`V1_10` after `V1_9`); two files
   with the same version, or two repeatable files with the same description, fail with
   `migrations_invalid`. @ref https://documentation.red-gate.com/fd/migrations-271585107.html
3. Otherwise every remaining file except `U<version>__*.sql` runs in natural order of its name: runs
   of digits compare as numbers, everything else by UTF-16 code units, and names that compare equal
   that way (`01_a.sql`, `1_a.sql`) fall back to plain code unit order.

An empty result, or a directory that does not exist, fails with `migrations_invalid`. Files are read
as UTF-8.

---

## 6. Replay targets (`packages/pg-catalog/src/target/`, `replay.ts`, ADR 0003)

Both targets implement one session interface:

```ts
interface SqlSession {
  exec(sql: string): Promise<void>; // simple query protocol: several statements, no parameters
  query<TRow>(sql: string, params?: ReadonlyArray<unknown>): Promise<ReadonlyArray<TRow>>;
  close(): Promise<void>;
}
```

### 6.1 PGlite (`target/pglite.ts`)

The default target. `@electric-sql/pglite` is imported dynamically, so it stays an optional peer
dependency; when it is missing, extraction fails with `pglite_missing`. The instance is created in
memory with `PGlite.create({ extensions })`: a string names a contrib extension and imports
`@electric-sql/pglite/contrib/<name>` (with `-` written as `_`, so `uuid-ossp` imports `uuid_ossp`),
and an object is any PGlite extension (`{ name, setup }`, such as `@electric-sql/pglite-pgvector`),
passed through. A migration still runs `CREATE EXTENSION` itself. @ref
https://pglite.dev/extensions/

### 6.2 A server (`target/server.ts`)

With `database.url`, extraction connects with `pg` to the URL (a `postgres://` or `postgresql://`
URL), creates `nizam_catalog_<16 hex digits>` with
`CREATE DATABASE ... TEMPLATE template0 ENCODING 'UTF8'`, connects to it by replacing the URL's
path, replays and extracts, then closes that connection and drops the database in a `finally` block.
A failed drop fails an otherwise successful extraction; when the extraction itself failed, its error
is the one reported. The role needs `CREATEDB`. Roles are cluster-wide, so a migration that creates
a role must do so idempotently. @ref https://www.postgresql.org/docs/18/sql-createdatabase.html

### 6.3 Replay (`replay.ts`)

For each migration in order, the session runs `SESSION_SETTINGS` (7.1) and then the file's SQL as
one simple-protocol query, which PostgreSQL runs as one implicit transaction unless the file
controls transactions itself. A failure aborts with `migration_failed` naming the migration, the
PostgreSQL error code and message, and the line and column when PostgreSQL reports a position. @ref
https://www.postgresql.org/docs/18/protocol-flow.html#PROTOCOL-FLOW-MULTI-STATEMENT

---

## 7. Extraction (`packages/pg-catalog/src/extract/`)

`readCatalog(session, schemas)` reads one catalog. The same function serves replayed databases
(10.1) and live ones (10.2).

### 7.1 Session settings (`target/session.ts`)

Before replaying each file and before reading, the session pins the settings that change what
PostgreSQL stores or how it prints constants:

| Setting                       | Value      | Why                                                          |
| ----------------------------- | ---------- | ------------------------------------------------------------ |
| `TimeZone`                    | `UTC`      | `timestamptz` constants are converted and printed in it      |
| `DateStyle`                   | `ISO, YMD` | date and time constants are parsed and printed in it         |
| `IntervalStyle`               | `postgres` | interval constants are printed in it                         |
| `extra_float_digits`          | `1`        | float constants print with the shortest exact representation |
| `bytea_output`                | `hex`      | `bytea` constants are printed in it                          |
| `standard_conforming_strings` | `on`       | string constants with backslashes deparse without `E'...'`   |

Reading additionally sets `search_path` to the configured schemas, in order, through
`set_config('search_path', $1, false)` with each name quoted by `quote_ident`, so deparsed text
qualifies exactly the objects outside them. @ref
https://www.postgresql.org/docs/18/runtime-config-client.html

### 7.2 Queries (`extract/queries.ts`)

One query per kind of top-level object, each returning a single `json_agg(...)::text` value parsed
with `JSON.parse`, so PGlite and `pg` hand back identical data whatever their type parsers do; a
table's columns, constraints, indexes, and policies (6 to 9) are nested in its row of the tables
query (5). The queries read `pg_catalog` only: `information_schema` hides objects the current role
has no privilege on, which would make a read-only drift role see a different catalog.

1. `current_setting('server_version_num')::int`; below 140000 the extraction fails with
   `unsupported_server`. The version selects two fragments: `indnullsnotdistinct` from 150000 and
   `conenforced` from 180000, `false` and `true` respectively before.
2. Extensions: `pg_extension` joined to `pg_namespace` on `extnamespace`, in the configured schemas.
3. Enums: `pg_type` with `typtype = 'e'` in the configured schemas and not owned by an extension,
   with labels from `pg_enum`.
4. Domains: `pg_type` with `typtype = 'd'`, same filters, with the base type's `typname`, `typtype`,
   category, element type, `format_type(typbasetype, typtypmod)`, the base type resolved through
   domains with its `format_type(base, -1)`, `typtypmod`, `typnotnull`,
   `pg_get_expr(typdefaultbin, 0)`, the collation, the comment, and the `pg_constraint` rows with
   `contypid` set and `contype = 'c'`.
5. Tables: `pg_class` with `relkind in ('r', 'p')`, `not relispartition`, same filters, with
   `relrowsecurity`, `relforcerowsecurity`, and `obj_description(oid, 'pg_class')`.
6. Columns: `pg_attribute` with `attnum > 0 and not attisdropped`, with the type facts as for
   domains, `format_type(atttypid, atttypmod)`, `attnotnull`, `attidentity`, `attgenerated`,
   `pg_get_expr(adbin, adrelid)` from `pg_attrdef`, the collation name and `collisdeterministic`
   when `attcollation` differs from the type's `typcollation`, and `col_description`.
7. Constraints: `pg_constraint` with `conrelid` in the tables,
   `contype in ('p', 'u', 'f', 'c', 'x')`, and `conparentid = 0`, with `conkey`, `confkey`, and the
   referenced table mapped to names, `pg_get_constraintdef(oid)`, `pg_get_expr(conbin, conrelid)`,
   and the version fragments.
8. Indexes: `pg_index` joined to the index's `pg_class` and `pg_am`, with `indkey::int2[]`,
   `indnkeyatts`, `pg_get_expr(indpred, indrelid)`, and `pg_get_indexdef(indexrelid)`.
9. Policies: `pg_policy`, with `polroles` mapped through `pg_roles` (`0` is `public`).

@ref https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-INFO-CATALOG

### 7.3 Normalization

**Type modifiers** (`modifiers.ts`). For `varchar` and `bpchar` a modifier above 4 (`VARHDRSZ`) is
the length plus 4, as `anychar_typmodout` decodes it. For `numeric` a modifier of 4 or more encodes
precision and scale: `p = ((typmod - 4) >> 16) & 0xffff` and
`s = (((typmod - 4) & 0x7ff) ^ 1024) - 1024`, the sign-extended 11-bit scale PostgreSQL 15
introduced, which decodes PostgreSQL 14's non-negative scales the same way. For `timestamp`,
`timestamptz`, `time`, and `timetz` a modifier of 0 or more is the precision itself, the fraction
digits of a second PostgreSQL rounds a value to (`'9999-12-31 23:59:59.999999'::timestamp(3)` is
`10000-01-01 00:00:00`). Every other type gives `null` for all three, `interval` included, whose
modifier also packs the fields. An array column carries its element's modifier. @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/numeric.c @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/timestamp.c

**Default literals** (`defaults.ts`). `literal` is set only when converting it with the column
type's input function yields the stored default, which rules out defaults where the deparser hid a
cast that changes the value (a `1.5` default on an `integer` column stores `2`). The base type below
is the column's type, or for a domain the domain's base type, resolved through nested domains.

| Deparsed default                                                                                          | Accepted when the base type is                        | `literal`          |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------ |
| `'<text>'::<T>` with `<T>` the base type spelled by `format_type(type, -1)`                               | any                                                   | `<text>` unescaped |
| `true`, `false`                                                                                           | `bool`                                                | `true`, `false`    |
| an integral number: unsigned digits, or `'[-]<digits>'::<T>` with `<T>` `integer`, `bigint`, or `numeric` | `int2`, `int4`, `int8`, `numeric`, `float4`, `float8` | the number         |
| a fractional number: `<digits>.<digits>`, or `'[-]<digits>.<digits>'::numeric`                            | `numeric`, `float4`, `float8`                         | the number         |

`format_type(type, -1)` is how `get_const_expr` labels a constant: `bpchar` and `"bit"`, where
`format_type(type, NULL)` says `character` and `bit`. A constant whose label carries a modifier
(`'1 day'::interval day`) does not match and gives `null`.

Everything else (function calls, operators, `CURRENT_TIMESTAMP`, `nextval(...)`, explicit casts of
expressions, `NULL`) gives `null`. The deparse rules behind the table are those of `get_const_expr`
in PostgreSQL's `ruleutils.c`: a non-negative `int4` and a non-negative non-integral `numeric` print
bare, other numbers print quoted with a cast, and a top-level implicit cast is not printed. @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/ruleutils.c

**Search configuration** (`search-config.ts`). For a generated column of type `tsvector`,
`searchConfig` is the configuration named by every `to_tsvector('<name>'::regconfig, ...)` call in
the expression, found with the tokenizer of 8.2 so string contents never match. It is `null` when
there is no such call, when any `to_tsvector` call has another first argument, or when the calls
name different configurations. The one-argument form cannot appear: it is not immutable, and a
generation expression must be. @ref https://www.postgresql.org/docs/18/textsearch-tables.html

---

## 8. The CHECK recognizer (`packages/pg-catalog/src/recognize/`, `sql/`, ADR 0006)

`recognizeCheck(expression, subject)` returns a `Rule` or `null`. It never throws on any input.

### 8.1 Applicability

A table CHECK is a candidate when it is enforced and its `conkey` names exactly one column; a domain
CHECK always is. A NOT VALID CHECK is a candidate too, since it checks every new row. The subject is
that column (written as its name) or the domain's `VALUE`. Its **base type** is the column's or
domain's type resolved through domains.

| Rule kind | Base types                                  | Further conditions                             |
| --------- | ------------------------------------------- | ---------------------------------------------- |
| length    | `text`, `varchar`                           | not an array; deterministic collation          |
| pattern   | `text`, `varchar`                           | not an array; deterministic collation          |
| enum      | `text`, `varchar`, any enum                 | not an array; deterministic collation for text |
| range     | `int2`, `int4`, `int8`, `numeric`, `float8` | not an array                                   |
| notNull   | any                                         |                                                |

The collation is the one the CHECK compares under: the column's own for a table CHECK, and for a
domain CHECK that of the type the domain is declared over, because PostgreSQL gives `VALUE` that
type's collation rather than the domain's. A domain over `text` declared with a nondeterministic
collation therefore still gets rules, while a domain over such a domain gets none, whatever its own
collation. @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/commands/typecmds.c
(`domainAddCheckConstraint`)

`bpchar` is excluded because its comparisons, `char_length`, and casts to `text` ignore trailing
spaces; `float4` because values round to single precision before the CHECK; `citext` and other types
because their operators are not the text operators the rules describe.

Operators and functions are read by name. The deparser prints a name unqualified only when it
resolves to the same object in the session's search path, where `pg_catalog` comes first; the
recognizer accepts a `pg_catalog.` qualifier on a function and no other, a qualified operator fails
the parse, and 8.3 requires the operand types PostgreSQL's own operators take. A schema that defines
one of these operators for the exact argument types involved, such as its own `=` on an enum, is
beyond what the deparsed text shows.

### 8.2 Expressions (`sql/`)

The tokenizer reads the deparsed text: words (`[A-Za-z_][A-Za-z0-9_$]*`, case kept: the deparser
prints keywords in upper case and identifiers in lower case), quoted identifiers (`"..."` with `""`
escapes), string constants (`'...'` with `''` escapes; a prefixed constant such as `E'...'`,
`X'...'`, or `U&'...'` fails the parse), unsigned numbers, and operators and punctuation. The parser
builds a tree of `OR`, `AND`, comparisons (`=`, `<>`, `<`, `<=`, `>`, `>=`, `~`, `~*`, `!~`, `!~*`),
`= ANY (...)`, `IS [NOT] NULL`, function calls, casts (`::` followed by a type name: a word or
quoted identifier, optionally schema-qualified, with the multiword spellings `format_type` prints
such as `character varying`, `double precision`, and `timestamp(3) with time zone`, an optional
modifier, and `[]` suffixes), `ARRAY[...]`, parentheses, identifiers, and constants. It follows
PostgreSQL's precedence (the `~` family binds tighter than the comparisons, comparisons do not
associate, `IS` binds looser), flattens nested `AND`s and `OR`s, which are associative in
three-valued logic too, and matches keywords in any case. `NOT`, `TRUE`, `FALSE`, `NULL`, `ALL`,
`SOME`, a bare `ARRAY`, and any other input fail the parse, and a failed parse gives `null`. Nesting
stops at 64 levels, so hostile input cannot exhaust the stack. @ref
https://www.postgresql.org/docs/18/sql-syntax-lexical.html#SQL-PRECEDENCE

### 8.3 Shapes (`recognize/recognize.ts`, `terms.ts`, `subject.ts`, `constants.ts`)

`S` is the subject: the column's name, matched exactly when quoted and, when bare, only if the name
needs no quoting (lower-case ASCII letters, digits, and `_`, as `quote_identifier` decides), or the
bare keyword `VALUE`. `S` may stand under casts to `text` or `character varying` without a modifier
(how the deparser shows a `varchar` given to a text function or operator) and, when the subject's
own type is a domain, to the base type's spelling. The type an operator or function receives `S` as
is the outermost cast, or the subject's own type when uncast. PostgreSQL's own operators always
receive a domain through a cast, and no built-in operator takes `varchar`, so an uncast domain or
`varchar` subject means an operator of the schema's own and gives `null`. The text shapes need that
type to be `text`; the enum and range shapes need the base type.

`N` is an unsigned integer constant. `L` is a numeric constant: unsigned digits with an optional
fraction, typed as PostgreSQL types it (`integer` when it fits int4, `bigint` when it fits int8,
`numeric` otherwise or with a fraction); a quoted signed decimal cast to `smallint`, `integer`,
`bigint`, `numeric`, or `double precision`; or such a constant cast again to one of those types. No
cast in the chain may change the number or fail on every row: a cast to an integer type needs an
integral value in the type's range, a cast to `double precision` needs a finite value that does not
underflow to zero, and nothing leaves `double precision`, since `float8` to `numeric` keeps 15
significant digits. `L` must belong to the subject's family, which is what PostgreSQL's comparison
operators take without casting the subject: an integer type for `int2`, `int4`, and `int8`;
`numeric` for `numeric`; `double precision` for `float8`.

1. **Guard.** `S IS NULL OR X` and `X OR S IS NULL`, at the top or inside a conjunction, reduce to
   `X`: a CHECK passes on null anyway. When `X` is `S IS NOT NULL` the guard makes the CHECK true
   for every value, so it gives `null`.
2. **Length.** `F(S) op N` or `N op F(S)` with `F` one of `char_length`, `character_length`, and
   `length`, unqualified or in `pg_catalog`, with one argument, and `op` one of `>=`, `>`, `<=`,
   `<`, `=`. Strict bounds become inclusive (`> 0` is `min: 1`); `=` sets both bounds; a bound below
   zero gives `null`. `S <> ''` in either order, with `''` cast to `text` or `character varying`, is
   `min: 1`.
3. **Range.** `S op L` or `L op S` with `op` one of `>=`, `>`, `<=`, `<`; the bound keeps its
   inclusiveness and its value as decimal text (`'-10'::integer` is `"-10"`, `(5.0)::integer` is
   `"5"`).
4. **Membership.** `S = ANY (ARRAY[c1, ..., cn])` and
   `(S)::text = ANY ((ARRAY[c1, ..., cn])::text[])` with every `ci` a string constant cast to `text`
   or `character varying` for a text subject, or to the enum's spelling for an enum; `S = c` in
   either order is membership in one value (how the deparser prints `IN` with one element). The
   values keep the CHECK's order without repeats.
5. **Not null.** `S IS NOT NULL`.
6. **Pattern.** `S ~ '<pattern>'::text` when 8.4 accepts the pattern.
7. **Conjunction.** An `AND` of length terms, or of range terms, merges into one rule when no bound
   is set twice. Any other `AND`, any other `OR`, `NOT`, and any other shape give `null`.

### 8.4 The pattern subset (`recognize/pattern.ts`)

`translatePattern(pattern)` returns the pattern unchanged as the rule's `source` when it parses
entirely within this grammar, on which PostgreSQL's advanced regular expressions and JavaScript
regular expressions with the flags `su` agree; otherwise `null`. Every construct the grammar admits
is valid JavaScript with `su`, so an accepted pattern always compiles; the tests compile each
accepted pattern and run it through PostgreSQL 14 and 18 and through JavaScript on the same input.

```
pattern      = branch ( "|" branch )*
branch       = piece*
piece        = atom quantifier?
quantifier   = ( "*" | "+" | "?" | "{" m "}" | "{" m ",}" | "{" m "," n "}" ) "?"?   ; m <= n <= 255
atom         = literal | "." | "^" | "$" | "(" pattern ")" | "(?:" pattern ")" | bracket
literal      = any character but  ^ $ \ . * + ? ( ) [ ] { } |  ; or "\" followed by one of them or "/"
bracket      = "[" "^"? "-"? item* "-"? "]"   ; at least one "-" or item
item         = range | class-literal
range        = "0".."9" "-" "0".."9" | "a".."z" "-" "a".."z" | "A".."Z" "-" "A".."Z"  ; low <= high
class-literal = any character but  \ ] [ - ^  ; or "\" followed by one of  ^ $ \ . * + ? ( ) [ ] { } | / -
```

- `^` and `$` anchor at the start and end of the string in both (PostgreSQL is not newline-sensitive
  by default, and JavaScript without the `m` flag anchors only there); quantifiers cannot follow
  them.
- `.` and a negated bracket match any character, newline included, in both with the `s` flag, and
  match code points with the `u` flag as PostgreSQL does in a UTF-8 database.
- A bracket's ranges are code point ranges in PostgreSQL's implementation; restricting them to ASCII
  digits and letters keeps them independent of any collation.
- A `-` first or last in a bracket stands for itself in both, as in `^[a-z0-9-]+$`. Anywhere else
  outside a range PostgreSQL rejects it (`[a-z-0]` is an invalid character range), so the grammar
  does too.
- Groups nest at most 64 levels deep.
- Rejected: escapes of letters and digits (class escapes such as `\d`, constraint escapes such as
  `\b` and `\m`, back references, `\x` and `\u` escapes), lookaround, POSIX classes and collating
  elements inside brackets, embedded options such as `(?i)`, the `***` directors, a `]` at the start
  of a bracket (a literal in PostgreSQL, an empty class in JavaScript), unbalanced `]`, `{`, or `}`,
  bounds above PostgreSQL's limit of 255, and every case-insensitive operator. @ref
  https://www.postgresql.org/docs/18/functions-matching.html#POSIX-SYNTAX-DETAILS @ref
  https://tc39.es/ecma262/#sec-regexp-regular-expression-objects

---

## 9. Output files (`packages/pg-catalog/src/render/`)

Each renderer is a pure function returning the file's full text, ending in one newline.

### 9.1 Catalog modules (`render/catalog-module.ts`, ADR 0004, 0011)

```ts
// Generated by @nizam-os/pg-catalog. Do not edit: change the migrations and run `pg-catalog extract`.
const value = {
  "format": 3,
  ...
} as const;

/** The type of `catalog`, by a name compile errors print in place of its members. */
export interface ExtractedCatalog extends Readonly<typeof value> {}

export const catalog: ExtractedCatalog = value;
```

`renderCatalogModule(catalog, options?)` writes the header line, then `const value = `, then
`JSON.stringify(catalog, null, 2)`, then ` as const;`, an empty line, the doc comment, the line
`export interface <name> extends Readonly<typeof value> {}`, an empty line, and
`export const catalog: <name> = value;`, where `<name>` is `options.interface` or
`ExtractedCatalog`. `renderPublicCatalogModule(publicCatalog, options?)` does the same with the
binding `publicCatalog` and the default `ExtractedPublicCatalog`. A name outside `INTERFACE_NAME`,
`^[A-Z][A-Za-z0-9_]*$`, throws `TypeError`
(`renderCatalogModule: options.interface must be an ASCII identifier that starts with an uppercase letter, not "x"`):
every keyword and predefined type name is lowercase, so no such name is one.

The interface restates no member. TypeScript prints an interface by its name and an anonymous object
type member by member, so a compile error in code typed by the catalog names it
(`DeclareContext<ContactsPublicCatalog, ...>`) instead of cutting a dump of it short, and the
printing no longer dominates the time the error takes to check (ADR 0011). A consumer names the
types with the interface, or with `typeof catalog`, which is the interface. @ref
https://www.typescriptlang.org/docs/handbook/2/objects.html#extending-types

`parseCatalogModule(text)` takes the text between the first `= ` and the last ` as const;`, which no
line after the literal holds, so it also reads a module written before the literal had a private
name. It parses that text with `JSON.parse` and returns it as a `Catalog` when it is an object whose
`format` equals `CATALOG_FORMAT` and whose `schemas`, `extensions`, `enums`, `domains`, and `tables`
have the model's shapes; another format throws `catalog_format`, anything else `catalog_unreadable`.

### 9.2 Kysely types (`render/kysely-types.ts`, `render/kysely-mapping.ts`, `render/kysely-node-postgres.ts`, `render/kysely-pglite.ts`, `render/kysely-names.ts`, `render/key-names.ts`, ADR 0007, ADR 0013)

`renderKyselyTypes(catalog, options)` writes, in order and separated by blank lines: the header
line, `import type { ... } from 'kysely';` naming the Kysely types the file uses, sorted, and the
configured `imports`, verbatim; the helper types the file uses, in the order `JsonValue`,
`JsonParameter`, `PostgresInterval`, `Point`, `Circle`; one `export type <Name> = '<label>' | ...;`
per enum, by key (`never` for an enum without labels); one `export interface <Name>Table` per table,
by key, with its columns in order; and `export interface DB` mapping each table key to its
interface. An interface without members is written `{}`.

`options.driver` (`types.driver`) selects the type table: `'node-postgres'`, the default, for
node-postgres behind Kysely's `PostgresDialect`, PGlite served over pglite-socket included, or
`'pglite'` for PGlite's own `query()`, which Kysely's `PGliteDialect` calls (ADR 0013). In both
tables the select type is what the driver's default parsers return, and the insert and update types
are the values its serializers send as what they are, with `string` where the serializer passes
PostgreSQL's text through. PostgreSQL reports a domain column with its base type's OID, so a domain
reads as its base type. @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/common/printtup.c

**node-postgres** parses with pg-types 2.x. It sends a JavaScript array as a PostgreSQL array
literal and any other object without `toPostgres` as JSON, so neither a parsed point or circle nor a
JSON array or string can be sent back, and those types are written as text. An array of a domain has
an array type of its own, which pg-types does not parse. @ref
https://github.com/brianc/node-pg-types/blob/v2.2.0/lib/textParsers.js @ref
https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/utils.js (prepareValue)

| `type`                                                                                                                         | Select             | Insert and update            |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------------------- |
| `int2`, `int4`, `oid`, `float4`, `float8`                                                                                      | `number`           | `number`                     |
| `int8`                                                                                                                         | `string`           | `string \| number \| bigint` |
| `numeric`                                                                                                                      | `string`           | `string \| number`           |
| `bool`                                                                                                                         | `boolean`          | `boolean`                    |
| `date`, `timestamp`, `timestamptz`                                                                                             | `Date`             | `Date \| string`             |
| `interval`                                                                                                                     | `PostgresInterval` | `PostgresInterval \| string` |
| `bytea`                                                                                                                        | `Buffer`           | `Buffer`                     |
| `json`, `jsonb`                                                                                                                | `JsonValue`        | `string` (JSON text)         |
| `point`                                                                                                                        | `Point`            | `string`                     |
| `circle`                                                                                                                       | `Circle`           | `string`                     |
| an enum                                                                                                                        | the label union    | the label union              |
| every other type (`text`, `varchar`, `bpchar`, `uuid`, `citext`, `time`, `inet`, `money`, `tsvector`, composites, ranges, ...) | `string`           | `string`                     |

**PGlite** (0.5, ADR 0013) has parsers for `int2`, `int4`, `oid`, `float4`, `float8`, `int8`,
`bool`, `date`, `timestamp`, `timestamptz`, `bytea`, `json`, and `jsonb`, and returns every other
type as text. Its `int8` parser returns a number within ±(2^53 − 1) and a `bigint` beyond. Its
`bytea` serializer takes only a `Uint8Array`; its `json` serializer sends a string as it is, as JSON
text, and any other value through `JSON.stringify`, so the insert type is the helper
`JsonParameter`, a JSON value whose strings are JSON text. PGlite asks PostgreSQL for each
parameter's type and sends a value of a type it has no serializer for with `toString()`. @ref
https://github.com/electric-sql/pglite/blob/%40electric-sql/pglite%400.5.8/packages/pglite/src/types.ts
@ref
https://github.com/electric-sql/pglite/blob/%40electric-sql/pglite%400.5.8/packages/pglite/src/base.ts
(`_initArrayTypes`, `#runQuery`)

| `type`                                                                                              | Select             | Insert and update            |
| --------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------- |
| `int2`, `int4`, `oid`, `float4`, `float8`                                                           | `number`           | `number`                     |
| `int8`                                                                                              | `number \| bigint` | `string \| number \| bigint` |
| `numeric`                                                                                           | `string`           | `string \| number`           |
| `bool`                                                                                              | `boolean`          | `boolean`                    |
| `date`, `timestamp`, `timestamptz`                                                                  | `Date`             | `Date \| string`             |
| `bytea`                                                                                             | `Uint8Array`       | `Uint8Array`                 |
| `json`, `jsonb`                                                                                     | `JsonValue`        | `JsonParameter`              |
| an enum                                                                                             | the label union    | the label union              |
| every other type (`text`, `interval`, `point`, `circle`, `uuid`, `citext`, composites, ranges, ...) | `string`           | `string`                     |

- **Arrays.** pg-types parses the arrays of `bool`, `int2`, `int4`, `oid`, `int8` (strings),
  `float4`, `float8`, `numeric` (as floats, so `Array<number>`), `bpchar`, `varchar`, `text`,
  `regproc`, `uuid`, `inet`, `cidr`, `macaddr`, `money`, `time`, `timetz`, `numrange`, `date`,
  `timestamp`, `timestamptz`, `interval`, `bytea`, `json`, `jsonb`, and `point`: the select type is
  `Array<element select type>`, and insert and update take `Array<element insert type> | string`.
  Every other array, arrays of enums and of domains included, comes back as PostgreSQL's array text:
  `string` on select, `Array<element insert type> | string` on insert and update. PGlite parses and
  serializes every array with its element type's own parser and serializer: the select type is
  `Array<element select type>`, `Array<string>` for an array of a domain, which has neither, and
  insert and update take `Array<element insert type> | string`. PGlite registers the array types
  when it starts and on `refreshArrayTypes()`; an array of a type created after that, such as an
  enum a migration adds, comes back as array text and refuses a JavaScript array until the next
  call, so these types hold once the application calls it after such migrations, and in every later
  session. A domain over an array reads as that array (its parameter: see the next item). The types
  assume one-dimensional arrays without null elements; both drivers return nested arrays and `null`
  elements as they are. @ref https://pglite.dev/docs/api#refresharraytypes
- **Domain parameters.** PostgreSQL types the parameter of an insert or update of a domain column as
  the domain. node-postgres serializes a value the same whatever its parameter's type, so a domain
  takes its base type's insert type. PGlite has no serializer for a domain and sends `toString()`,
  which writes PostgreSQL's text only for strings, numbers, bigints, and booleans: with PGlite, a
  domain over `date`, `timestamp`, `timestamptz`, `bytea`, `json`, `jsonb`, or an array takes
  `string`, and a domain over any other type its base type's insert type. A comparison types its
  parameter as the base type, so values in `where` keep their serializers.
- **PGlite and time zones.** PGlite writes a `Date` as `toISOString()` and reads `timestamp` text
  with `new Date(text)`, in the process's local time zone, so a `Date` round-trips through a
  `timestamp` column only in a process running in UTC. The types do not show it.
- **Nullability.** A nullable column adds `| null` to its select type. Its insert and update types
  add it only when every domain its type passes through is nullable as well: PostgreSQL refuses null
  for a NOT NULL domain on write, yet a column of one can read as null, since an empty scalar
  sub-select stores one unchecked. `unknown` takes no `| null`. Types follow NOT NULL markers only;
  a `CHECK (x IS NOT NULL)` becomes a rule (2.9). @ref
  https://www.postgresql.org/docs/18/sql-createdomain.html (Notes)
- **Defaults.** A column with a default, `identity: 'byDefault'`, or a domain with a default along
  its chain is optional on insert: `Generated<S>` when its three types are equal, otherwise
  `ColumnType<S, I | undefined, U>`. An `identity: 'always'` or generated column is
  `GeneratedAlways<S>`. Any other column is its type when the three are equal, otherwise
  `ColumnType<S, I, U>`.
- **Types outside the catalog.** A domain defined outside the configured schemas maps to `unknown`
  in all three positions, since its base type is not known, and an enum defined outside them to
  `string`.
- **Overrides.** `types.overrides` keys are a `type`, or `<type>[]` for its arrays, and values a
  TypeScript type for all three positions or `{ select, insert?, update? }`, the missing positions
  taking `select`'s type. The override of a column's own type wins; otherwise a domain resolves
  toward its base type and the nearest override along the chain wins. pg-types registers each array
  parser under the array type's OID, so an override of `<type>` leaves a parsed array of it to the
  table; an array returned as text takes the element's insert type, overrides included. PGlite
  parses and serializes array elements with the element type's parser and serializer, the
  application's included, so with PGlite an override of `<type>` also types the elements of
  `<type>[]`, except under a domain, whose elements stay text. An override is kept as written under
  a domain with either driver. An override names no helper, so the types it mentions come from
  `imports`. @ref https://github.com/brianc/node-pg-types/blob/v2.2.0/lib/textParsers.js (init)
- **Helpers.** `JsonValue` is any JSON value. `JsonParameter`, which only the PGlite table uses, is
  `string | number | boolean | Array<JsonValue> | { [key: string]: JsonValue }` with a doc comment
  saying a string is JSON text. `PostgresInterval` is the object postgres-interval 1.x returns, and
  `Point` and `Circle` the objects pg-types returns. Every helper's name is reserved under either
  driver, so switching drivers cannot introduce a `name_collision`.
- **Names.** `<Name>` is the reference name in PascalCase: split at every character outside
  `[A-Za-z0-9]`, upper-case the first character of each part, join, and prefix `_` when the result
  is empty or starts with a digit. Two objects with the same name, or an object named like a helper,
  `ColumnType`, `Generated`, `GeneratedAlways`, or `DB`, fail with `name_collision`. Member names
  that are not identifiers, and enum labels, are written as single-quoted literals with `\`, `'`,
  the line terminators (U+2028 and U+2029 included), and every other control character escaped.
- **camelCase.** With `types.camelCase`, table and column keys are the names Kysely's
  `CamelCasePlugin` gives them, so `contact_phones.phone_number` is written
  `contactPhones.phoneNumber`; type names do not change. The schema and the table of a
  `schema.table` key convert separately, as the plugin converts each identifier. The options are the
  plugin's `upperCase`, `underscoreBeforeDigits`, and `underscoreBetweenUppercaseLetters`, and must
  match the application's. In queries the plugin turns each key back with its snake-case conversion,
  so a key works only when that gives the database name again: `line_1` becomes `line1`, which turns
  back into `line1`. Every name that does not survive the round trip is listed in one
  `camel_case_mismatch`. The conversions are `toCamelCase` and `toSnakeCase` of
  `@nizam-os/catalog-core`, a port of the plugin's that `render/key-names.test.ts` runs against the
  plugin itself over every short string, and that `@nizam-os/resource-core` also derives public
  names with. Unless `maintainNestedObjectKeys` is set, the plugin also camelCases the keys of
  objects inside parsed `json` and `jsonb` values, while values written keep their keys. @ref
  https://github.com/kysely-org/kysely/blob/v0.28.17/src/plugin/camel-case/camel-case.ts @ref
  https://kysely.dev/docs/plugins#camel-case-plugin

---

## 10. Commands (`packages/pg-catalog/src/commands/`)

### 10.1 extract and extract --check (`commands/extract.ts`)

`extractCatalog({ migrations, database, schemas, cwd })` loads the migrations (5), opens the target
(6), replays (6.3), reads the catalog (7), and closes the target, returning the `Catalog`.

`extract(config, { check, cwd })` calls `extractCatalog`, renders the catalog module, the public
module when `out.public` is set (with `toPublicCatalog`, whose `TypeError` becomes
`public_table_unknown`), and the Kysely types when `out.types` is set, then compares each with the
file on disk byte for byte. Without `check` it writes the files that differ (creating directories)
and reports each as `written` or `unchanged`; with `check` it writes nothing and reports each as
`unchanged`, `stale`, or `missing`. It returns `{ catalog, files }` with `files` in the order
catalog, public, types.

### 10.2 drift (`commands/drift.ts`, `commands/format-diff.ts`, ADR 0008)

`introspectCatalog({ url, schemas })` connects with `pg`, pins `SESSION_SETTINGS`, opens
`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, reads the catalog (7), rolls back, and
disconnects; it replays nothing and cannot write. Before reading it checks
`has_schema_privilege(oid, 'USAGE')` for every configured schema that exists and fails with
`schema_usage` when one is missing: PostgreSQL leaves such a schema out of the role's effective
`search_path`, so every name in it would deparse qualified and show up as drift. A configured schema
that does not exist is read as empty. `drift(config, environment, { cwd })` reads the committed
catalog file with `parseCatalogModule`, introspects the environment's URL with the configured
schemas, and returns `{ environment, diff: diffCatalogs(committed, live) }`. An environment that is
not an own member of `config.drift`, or a URL function that returns nothing, fails with
`config_invalid`; a committed file that cannot be read fails with `catalog_unreadable`. These fail
before any connection is made.

`formatDiff(diff)` returns `No differences` for an empty diff. Otherwise it returns a summary line,
`<n> objects differ: <a> added, <r> removed, <c> changed` with the zero counts left out, then one
section per object kind (4) that has changes, in the order Catalog, Extensions, Enums, Domains,
Tables, Columns, Constraints, Indexes, Policies, separated by blank lines. A section is its heading
and one line per object, in the order the diff first names it: two spaces, `+` (only in the live
database), `-` (only in the committed catalog), or `~`, and the object's name qualified by the
objects above it (`contacts.email`). A change to a whole value, such as an enum's labels, follows
the name as `: expected <json>, actual <json>`; each changed member gets a line of its own, indented
six spaces, with its path inside the object and `expected <json>, actual <json>`, `added <json>`, or
`removed <json>`. A member of the catalog itself, such as `schemas`, is its own object under
Catalog. The text is for people and may change between minor versions; the CLI's `--json` output
(the `CatalogDiff` itself) is the stable machine format.

### 10.3 rules --check (`commands/rules.ts`, `oracle/`, `commands/format-rules.ts`, ADR 0012)

`checkRules(config, { cwd })` runs the fixtures of the declared resources through their schemas and
through the database the migrations build, and reports where the two disagree. The cases come from
`oracleCases` of `@nizam-os/resource-core/testing` (resource SPEC 7.3): each names a probe (copies
of a table's columns holding some of its CHECKs, or a value of a domain), and each fixture carries
the texts to write and a judge of the database's verdict. This package builds the probes, writes the
texts, and hands each verdict to its judge; what the schemas say is resource-core's to decide.

1. Without `config.resources`, it fails with `config_invalid`
   (`resources is not configured: set resources.registry to a function that returns the declared resources`).
2. It imports `@nizam-os/resource-core/testing`; an optional peer dependency (14) that cannot be
   loaded fails with `resource_core_missing`
   (`rules --check needs @nizam-os/resource-core, whose declarations it checks: <reason>`).
3. It calls and awaits `resources.registry()`. Anything but an array of objects is
   `registry_invalid` (`resources.registry must return an array of declared resources`); what the
   function throws is thrown.
4. `oracleCases(registry, { storage: resources.storage })` builds the cases. A `TypeError` whose
   message starts with `oracleCases:` or `oracleCases.`, a registry the checks of resource SPEC 4.2
   refuse or a codec without a storage codec, becomes `registry_invalid` with the message
   `rules: <message>`; anything else is thrown.
5. It loads the migrations (5), opens the target (6), replays (6.3), reads the catalog (7) under the
   configured schemas, runs the cases in order, and closes the target, dropping a server's throwaway
   database. It returns `{ cases, unusedTables }`.

**The attempt function** (`oracle/probe-sql.ts`, `oracle/attempt.ts`). Before the first case it
creates `pg_temp.nizam_attempt(template text, fixtures json) returns json` in PL/pgSQL. For each
fixture, an array of texts and nulls, it runs `execute format(template, variadic texts)` in a block
with an `exception when others` handler, which PL/pgSQL runs as a subtransaction, and records
`{ "accepted": true, "stored": [...] }` or `{ "accepted": false, "code": ..., "constraint": ... }`
from `get stacked diagnostics` (`returned_sqlstate`, `constraint_name`, an empty name read as
`null`). A case's fixtures take one query, and no refusal reaches the client: PGlite fails every
statement after about 1,800 errors returned to the client on one instance, and the tests run 3,000
refusals through one. @ref
https://www.postgresql.org/docs/18/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING @ref
https://github.com/electric-sql/pglite/issues/1115

**The template** is
`insert into pg_temp.nizam_probe ("a", "b") values (%L, %L) returning array["a"::text, "b"::text]`,
with `%` doubled in quoted identifiers. `format`'s `%L` writes each text as a quoted literal, or
`NULL`, so the column reads it with its input function and assignment semantics, as it reads an
untyped parameter: `'abcd'` into `varchar(3)` is refused with 22001, `'1.005'` into `numeric(5,2)`
is stored as `1.01`. An explicit cast would truncate the first. @ref
https://www.postgresql.org/docs/18/functions-string.html#FUNCTIONS-STRING-FORMAT

**The probe** (`oracle/probe.ts`) is `create temporary table nizam_probe (...)`, read from the
replayed database rather than the catalog file:

- for a `columns` probe, one column per case column,
  `"name" <format_type> [collate "schema"."collation"] [not null]`: the column's type with its
  modifier, so a domain brings its CHECKs and NOT NULL; its collation when it differs from the
  type's; and NOT NULL when the case keeps it (`notNull`) and the column has it. Each named CHECK
  follows as `constraint "name" check (<expression>)`, the expression
  `pg_get_expr(conbin, conrelid)` deparses under the search path extraction pinned (7.1), so a
  function the CHECK calls resolves as it did. The table's other CHECKs, its keys, and its foreign
  keys are not copied;
- for a `domain` probe, one column `"value"` of the domain, qualified, so its CHECKs and NOT NULL
  judge every fixture.

A table, column, CHECK (a CHECK constraint of the table by that name), or domain the replayed
database does not hold is the case's `problem`, reported instead of run:
`the replayed database has no table <t>`, `no column <t>.<c>`, `no CHECK <name> on <t>`, or
`no domain <d>`. A probe PostgreSQL refuses to create is
`the probe could not be built: <message> (SQLSTATE <code>)`. The probe is dropped after its case.

**Fixtures** (`oracle/run-cases.ts`). An unwritable fixture (resource SPEC 7.3) is a disagreement
with its own reason and is never sent. A writable fixture's texts go as the drivers send a
parameter: as UTF-8, so an unpaired surrogate arrives as U+FFFD; a text holding U+0000 gets the
verdict PostgreSQL gives it on arrival, `22021` with no constraint, without being sent, since JSON
could not carry it into a text either. Each verdict goes to the fixture's judge, and a reason it
returns is a disagreement. @ref https://www.postgresql.org/docs/18/multibyte.html

```ts
interface RulesReport {
  readonly cases: ReadonlyArray<RuleCaseReport>; // in the order of oracleCases
  readonly unusedTables: ReadonlyArray<string>;
}
interface RuleCaseReport {
  readonly subject: string; // `contacts.email`, `meetings.during (codec timeRange)`
  readonly kind: 'field' | 'relationship' | 'validator' | 'codec';
  readonly fixtures: number;
  readonly problem: string | null; // why the case could not run
  readonly disagreements: ReadonlyArray<RuleDisagreement>;
}
interface RuleDisagreement {
  readonly label: string; // `maxLength 40, plus one`, `reject[0]`
  readonly value: unknown; // the fixture as the schema saw it
  readonly reason: string; // `the schema accepts it; the database refuses it (23514 teams_name_check)`
}
```

`unusedTables` lists, in configuration order, the tables of `out.public.tables` that no declared
resource reads: the public catalog ships them to browsers, but no resource serves them.

`formatRules(report)` gives the summary line, `<n> cases, <m> fixtures: no disagreements`, or with
`<d> disagreements` and `<c> cases could not run` joined by `, `, each noun singular for one; then,
after a blank line, each case with a problem or a disagreement: its subject, then
`  could not run: <problem>` or one line per disagreement, `  <label> <value>: <reason>`; then,
after a blank line, `warning: out.public.tables lists <table>, which no declared resource reads` for
each unused table. A value is JSON where JSON writes it as itself, and JavaScript's notation where
it does not (`NaN`, `-0`, `10n`, `undefined`, `Symbol(x)`, `[function f]`,
`Date(2026-01-05T09:00:00.000Z)`, `[cycle]` where an object holds itself; `commands/show-value.ts`),
since a registry's fixtures are any values; it is cut after 60 code points with `…`, and a string's
with its length, `(70 characters)`. The text is for people and may change between minor versions;
the report is the format for machines.

### 10.4 surface and surface --check (`commands/surface.ts`, `commands/format-surface.ts`)

`writeSurface(config, { cwd })` and `checkSurface(config, { cwd })` keep the snapshot of the API
surface of the declared resources that resource SPEC 13.2 describes: `surfaceOf(registry)` of
`@nizam-os/resource-core/openapi`, committed next to the catalog, and compared with the declarations
by `diffSurfaces`, which marks each change breaking or safe. Neither loads the migrations or opens a
database; the surface comes from the declarations alone.

1. Without `config.resources`, it fails with `config_invalid`, as `rules --check` does (10.3); with
   it but without `resources.surface`, with `config_invalid`
   (`resources.surface is not configured: set it to the file the surface is written to, such as api-surface.json`).
2. It imports `@nizam-os/resource-core/openapi`; an optional peer dependency (14) that cannot be
   loaded fails with `resource_core_missing`
   (`surface needs @nizam-os/resource-core, whose declarations it describes: <reason>`).
3. It calls and awaits `resources.registry()`, with the failures of 10.3 step 3.
4. `surfaceOf(registry)` gives the surface. A `TypeError` whose message starts with `surfaceOf:` or
   `surfaceOf.`, a registry the checks of resource SPEC 4.2 refuse, becomes `registry_invalid` with
   the message `surface: <message>`; anything else is thrown.

The file is `resources.surface`, resolved against `cwd`, and its text is the surface as JSON
indented by two spaces with a final newline, deterministic since the surface is (resource SPEC
13.2). `writeSurface` writes it, creating directories, unless the file already holds those bytes,
and returns `{ file, status }` with `status` `written` or `unchanged`. `checkSurface` writes nothing
and returns `{ file, status, changes }`:

- `missing` when there is no file, with no changes;
- otherwise the file is parsed as JSON and read with `parseSurface`; a file that is not JSON fails
  with `surface_unreadable`
  (`the surface file <file> does not hold valid JSON; write it again with pg-catalog surface`), and
  one `parseSurface` refuses, such as a surface of another `format`, with `surface_unreadable` and
  its message
  (`the surface file <file> is not a surface this version reads (<message>); write it again with pg-catalog surface`);
- then `changes` is `diffSurfaces(committed, current)`, in its order, and `status` is `changed` when
  there is one and `unchanged` when there is none, however the file is formatted.

`formatSurface(report, file)` gives `<file>: missing; write it with pg-catalog surface`,
`<file>: no changes`, or the summary line `<file>: <n> changes, <b> breaking` (`1 change` for one,
`none breaking` when none is), then, after a blank line, the heading `Breaking` and its changes, the
heading `Safe` and its changes (a heading without changes is left out), each in the diff's order,
and finally `Run pg-catalog surface to record them.`, the parts separated by blank lines. A change
is a line of its own, two spaces in: `+` for an addition, `-` for a removal, or `~`, a space, the
path joined with `.`, each segment that is not letters, digits, `_`, and `-` written as a JSON
string (`tasks.fields.status.options."in progress"`), and for a changed value
`: <before> -> <after>`, each as `showShort` writes it: as `showValue` (10.3) writes it, cut after
60 code points with `…`. The text is for people and may change between minor versions; the report is
the format for machines.

---

## 11. Configuration and the CLI

### 11.1 `defineExtraction(config)` (`config.ts`, `config-file.ts`)

```ts
interface ExtractionConfig {
  readonly migrations: string | MigrationSource;
  readonly database?: DatabaseConfig; // default { pglite: {} }
  readonly schemas?: ReadonlyArray<string>; // default ['public']; the first is the default schema
  readonly out: OutputConfig;
  readonly drift?: Readonly<Record<string, DriftEnvironment>>;
  readonly resources?: ResourcesConfig;
}
type MigrationSource = () => ReadonlyArray<Migration> | Promise<ReadonlyArray<Migration>>;
interface Migration {
  readonly name: string;
  readonly sql: string;
}
type DatabaseConfig =
  | { readonly pglite: { readonly extensions?: ReadonlyArray<string | PgliteExtension> } }
  | { readonly url: string | (() => string | undefined) };
interface PgliteExtension {
  readonly name: string;
  readonly setup: (...args: never) => unknown;
}
interface OutputConfig {
  readonly catalog: string | CatalogFileConfig;
  readonly public?: PublicFileConfig;
  readonly types?: string | TypesConfig;
}
interface CatalogFileConfig {
  readonly file: string;
  readonly interface?: string; // default 'ExtractedCatalog'
}
interface PublicFileConfig {
  readonly file: string;
  readonly tables: ReadonlyArray<string>;
  readonly interface?: string; // default 'ExtractedPublicCatalog'
}
interface TypesConfig {
  readonly file: string;
  readonly driver?: KyselyDriver; // default 'node-postgres'
  readonly overrides?: Readonly<Record<string, string | TypeOverride>>;
  readonly imports?: ReadonlyArray<string>;
  readonly camelCase?: boolean | CamelCaseOptions; // default false
}
type KyselyDriver = 'node-postgres' | 'pglite';
interface TypeOverride {
  readonly select: string;
  readonly insert?: string;
  readonly update?: string;
}
interface CamelCaseOptions {
  readonly upperCase?: boolean;
  readonly underscoreBeforeDigits?: boolean;
  readonly underscoreBetweenUppercaseLetters?: boolean;
}
interface DriftEnvironment {
  readonly url: string | (() => string | undefined);
}
interface ResourcesConfig {
  readonly registry: () => ReadonlyArray<object> | Promise<ReadonlyArray<object>>; // the declared resources
  readonly storage?: Readonly<Record<string, TextStorageCodec>>; // by codec name, for rules --check
  readonly surface?: string; // the surface snapshot file, for surface
}
interface TextStorageCodec {
  readonly read: (stored: string) => unknown; // the text PostgreSQL prints, to the codec's value
  readonly write: (value: never) => string; // the codec's value, to the text PostgreSQL reads
}
```

`resources.registry` returns the resources `declareResource` built, typically by importing the
module that lists them, so only `rules --check` and `surface` load the declarations and the schemas
they import. `resources.storage` gives a storage codec over text for every codec a declared field
names (resource SPEC 7.1): the oracle writes text and reads text, whatever the driver of the
application's own storage adapter converts. `resources.surface` is the file `surface` writes the API
surface to and `surface --check` compares, relative to the configuration file.

`defineExtraction` validates eagerly and returns the config unchanged; a mistake throws `TypeError`
naming the option. It rejects unknown keys at every level (a misspelled `postgres:` fails instead of
being ignored), empty strings, a `database` with both or neither of `pglite` and `url`, schema names
that are empty, longer than 63 bytes, starting with `pg_`, or equal to `information_schema`,
duplicate schemas or public tables, an empty `public.tables`, an `out.types.driver` other than
`'node-postgres'` and `'pglite'`, an interface name outside `INTERFACE_NAME` (9.1) or one both
modules share (`out.public.interface must differ from the catalog's interface, ExtractedCatalog`),
and environment names outside `^[A-Za-z0-9][A-Za-z0-9_-]*$`, a `resources.registry` that is not a
function, a storage codec whose `read` or `write` is not one
(`resources.storage.vector.write must be a function`), and a `resources.surface` that is not a
non-empty string; the registry is not called. Each message starts with `defineExtraction: ` and
names the option by its path (`out.types.camelCase.upperCase must be a boolean`); an option set to
`undefined` counts as absent, as a JavaScript configuration may write it. URL functions are called
only when a command needs the URL, so a missing environment variable only fails the command that
needs it. Relative paths resolve against the configuration file's directory, or the `cwd` option of
the programmatic API.

The CLI loads `--config <file>`, or else the first of `pg-catalog.config.ts`,
`pg-catalog.config.mts`, `pg-catalog.config.js`, and `pg-catalog.config.mjs` in the working
directory, with a dynamic `import()`; the default export must pass `defineExtraction`'s validation.
A file that does not exist, fails to import, has no default export, or fails validation is a
`config_invalid` naming it, as is a working directory without one. A TypeScript configuration needs
a runtime that strips types: Node.js 22.18 or later, Node.js 22.12 to 22.17 with
`--experimental-strip-types` (which `NODE_OPTIONS` can carry), Bun, or Deno. Where Node.js does not
strip types it reports the file as an unknown extension, and the message says what to do instead.
@ref https://nodejs.org/api/typescript.html

### 11.2 The CLI (`cli.ts`, `cli/arguments.ts`, `cli/main.ts`)

```
pg-catalog extract [--check] [--config <file>]
pg-catalog drift --env <name> [--json] [--config <file>]
pg-catalog rules --check [--config <file>]
pg-catalog surface [--check] [--config <file>]
pg-catalog --help
pg-catalog --version
```

Arguments are parsed with `node:util`'s `parseArgs` in strict mode, so an unknown option or a
missing value fails; options may come before or after the command, and `--name=value` works. Results
go to standard output; errors go to standard error as `pg-catalog: <message>`. @ref
https://nodejs.org/api/util.html#utilparseargsconfig

- `--help` (`-h`) prints the usage and `--version` (`-v`) the installed package's version, wherever
  they appear; both exit 0.
- `extract` prints one line per file, in the order of 10.1: the status padded to nine characters, a
  space, and the path relative to the working directory. `--config` resolves against the working
  directory, and the configuration's own paths against its directory.
- `drift` prints `formatDiff` (10.2), or with `--json` the `CatalogDiff` as JSON indented by two
  spaces.
- `rules --check` prints `formatRules` (10.3). `rules` has no form that writes, so without `--check`
  it is a usage error (`rules needs --check`), as are `--env` and `--json`.
- `surface` prints its file's status as `extract` prints a file's line, and `surface --check` prints
  `formatSurface` (10.4) with the path relative to the working directory; `--env` and `--json` are
  usage errors.
- A missing or unknown command, an extra argument, an option the command does not take, and `drift`
  without `--env` are usage errors, followed by `Run pg-catalog --help for usage.` A
  `PgCatalogError` prints its message. Any other error, such as one a function of the configuration
  throws, prints its stack.

| Command           | 0                        | 1                                            | 2                                                            |
| ----------------- | ------------------------ | -------------------------------------------- | ------------------------------------------------------------ |
| `extract`         | files written or current | (never)                                      | usage error, configuration, replay, or database failure      |
| `extract --check` | every file current       | a file is stale or missing                   | as above                                                     |
| `drift`           | no differences           | differences                                  | as above, or an unreadable committed catalog                 |
| `rules --check`   | no disagreements         | a disagreement, or a case that could not run | as `extract`, or a registry that cannot be loaded or checked |
| `surface`         | file written or current  | (never)                                      | as `rules --check`                                           |
| `surface --check` | no change, or safe ones  | a breaking change, or no file                | as `rules --check`, or an unreadable file                    |

---

## 12. Errors (`packages/pg-catalog/src/errors.ts`)

Commands throw `PgCatalogError` (`isPgCatalogError` narrows it) with a `code`, a message naming the
object or file involved, and the PostgreSQL error as `cause` where there is one. The CLI exits 2 on
all of them. `defineExtraction` and `toPublicCatalog` throw `TypeError` for programming mistakes.

| `code`                  | Raised when                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config_invalid`        | no configuration file, a file that fails to load or validate, an unknown environment, a URL function returning nothing, or a malformed contrib extension name                                                          |
| `pglite_missing`        | the PGlite target is used and `@electric-sql/pglite` is not installed, or a contrib extension name does not exist                                                                                                      |
| `migrations_invalid`    | the directory is missing or holds no migrations, or two Flyway migrations share a version or a repeatable description                                                                                                  |
| `migration_failed`      | a migration fails during replay                                                                                                                                                                                        |
| `connection_failed`     | connecting, creating, or dropping a database fails; the message ends with the driver's or the server's reason (`connect ECONNREFUSED 127.0.0.1:5432`, `database "app" does not exist`), which never holds the password |
| `unsupported_server`    | the server is older than PostgreSQL 14, or returns a catalog code this version does not know                                                                                                                           |
| `schema_usage`          | the drift role lacks `USAGE` on a configured schema                                                                                                                                                                    |
| `unsafe_name`           | an object to be written as a key is named `__proto__`                                                                                                                                                                  |
| `duplicate_key`         | two objects map to the same reference name                                                                                                                                                                             |
| `public_table_unknown`  | `out.public.tables` names a table the catalog does not hold                                                                                                                                                            |
| `name_collision`        | two objects map to the same TypeScript name                                                                                                                                                                            |
| `camel_case_mismatch`   | with `types.camelCase`, table or column keys that `CamelCasePlugin` would not turn back into their names; the message lists every one                                                                                  |
| `catalog_unreadable`    | the committed catalog file is missing or not a catalog module                                                                                                                                                          |
| `catalog_format`        | the committed catalog was written in another `format`                                                                                                                                                                  |
| `resource_core_missing` | `rules --check` cannot import `@nizam-os/resource-core/testing`, or `surface` its `openapi` entry; the message ends with the reason                                                                                    |
| `registry_invalid`      | `resources.registry` returns anything but an array of objects, or `oracleCases` refuses the registry or the storage codecs, with its message after `rules: `, or `surfaceOf` the registry, after `surface: `           |
| `surface_unreadable`    | the committed surface file is not JSON, or not a surface `parseSurface` reads, such as one of another format                                                                                                           |

---

## 13. Test plan

One Vitest run with a project per package, `typecheck` enabled for `*.test-d.ts`, and V8 coverage
thresholds of 90% over `packages/*/src/`. Every test names the rule or choice it pins. Extraction is
database code, so `@nizam-os/pg-catalog`'s own tests run it against PGlite in-process, a real
PostgreSQL 18; nothing is mocked.

| Area                  | Files                                                                                                                                                                                                                                                                                                                                                           | What is pinned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core                  | `public.test.ts`, `public-unique-indexes.test.ts`, `diff.test.ts`, `model.test-d.ts`, `json.test.ts`                                                                                                                                                                                                                                                            | every kept and dropped member, `enforced: false` on NOT ENFORCED, the unique indexes that join the constraints, enum and domain closure, ordering, change paths and order, format mismatch, generated literals assignable to the model                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Migrations            | `order.test.ts`, `load.test.ts`                                                                                                                                                                                                                                                                                                                                 | Flyway detection and ordering, natural order, ignored and undo files, duplicates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Normalization         | `modifiers.test.ts`, `defaults.test.ts`, `search-config.test.ts`, `names.test.ts`                                                                                                                                                                                                                                                                               | typmod decoding on both encodings, every default form, hidden casts, keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Recognizer            | `tokenize.test.ts`, `parse.test.ts`, `recognize*.test.ts`, `subject.test.ts`, `constants.test.ts`, `pattern.test.ts`                                                                                                                                                                                                                                            | table-driven over the exact text PostgreSQL 14 and 18 deparse; every rejected shape; every accepted pattern matched by PostgreSQL and JavaScript alike                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Extraction            | `read-catalog.test.ts`, `read-tables.test.ts`, `read-constraints.test.ts`, `read-domains.test.ts`, `read-rules.test.ts`, `rules-oracle.test.ts`, `queries.test.ts`, `codes.test.ts`, `replay.test.ts`, `pglite.test.ts`, `server.test.ts`                                                                                                                       | every model member against a PGlite schema, extension-owned objects, settings, failures with positions; rules end to end with NOT VALID, NOT ENFORCED, and domain collations, and the database's verdict on values around every bound, on PGlite and a server                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Rendering             | `catalog-module.test.ts`, `kysely-types.test.ts`, `kysely-pglite-types.test.ts`, `kysely-collisions.test.ts`, `kysely-mapping.test.ts`, `kysely-node-postgres.test.ts`, `kysely-pglite.test.ts`, `kysely-names.test.ts`, `camel-case.test.ts`, `kysely-driver.test.ts`, `kysely-pglite-driver.test.ts`                                                          | exact output text, the named interface and the names refused, parse round trip, the module shape before the interface, every mapping row, nullability along domain chains, overrides, names and collisions, the camelCase conversions equal to Kysely's plugin under every option; on a server, node-postgres accepting a value of every insert alternative of every row and returning values of the select type, and refusing the values the insert types leave out; the same of PGlite's own `query()` on the current release and on 0.5.0, the values it refuses or stores as something else, `int8` on both sides of 2^53, and an array of a type created after startup staying text until `refreshArrayTypes()` |
| Commands, config, CLI | `extract.test.ts`, `extract-interfaces.test.ts`, `drift.test.ts`, `format-diff.test.ts`, `config.test.ts`, `config-validate.test.ts`, `config-validate-out.test.ts`, `config-validate-resources.test.ts`, `config-file.test.ts`, `arguments.test.ts`, `main.test.ts`, `main-rules.test.ts`, `main-surface.test.ts`, `surface.test.ts`, `format-surface.test.ts` | statuses, writes only on change, the configured interfaces, every validation message, loading each kind of configuration file, every usage error, output and exit codes; drift on PGlite over a socket and on a server against a catalog PGlite extracted, as a role with `CONNECT` and `USAGE` only, and `schema_usage`; the exact diff text                                                                                                                                                                                                                                                                                                                                                                        |
| Rules oracle          | `probe.test.ts`, `attempt.test.ts`, `run-cases.test.ts`, `rules.test.ts`, `format-rules.test.ts`, `show-value.test.ts`                                                                                                                                                                                                                                          | a probe's types, modifiers, collations, NOT NULL kept or left out, only the named CHECKs, an application function a CHECK calls, quoted and `%` names, a domain, and each problem; assignment semantics, every refusal's SQLSTATE and constraint, U+0000 and unpaired surrogates, 3,000 refusals on one PGlite; `checkRules` over a registry of every case kind finding no disagreement, then a faulty validator, a faulty codec, and stale migrations, each error, on PGlite and a server; the exact report text and every value notation                                                                                                                                                                           |

### 13.1 End-to-end suite (`e2e/catalog/`)

A private workspace package that depends on both packages through `workspace:*` and imports only
their built entries. `e2e/catalog/fixtures/contacts/` holds a realistic application's migrations in
Flyway naming (extensions, organizations, contacts with enums, domains, checks of every recognized
shape, a generated `tsvector`, identity, foreign keys, a partitioned table that a foreign key
references, partial and expression indexes (unique ones among them), an exclusion constraint, row
security with forced policies, and comments), and `expected/` holds the three files `extract` must
produce for them, reviewed by hand, `db-camel.ts`, the types rendered with `camelCase: true`, and
`db-pglite.ts`, the types rendered with `driver: 'pglite'`.

| File                          | Covers                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package-surface.e2e.test.ts` | the exact export lists, and that `@nizam-os/pg-catalog` re-exports the core's own bindings                                                                                                                                                                                                                                                                                            |
| `extract.e2e.test.ts`         | the three files equal `expected/` byte for byte, on two runs; `--check` passes, then fails after a migration changes                                                                                                                                                                                                                                                                  |
| `server.e2e.test.ts`          | when `CATALOG_PG_URL` is set: the server target produces the same bytes as PGlite, and drops its database                                                                                                                                                                                                                                                                             |
| `drift.e2e.test.ts`           | a live database built from the migrations shows no drift; after a column is added, a policy dropped, and a CHECK changed, exactly those three changes; on PGlite over a socket and on the server, where it also runs as the read-only role the README recommends                                                                                                                      |
| `kysely.e2e.test.ts`          | the contacts application writing and reading every table through Kysely with the generated `DB`: query results have the types the test states and the refused inserts fail to compile (the typecheck script), and every value node-postgres reads back has the declared select type; the same through `CamelCasePlugin` with `db-camel.ts`; on PGlite over a socket and on the server |
| `kysely-pglite.e2e.test.ts`   | the same application on PGlite through Kysely's `PGliteDialect` with `db-pglite.ts`: the file is what `renderKyselyTypes` writes with `driver: 'pglite'`, query results have the types the test states, a JSON value goes in as an object, and every value PGlite reads back has the declared select type                                                                             |
| `consumer.e2e.test.ts`        | the generated modules imported as TypeScript: assignable to the model with literal types, the public module equal to `toPublicCatalog` of the catalog, and `parseCatalogModule` reading the file back with no diff                                                                                                                                                                    |
| `rules.e2e.test.ts`           | the public catalog's rules enforced as a client would: each value's verdict equals the database's evaluation of the recorded CHECK, for tables and domains, and the rules are literal types                                                                                                                                                                                           |
| `cli.e2e.test.ts`             | the built bin run as a package manager runs it, in a temporary project whose configuration imports `defineExtraction`: `--version`, the three files byte for byte, `--check` passing and then failing on a hand edit, `drift` output and exit codes on PGlite over a socket and on the server, a missing URL variable, and a TypeScript configuration with and without type stripping |

`rules --check` reads declarations, so its end-to-end tests live with `@nizam-os/resource-core`'s
(resource SPEC 15.4): `e2e/resource/rules.e2e.test.ts` runs `checkRules` over the oracle's and the
contacts application's declarations, on PGlite and on the server, and finds no disagreement, and
finds each fault it plants; `rules-cli.e2e.test.ts` runs the built bin. `surface-cli.e2e.test.ts`
runs the built bin's `surface` over the contacts application: the file it writes equals the reviewed
`snapshots/surface.json` byte for byte, and after the edits `openapi-surface.e2e.test.ts` diffs,
`surface --check` prints exactly those changes and exits 1.

`e2e/catalog/smoke/` runs `extractCatalog` on Bun and Deno against PGlite, and `drift` against
PGlite behind a socket server, and `toPublicCatalog` and `diffCatalogs` in workerd. CI runs the
suite on Node.js 22 and 24, and again with `CATALOG_PG_URL` against PostgreSQL 14 and 18 services,
where `server.e2e.test.ts`, `kysely.e2e.test.ts`, and `drift.e2e.test.ts` reach the server.

---

## 14. Packaging

- ESM only, `engines.node >= 22.12.0`, built by tsdown with declarations through oxc
  (`isolatedDeclarations`). `publint --strict` and `attw --profile esm-only` run in the build.
- `@nizam-os/catalog-core`: `platform: 'neutral'`, no dependencies, `sideEffects: false`.
- `@nizam-os/pg-catalog`: `platform: 'node'`, two entries (`index` and `cli`), `bin` `pg-catalog`
  pointing at `dist/cli.mjs` with a `#!/usr/bin/env node` line, dependencies
  `@nizam-os/catalog-core` (`workspace:^`) and `pg`, `@electric-sql/pglite` `^0.5.0` (CI runs the
  package's tests on 0.5.0) and `@nizam-os/resource-core` `^0.1.0` as optional peer dependencies
  (`rules --check` imports the latter's `testing` entry and `surface` its `openapi` entry on demand,
  so `extract` and `drift` never load it), and `sideEffects` listing only the bin.
- The `exports` maps, `source` conditions, `publishConfig`, `files`, and release flow follow the
  keyset family (its SPEC 12).

---

## 15. Constants

| Name                    | Value                                                                                                      | Exported |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| `CATALOG_FORMAT`        | 3                                                                                                          | yes      |
| default schemas         | `['public']`                                                                                               | no       |
| minimum server version  | 140000 (PostgreSQL 14)                                                                                     | no       |
| throwaway database name | `nizam_catalog_` followed by 16 lowercase hex digits                                                       | no       |
| `SESSION_SETTINGS`      | the six settings of 7.1                                                                                    | no       |
| configuration files     | `pg-catalog.config.ts`, `.mts`, `.js`, `.mjs`, in that order                                               | no       |
| pattern bound limit     | 255 (PostgreSQL's `DUPMAX`)                                                                                | no       |
| schema name limit       | 63 bytes (`NAMEDATALEN - 1`)                                                                               | no       |
| file header             | `// Generated by @nizam-os/pg-catalog. Do not edit: change the migrations and run \`pg-catalog extract\`.` | no       |
| default interfaces      | `ExtractedCatalog`, `ExtractedPublicCatalog`                                                               | no       |
| `INTERFACE_NAME`        | `^[A-Z][A-Za-z0-9_]*$`                                                                                     | no       |
