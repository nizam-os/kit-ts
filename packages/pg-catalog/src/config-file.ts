/**
 * The configuration file the CLI reads (SPEC 11.1): `--config <file>`, or
 * the first of `pg-catalog.config.ts`, `.mts`, `.js`, and `.mjs` in the
 * working directory, loaded with a dynamic `import()`. A TypeScript file
 * needs a runtime that strips types.
 * @ref https://nodejs.org/api/typescript.html
 * @ref https://nodejs.org/api/esm.html#import-expressions
 * @packageDocumentation
 */
import type { ExtractionConfig } from './config';

import { access } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateConfig } from './config-validate';
import { PgCatalogError } from './errors';

/** Looked up in this order (SPEC 15). */
export const CONFIG_FILES: ReadonlyArray<string> = [
  'pg-catalog.config.ts',
  'pg-catalog.config.mts',
  'pg-catalog.config.js',
  'pg-catalog.config.mjs',
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** The first configuration file in `directory`, or `null` when there is none. */
export async function findConfigFile(
  directory: string,
): Promise<string | null> {
  for (const name of CONFIG_FILES) {
    const path = join(directory, name);
    if (await exists(path)) {
      return path;
    }
  }
  return null;
}

/**
 * Node.js reports a `.ts` file it will not strip as an unknown extension:
 * type stripping is on by default from 22.18 and 23.6, behind
 * `--experimental-strip-types` from 22.6, and off with `--no-strip-types`.
 * @ref https://nodejs.org/api/typescript.html#type-stripping
 */
function loadFailure(name: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && 'code' in error ? error.code : null;
  return code === 'ERR_UNKNOWN_FILE_EXTENSION'
    ? `cannot load ${name}: this Node.js does not strip TypeScript types; use Node.js 22.18 or later, set NODE_OPTIONS=--experimental-strip-types on Node.js 22.12 to 22.17, or write pg-catalog.config.mjs`
    : `cannot load ${name}: ${reason}`;
}

/**
 * Imports the file and validates its default export as `defineExtraction`
 * does. Every failure is a `config_invalid` naming the file.
 */
export async function loadConfigFile(path: string): Promise<ExtractionConfig> {
  // Checked first: the loader's own "cannot find module" names pg-catalog as the importer.
  if (!(await exists(path))) {
    throw new PgCatalogError('config_invalid', `${path} does not exist`);
  }
  const name = basename(path);
  let module: unknown;
  try {
    module = await import(pathToFileURL(path).href);
  } catch (error) {
    throw new PgCatalogError('config_invalid', loadFailure(name, error), {
      cause: error,
    });
  }
  const config: unknown =
    typeof module === 'object' && module !== null
      ? Reflect.get(module, 'default')
      : undefined;
  if (config === undefined) {
    throw new PgCatalogError(
      'config_invalid',
      `${name} has no default export; export default defineExtraction({ ... })`,
    );
  }
  try {
    validateConfig(config);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new PgCatalogError('config_invalid', `${name}: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
  return config;
}
