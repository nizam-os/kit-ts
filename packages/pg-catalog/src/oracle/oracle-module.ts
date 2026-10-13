/**
 * `@nizam-os/resource-core/testing`, an optional peer dependency imported
 * only when `rules --check` runs (SPEC 10.3, 14), as the PGlite target
 * imports PGlite (SPEC 6.1).
 * @packageDocumentation
 */
import type {
  OracleCase,
  OracleOptions,
} from '@nizam-os/resource-core/testing';

import { PgCatalogError } from '../errors';

/**
 * What `rules --check` calls. `oracleCases` is a method here, whose
 * parameters TypeScript compares both ways, so the function typed for
 * declared resources fits a registry the configuration returned unchecked:
 * `oracleCases` checks it and throws a `TypeError` that starts with
 * `oracleCases: ` (resource SPEC 4.2).
 * @ref https://www.typescriptlang.org/tsconfig/#strictFunctionTypes
 */
export interface OracleModule {
  oracleCases(
    resources: ReadonlyArray<object>,
    options: OracleOptions,
  ): ReadonlyArray<OracleCase>;
}

/** Imports the testing entry; `resource_core_missing` with the reason when it cannot be loaded. */
export async function importOracle(): Promise<OracleModule> {
  try {
    return await import('@nizam-os/resource-core/testing');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PgCatalogError(
      'resource_core_missing',
      `rules --check needs @nizam-os/resource-core, whose declarations it checks: ${reason}`,
      { cause: error },
    );
  }
}
