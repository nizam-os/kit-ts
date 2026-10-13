/**
 * The configuration types and `defineExtraction`, which validates a
 * configuration eagerly (SPEC 11.1).
 * @packageDocumentation
 */
import type { CamelCaseOptions } from '@nizam-os/catalog-core';

import type { MigrationSource } from './migrations/load';
import type { PgliteExtension } from './target/pglite';

import { validateConfig } from './config-validate';

/**
 * Where migrations replay. PGlite, the default, runs PostgreSQL 18
 * in-process; `extensions` names contrib extensions (`'pg_trgm'`) or passes
 * PGlite extension objects. A URL replays on a server inside a throwaway
 * database; a function is called only when the URL is needed, so a missing
 * environment variable fails only the command that needs it.
 */
export type DatabaseConfig =
  | {
      readonly pglite: {
        readonly extensions?: ReadonlyArray<string | PgliteExtension>;
      };
    }
  | { readonly url: string | (() => string | undefined) };

/**
 * A TypeScript type for a column type in Kysely's select, insert, and
 * update positions; a missing position takes `select`'s type.
 */
export interface TypeOverride {
  readonly select: string;
  readonly insert?: string;
  readonly update?: string;
}

/**
 * The driver whose values the Kysely types describe (SPEC 9.2, ADR 0013):
 * node-postgres, behind Kysely's `PostgresDialect`, or PGlite's own
 * `query()`, behind `PGliteDialect`.
 */
export type KyselyDriver = 'node-postgres' | 'pglite';

/** The Kysely types file and how it maps types (SPEC 9.2). */
export interface TypesConfig {
  readonly file: string;
  /** Default `'node-postgres'`. */
  readonly driver?: KyselyDriver;
  /**
   * Types keyed by a column's `type` (or `<type>[]` for its arrays), for
   * applications that register their own parsers or use another driver: a
   * TypeScript type for all three positions, or one per position.
   */
  readonly overrides?: Readonly<Record<string, string | TypeOverride>>;
  /** Import statements written verbatim after Kysely's, for the types overrides name. */
  readonly imports?: ReadonlyArray<string>;
  /**
   * Table and column keys as Kysely's `CamelCasePlugin` names them, for
   * applications that use it: `true`, or the plugin's options.
   */
  readonly camelCase?: boolean | CamelCaseOptions;
}

/**
 * The catalog module and the interface it exports, which compile errors
 * print in place of the catalog's members (SPEC 9.1).
 */
export interface CatalogFileConfig {
  readonly file: string;
  /** Default `ExtractedCatalog`. */
  readonly interface?: string;
}

/** The public module: the tables a browser may see, and the interface it exports. */
export interface PublicFileConfig {
  readonly file: string;
  readonly tables: ReadonlyArray<string>;
  /** Default `ExtractedPublicCatalog`. */
  readonly interface?: string;
}

/**
 * The files `extract` writes, relative to the configuration file (or the
 * `cwd` option): the catalog module, as a path or with its interface's
 * name; `public`, the slice of `tables` a browser may see; `types`, the
 * Kysely types, as a path or with options.
 */
export interface OutputConfig {
  readonly catalog: string | CatalogFileConfig;
  readonly public?: PublicFileConfig;
  readonly types?: string | TypesConfig;
}

/**
 * A live database `drift` compares with the committed catalog. The URL is
 * meant for a read-only role with `CONNECT` and `USAGE` on the configured
 * schemas; a function is called only when drift runs for this environment.
 */
export interface DriftEnvironment {
  readonly url: string | (() => string | undefined);
}

/**
 * A storage codec over text (resource SPEC 7.1): `write` gives the text
 * PostgreSQL reads for a value of its codec, and `read` takes the text
 * PostgreSQL prints, in a session in UTC with ISO dates. `write` takes
 * `never` here, so a codec's own typed `write` fits.
 */
export interface TextStorageCodec {
  readonly read: (stored: string) => unknown;
  readonly write: (value: never) => string;
}

/**
 * The declared resources of `@nizam-os/resource-core` and what the commands
 * over them need (SPEC 10.3, 10.4). `registry` returns the resources; it
 * is called only when `rules --check` or `surface` runs, since the
 * declarations import the catalog `extract` writes. `storage` gives each
 * codec a declared field names its storage codec over text, by codec
 * name, for `rules --check`. `surface` is the file `surface` writes the
 * API surface to and `surface --check` compares, such as
 * `api-surface.json`.
 */
export interface ResourcesConfig {
  readonly registry: () =>
    | ReadonlyArray<object>
    | Promise<ReadonlyArray<object>>;
  readonly storage?: Readonly<Record<string, TextStorageCodec>>;
  readonly surface?: string;
}

/** An extraction: the migrations, where they replay, which schemas to read, and the files to write. */
export interface ExtractionConfig {
  /** A directory of `.sql` files, or a function returning the migrations in order. */
  readonly migrations: string | MigrationSource;
  /** Default `{ pglite: {} }`. */
  readonly database?: DatabaseConfig;
  /** Default `['public']`; the first is the default schema, whose objects are named without a prefix. */
  readonly schemas?: ReadonlyArray<string>;
  readonly out: OutputConfig;
  /** The live databases `drift` can compare, by environment name. */
  readonly drift?: Readonly<Record<string, DriftEnvironment>>;
  /** The declared resources `rules --check` and `surface` run over. */
  readonly resources?: ResourcesConfig;
}

/** The schemas read when the configuration names none (SPEC 15). */
export const DEFAULT_SCHEMAS: ReadonlyArray<string> = ['public'];

/** `out.catalog` with its options, for a configuration that gives only the path. */
export function catalogFile(
  catalog: string | CatalogFileConfig,
): CatalogFileConfig {
  return typeof catalog === 'string' ? { file: catalog } : catalog;
}

/**
 * Validates a configuration eagerly and returns it unchanged, for the
 * default export of `pg-catalog.config.ts`. A mistake throws `TypeError`
 * naming the option: an unknown key at any level, an empty string, a
 * `database` with both or neither of `pglite` and `url`, a system,
 * duplicate, or overlong schema name, an empty or duplicate
 * `out.public.tables`, an interface name outside `^[A-Z][A-Za-z0-9_]*$` or
 * shared by both modules, or a drift environment name outside
 * `^[A-Za-z0-9][A-Za-z0-9_-]*$`, a `resources.registry` or storage codec
 * member that is not a function, or a `resources.surface` that is not a
 * path. URL functions and the registry function are not called.
 */
export function defineExtraction(config: ExtractionConfig): ExtractionConfig {
  validateConfig(config);
  return config;
}
