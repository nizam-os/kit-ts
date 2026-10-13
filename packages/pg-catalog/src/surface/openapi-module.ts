/**
 * `@nizam-os/resource-core/openapi`, an optional peer dependency imported
 * only when `surface` runs (SPEC 10.4, 14), as `rules --check` imports the
 * testing entry.
 * @packageDocumentation
 */
import type { Surface, SurfaceChange } from '@nizam-os/resource-core/openapi';

import { PgCatalogError } from '../errors';

/**
 * What `surface` calls. `surfaceOf` is a method here, whose parameters
 * TypeScript compares both ways, so the function typed for declared
 * resources fits a registry the configuration returned unchecked:
 * `surfaceOf` checks it and throws a `TypeError` that starts with
 * `surfaceOf: ` or `surfaceOf.` (resource SPEC 4.2).
 * @ref https://www.typescriptlang.org/tsconfig/#strictFunctionTypes
 */
export interface OpenapiModule {
  surfaceOf(resources: ReadonlyArray<object>): Surface;
  diffSurfaces(before: Surface, after: Surface): ReadonlyArray<SurfaceChange>;
  parseSurface(value: unknown): Surface;
}

/** Imports the OpenAPI entry; `resource_core_missing` with the reason when it cannot be loaded. */
export async function importOpenapi(): Promise<OpenapiModule> {
  try {
    return await import('@nizam-os/resource-core/openapi');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PgCatalogError(
      'resource_core_missing',
      `surface needs @nizam-os/resource-core, whose declarations it describes: ${reason}`,
      { cause: error },
    );
  }
}
