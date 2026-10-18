# @nizam-os/pg-catalog

## 0.1.0

### Minor Changes

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`a9ba280`](https://github.com/nizam-os/kit-ts/commit/a9ba280088ac37123393530c449bd765542bc206) Thanks [@ali-issa](https://github.com/ali-issa)! - `toCamelCase` and `toSnakeCase`, Kysely's `CamelCasePlugin` conversions with its options, move from
  `@nizam-os/pg-catalog` into `@nizam-os/catalog-core`, together with the `CamelCaseOptions` type, so
  the `camelCase` Kysely types and the public names of `@nizam-os/resource-core` come from one
  implementation. `@nizam-os/pg-catalog` re-exports them with the rest of the core; its `camelCase`
  keys do not change.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`f662dc3`](https://github.com/nizam-os/kit-ts/commit/f662dc308235224e2f1d91fb2c70fed568be9e24) Thanks [@ali-issa](https://github.com/ali-issa)! - A public CHECK or foreign key keeps `enforced`, false when the constraint is NOT ENFORCED
  (PostgreSQL 18), which the database records but never checks. A consumer can then skip what no
  client can violate instead of mistaking it for an enforced constraint. `CATALOG_FORMAT` is now 3, so
  committed catalogs need `pg-catalog extract` again.

- [#160](https://github.com/nizam-os/kit-ts/pull/160) [`41d4756`](https://github.com/nizam-os/kit-ts/commit/41d47566eee9cae48b791e461344d818dd2e9c76) Thanks [@ali-issa](https://github.com/ali-issa)! - The Kysely types can follow PGlite's own parsers, for applications on Kysely's `PGliteDialect`: set
  `types.driver: 'pglite'` (the default stays `'node-postgres'`). `int8` reads as `number | bigint`,
  `bytea` as `Uint8Array`, `interval`, `point`, and `circle` as text, every array as an array, and
  `json` and `jsonb` take any JSON value through the new `JsonParameter` helper. A domain over a date
  or time type, `bytea`, JSON, or an array takes PostgreSQL's text, since PGlite sends a domain's
  value with `toString()`. `JsonParameter` is now a reserved name under either driver.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`248e80b`](https://github.com/nizam-os/kit-ts/commit/248e80bfaa669dc9ebbe1453a5402e37327faa94) Thanks [@ali-issa](https://github.com/ali-issa)! - The public catalog lists each unique index that no constraint backs among its table's constraints,
  as a unique constraint keyed by the index name, since PostgreSQL reports a violated unique index
  under that name exactly as it reports a UNIQUE constraint. Every public unique constraint gains
  `partial`, true when a `WHERE` clause limits the rule to some rows; the predicate itself stays
  private. A unique index over an expression stays out, and so does one named like a CHECK or FOREIGN
  KEY constraint of its table, which keeps the key. `CATALOG_FORMAT` is now 2, so committed catalogs
  need `pg-catalog extract` again.

- [#68](https://github.com/nizam-os/kit-ts/pull/68) [`8b284c4`](https://github.com/nizam-os/kit-ts/commit/8b284c45ecd28e0c6b9ab6d31cc4f989ca85edfd) Thanks [@ali-issa](https://github.com/ali-issa)! - CHECK constraints become rules that a client can enforce and get PostgreSQL's verdict.
  
  - Every check constraint, on a table or a domain, carries a `rule` read from PostgreSQL's deparsed
    expression: character length bounds, a numeric range with the inclusiveness of each bound, a set
    of values, `IS NOT NULL`, or a regular expression in the subset that PostgreSQL and JavaScript,
    with the flags `su`, read identically. Any other CHECK has `rule: null`, which tells an API layer
    that a validator must cover it.
  - A rule is read only when it agrees with its CHECK on every non-null value: an enforced CHECK on
    one column, NOT VALID ones included, in a documented shape, under a deterministic collation, on a
    type whose comparisons the rule describes. Columns under a nondeterministic collation, and
    `citext`, `char(n)`, and `real` columns, keep only `notNull`; a NOT ENFORCED CHECK has no rule.
  - Range bounds keep every digit as decimal text, and lengths count code points.
  - The recognizer is tested against the exact text PostgreSQL 14 and 18 deparse, and its rules
    against the database's own verdict on values around every bound.

- [#68](https://github.com/nizam-os/kit-ts/pull/68) [`73500ef`](https://github.com/nizam-os/kit-ts/commit/73500ef15385f962e40e1cb8e2a7f49627bd5563) Thanks [@ali-issa](https://github.com/ali-issa)! - The `pg-catalog` CLI and `defineExtraction`, so a project keeps its configuration in
  `pg-catalog.config.ts` and runs extraction, the CI check, and drift without a script of its own.
  
  - `pg-catalog extract` writes the configured files, and `pg-catalog extract --check` writes nothing
    and exits 1 when a file is stale or missing. `pg-catalog drift --env <name>` exits 1 when the
    database differs from the committed catalog, and prints the `CatalogDiff` as JSON with `--json`.
    Every command exits 2 when it cannot run, with the reason on standard error.
  - The CLI loads `--config <file>`, or the first of `pg-catalog.config.ts`, `.mts`, `.js`, and `.mjs`
    in the working directory, and resolves the configuration's paths against its directory. A
    TypeScript configuration runs on Node.js 22.18 or later, Bun, and Deno.
  - `defineExtraction` checks a configuration as it loads and throws a `TypeError` naming the option:
    unknown keys at any level, empty paths, a `database` with both or neither target, system or
    duplicate schemas, and drift environment names a command-line flag cannot carry.
  - `connection_failed` messages give the reason, such as a refused connection or a missing database,
    and never the URL.

- [#68](https://github.com/nizam-os/kit-ts/pull/68) [`66cb6e7`](https://github.com/nizam-os/kit-ts/commit/66cb6e7575e87821af89d2e9597f2cbc40273868) Thanks [@ali-issa](https://github.com/ali-issa)! - `drift` compares a live database with the committed catalog, for a scheduled job that watches
  production.
  
  - `drift(config, environment)` reads `out.catalog`, connects to the URL of
    `config.drift[environment]`, reads the catalog with the queries `extract` uses inside a
    `REPEATABLE READ READ ONLY` transaction, and returns the `diffCatalogs` result. It replays nothing
    and cannot write.
  - `introspectCatalog({ url, schemas })` returns the live catalog itself, and `formatDiff(diff)`
    prints the differences grouped by object kind, with each changed member and both values.
  - A role with `CONNECT` and `USAGE` on the configured schemas is all drift needs. Without `USAGE`,
    PostgreSQL would qualify every name in the schema, so drift fails with `schema_usage` instead of
    reporting false drift.
  - Unknown environments, URL functions that return nothing, and an unreadable committed catalog fail
    with `config_invalid` or `catalog_unreadable` before any connection is made.

- [#68](https://github.com/nizam-os/kit-ts/pull/68) [`5102bf1`](https://github.com/nizam-os/kit-ts/commit/5102bf1b9dbe393be599c491c937aef98387ebee) Thanks [@ali-issa](https://github.com/ali-issa)! - First release: your PostgreSQL schema as committed TypeScript.
  
  - `extract(config, { check })` replays the SQL migrations into a fresh database, reads `pg_catalog`,
    and writes `catalog.ts` and, with `out.public`, `public-catalog.ts` as `as const` modules. With
    `check` it writes nothing and reports each file as `unchanged`, `stale`, or `missing`.
    `extractCatalog` returns the catalog without writing.
  - Migrations come from a directory, in Flyway order when every file follows Flyway's naming and in
    natural order otherwise, or from a function. A failing migration is reported with its name,
    PostgreSQL's message and code, and the line and column.
  - Replay runs in PGlite (PostgreSQL 18 in-process, with contrib extensions named in the config) or
    in a throwaway database on a PostgreSQL 14 to 18 server, created from `template0` and always
    dropped.
  - The output is deterministic: settings are pinned before every migration and before reading, and
    keys are ordered by code units, so the same migrations give the same bytes on every machine and on
    every supported major.
  - `renderCatalogModule`, `renderPublicCatalogModule`, and `parseCatalogModule` write and read the
    modules; every failure is a `PgCatalogError` with a `code`.
  - Re-exports all of `@nizam-os/catalog-core`, so an application imports from one package.

- [#68](https://github.com/nizam-os/kit-ts/pull/68) [`e9b7a6d`](https://github.com/nizam-os/kit-ts/commit/e9b7a6dc7dd223326147c72e6d16561267eedb9e) Thanks [@ali-issa](https://github.com/ali-issa)! - Kysely types are generated from the same catalog, so the types and the catalog cannot disagree.
  
  - `out.types` writes a file with one string literal union per enum, one `<Name>Table` interface per
    table, and the `DB` interface; `extract --check` covers it like the catalog modules, and
    `renderKyselyTypes(catalog, options)` renders it programmatically.
  - Select types are what node-postgres's default parsers return (`int8` and `numeric` as strings,
    timestamps as `Date`, `jsonb` parsed, arrays of the common built-in types parsed and the others as
    array text). Insert and update types are what node-postgres can send, so JSON, points, and circles
    are written as text.
  - Defaults, identity columns, generated columns, domain chains, and NOT NULL domains follow
    PostgreSQL: a nullable column of a NOT NULL domain refuses null on write but keeps `| null` on
    read, as PostgreSQL documents.
  - `types.overrides` replaces the mapping per type or array type, in all positions or per position,
    for applications that register their own parsers, and `types.imports` brings in the types they
    name. Two objects with the same TypeScript name fail with `name_collision`.
  - `types.camelCase` writes the keys Kysely's `CamelCasePlugin` uses, with the plugin's options.
    Names the plugin would not turn back into themselves, such as `line_1`, fail with
    `camel_case_mismatch`, which lists every one.
  - A test holds every row of the mapping against node-postgres on PostgreSQL 14 and 18.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`71698a9`](https://github.com/nizam-os/kit-ts/commit/71698a9bc58e41c7f90f4903b2e8977e00129e39) Thanks [@ali-issa](https://github.com/ali-issa)! - Generated catalog modules now type their binding with a named interface:
  `export interface ExtractedCatalog extends Readonly<typeof value> {}` and
  `export const catalog: ExtractedCatalog = value;`, with `ExtractedPublicCatalog` for
  `publicCatalog`. TypeScript prints an interface by its name, so a compile error in code typed by the
  catalog reads `DeclareContext<ContactsPublicCatalog, ...>` instead of a dump of the catalog cut
  short, and checks far faster: 76 such errors on a schema of 115 tables went from 13.4 s and 5.8 GB
  to 0.5 s and 182 MB.
  
  - `out.catalog` takes `{ file, interface }` and `out.public` takes `interface`, to name the
    interfaces after the application. `defineExtraction` refuses a name that is not an ASCII
    identifier starting with an uppercase letter, and one that both modules share.
  - `renderCatalogModule` and `renderPublicCatalogModule` take `{ interface }` as a second argument.
  - `parseCatalogModule` reads modules of both shapes. Run `pg-catalog extract` once after upgrading:
    `extract --check` reports the committed modules as stale until then.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`332bb8d`](https://github.com/nizam-os/kit-ts/commit/332bb8da391d968083a224102c04f6ad25da662a) Thanks [@ali-issa](https://github.com/ali-issa)! - `rules --check` proves that the schemas of your declared resources agree with the database your
  migrations build.
  
  - `pg-catalog rules --check` replays the migrations and writes every fixture of the declared
    resources into a temporary copy of its columns, with their types, collations, and the CHECKs that
    apply: each member's boundary values, each validator's fixtures, and each codec's round trip. It
    prints each fixture on which the schema and PostgreSQL disagree, and exits 1 on a disagreement or
    on a case whose table, column, CHECK, or domain the migrations do not create.
  - Configure it with `resources: { registry, storage }`: `registry` returns the declared resources,
    so only the commands over them load them, and `storage` gives a storage codec over text for each
    codec. `defineExtraction` checks both.
  - Refusals are caught inside the database, so a case takes one round trip and PGlite runs any number
    of them.
  - A table of `out.public.tables` that no declaration reads gets a warning.
  - `checkRules(config, { cwd })` returns the report, and `formatRules(report)` the text.
  - `@nizam-os/resource-core` is a new optional peer dependency, loaded only by this command; without
    it the command fails with `resource_core_missing`, and a registry it refuses fails with
    `registry_invalid`.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`3449a4a`](https://github.com/nizam-os/kit-ts/commit/3449a4abef916ab3cb2fbf32ea3a086a7fb00794) Thanks [@ali-issa](https://github.com/ali-issa)! - `surface` keeps a snapshot of your API's surface and fails CI when a change breaks a client.
  
  - `pg-catalog surface` writes the surface of the declared resources, what their clients depend on,
    to the file `resources.surface` names, as JSON to commit next to the catalog.
  - `pg-catalog surface --check` compares the committed file with the declarations, prints each change
    with the breaking ones first, and exits 1 on a breaking change or a missing file, 0 when every
    change is safe. It needs no database.
  - The declared resources are configured under `resources`: `registry`, `storage` for
    `rules --check`, and `surface`. `defineExtraction` checks each.
  - `writeSurface(config, { cwd })` and `checkSurface(config, { cwd })` return the reports, and
    `formatSurface(report, file)` the text. A committed file that is not JSON, or not a surface this
    version reads, fails with `surface_unreadable`.

### Patch Changes

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`6ff2097`](https://github.com/nizam-os/kit-ts/commit/6ff2097fead30c359ed8be7e521828d7a5cc8424) Thanks [@ali-issa](https://github.com/ali-issa)! - Record the precision of `timestamp(p)`, `timestamptz(p)`, `time(p)`, and `timetz(p)` columns and
  domains in `precision`. PostgreSQL rounds a value to that many fraction digits of a second, so a
  consumer that checks values before they reach the database needs it:
  `'9999-12-31 23:59:59.999999'::timestamp(3)` stores `10000-01-01 00:00:00`. Catalogs extracted
  before this change carry `null` there and need `pg-catalog extract` again.

- [#68](https://github.com/nizam-os/kit-ts/pull/68) [`c713279`](https://github.com/nizam-os/kit-ts/commit/c7132793119eba16b582d0ccd4d5683954171612) Thanks [@ali-issa](https://github.com/ali-issa)! - A foreign key that references a partitioned table is listed once. PostgreSQL also adds one clone of
  it per partition of the referenced table, named differently on each major; the catalog now leaves
  these out, as pg_dump does, so the same migrations give the same files on PostgreSQL 14 to 18.
- Updated dependencies [[`f6568c1`](https://github.com/nizam-os/kit-ts/commit/f6568c1b4448a9e092f9f7132601c6f48b404c69), [`a9ba280`](https://github.com/nizam-os/kit-ts/commit/a9ba280088ac37123393530c449bd765542bc206), [`5102bf1`](https://github.com/nizam-os/kit-ts/commit/5102bf1b9dbe393be599c491c937aef98387ebee), [`f662dc3`](https://github.com/nizam-os/kit-ts/commit/f662dc308235224e2f1d91fb2c70fed568be9e24), [`248e80b`](https://github.com/nizam-os/kit-ts/commit/248e80bfaa669dc9ebbe1453a5402e37327faa94), [`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45), [`b417552`](https://github.com/nizam-os/kit-ts/commit/b4175527fa26aa1f36ca68fddc4e0d49a74a7d09), [`48677cf`](https://github.com/nizam-os/kit-ts/commit/48677cf9f997eb934d9b895ebfe26e38b3b43989), [`6ff2097`](https://github.com/nizam-os/kit-ts/commit/6ff2097fead30c359ed8be7e521828d7a5cc8424), [`3165675`](https://github.com/nizam-os/kit-ts/commit/31656752fb3e252b61d20c9eeed8f2a484264a83), [`f8e652c`](https://github.com/nizam-os/kit-ts/commit/f8e652cde529ec1c0fdcfdd83c64bd0e471d0210), [`d6c2a48`](https://github.com/nizam-os/kit-ts/commit/d6c2a489b7edb43972c35f99a817235df7615592), [`0cb082d`](https://github.com/nizam-os/kit-ts/commit/0cb082d3939b6142d2daa2a1ebc5cc89db3591ec), [`8b5e206`](https://github.com/nizam-os/kit-ts/commit/8b5e206bab7c144acf9fe0d5bc992707b1700f54), [`4fe1af3`](https://github.com/nizam-os/kit-ts/commit/4fe1af3df37ed4411e64378ba87150321f20da18), [`82eca45`](https://github.com/nizam-os/kit-ts/commit/82eca45cade231500a5d75f2ba3d0d0cf72ee812), [`f4a53b4`](https://github.com/nizam-os/kit-ts/commit/f4a53b407ab4cdcb3245755ca03bb2c436a61a9d), [`e8f8ade`](https://github.com/nizam-os/kit-ts/commit/e8f8adebe8870015d0127b52593f574ebddcb916), [`e11a6cc`](https://github.com/nizam-os/kit-ts/commit/e11a6cc1ff9f68dd56a3997acfdf6acec782e283), [`cec37c1`](https://github.com/nizam-os/kit-ts/commit/cec37c138fabaf2e37703e39b2b605368b95015e), [`0a5fe97`](https://github.com/nizam-os/kit-ts/commit/0a5fe9772396d7514147806453153cf1f3ac3547), [`2a56a8e`](https://github.com/nizam-os/kit-ts/commit/2a56a8ea4a88b0fa88650d5be15fb7e8277dc43f), [`ad320bf`](https://github.com/nizam-os/kit-ts/commit/ad320bfe3cce31a4d4e0d0f670f8fac51797ed1e), [`cd69e52`](https://github.com/nizam-os/kit-ts/commit/cd69e525896f7261d34de2710c585d0b7b65c7d9), [`eed8b0b`](https://github.com/nizam-os/kit-ts/commit/eed8b0b4c5ee78eb39f13655d79d631d77eeb9df), [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34), [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4), [`e7949ba`](https://github.com/nizam-os/kit-ts/commit/e7949ba2ff768c3950259b061463488e4d7c09de), [`659c973`](https://github.com/nizam-os/kit-ts/commit/659c973dbed17e51e863e21e0c6886ae3fd01a13), [`f62c925`](https://github.com/nizam-os/kit-ts/commit/f62c925720dbfa3b0f69f306be7feb8aaf201e1e), [`4e920da`](https://github.com/nizam-os/kit-ts/commit/4e920da161a11c6b27360232d14756aa36718b8d), [`a9ba280`](https://github.com/nizam-os/kit-ts/commit/a9ba280088ac37123393530c449bd765542bc206), [`f662dc3`](https://github.com/nizam-os/kit-ts/commit/f662dc308235224e2f1d91fb2c70fed568be9e24), [`8a87a9f`](https://github.com/nizam-os/kit-ts/commit/8a87a9fa2feada78b4a7a5a490a36c19fdd7eb85), [`332bb8d`](https://github.com/nizam-os/kit-ts/commit/332bb8da391d968083a224102c04f6ad25da662a), [`f475362`](https://github.com/nizam-os/kit-ts/commit/f475362adca6a54d11a4ebaf5610b079a3fab9d6), [`97f3c1c`](https://github.com/nizam-os/kit-ts/commit/97f3c1cf930b9ad71afef5637739faef100d2b60), [`c7efc14`](https://github.com/nizam-os/kit-ts/commit/c7efc1494831b0b206dffbb78630a3f403fb67c7), [`a9a23d3`](https://github.com/nizam-os/kit-ts/commit/a9a23d3eb014c958361ec7c714cd5c212020cef9), [`227c2ac`](https://github.com/nizam-os/kit-ts/commit/227c2ac67b1c81e94c848bf29093f05d5c535251), [`829408d`](https://github.com/nizam-os/kit-ts/commit/829408dfca7d6b27b43e688ebc6fe829e0e8c44d), [`a2ded61`](https://github.com/nizam-os/kit-ts/commit/a2ded61e43cefd3157c1a1f0e0ffd26237d501cf), [`c052bd8`](https://github.com/nizam-os/kit-ts/commit/c052bd8a528012779deea2c20026f653a0afe7f0), [`3449a4a`](https://github.com/nizam-os/kit-ts/commit/3449a4abef916ab3cb2fbf32ea3a086a7fb00794), [`248e80b`](https://github.com/nizam-os/kit-ts/commit/248e80bfaa669dc9ebbe1453a5402e37327faa94), [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152), [`6d8a03e`](https://github.com/nizam-os/kit-ts/commit/6d8a03ef03534c724778d40068450b7bc63425e1)]:
  - @nizam-os/resource-core@0.1.0
  - @nizam-os/catalog-core@0.1.0
