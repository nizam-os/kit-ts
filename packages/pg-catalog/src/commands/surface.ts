/**
 * `writeSurface` and `checkSurface` (SPEC 10.4): the API surface of the
 * declared resources, `surfaceOf` of `@nizam-os/resource-core/openapi`,
 * written as the snapshot an application commits, and that snapshot
 * compared with the registry by `diffSurfaces`, which tells a breaking
 * change from a safe one (resource SPEC 13.2). Neither replays the
 * migrations: the surface comes from the declarations alone.
 * @packageDocumentation
 */
import type { Surface, SurfaceChange } from '@nizam-os/resource-core/openapi';

import type { ExtractionConfig } from '../config';
import type { OpenapiModule } from '../surface/openapi-module';

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { PgCatalogError } from '../errors';
import { readExisting } from '../internal/read-existing';
import { importOpenapi } from '../surface/openapi-module';
import { callRegistry, resourcesOf } from './registry';

export interface SurfaceOptions {
  /** The directory a relative `resources.surface` resolves against; default the process's working directory. */
  readonly cwd?: string;
}

/** What `writeSurface` did with the file. */
export interface SurfaceWriteReport {
  readonly file: string;
  readonly status: 'written' | 'unchanged';
}

/** How the committed snapshot compares with the registry's surface. */
export interface SurfaceCheckReport {
  readonly file: string;
  readonly status: 'unchanged' | 'changed' | 'missing';
  /** From the snapshot to the registry's surface, in `diffSurfaces` order; empty unless `changed`. */
  readonly changes: ReadonlyArray<SurfaceChange>;
}

/**
 * What `surfaceOf` throws for a mistake in the registry names it first:
 * `surfaceOf: ` or `surfaceOf.resources[0]: ` (resource SPEC 4.2).
 */
const SURFACE_MISTAKE = /^surfaceOf[.:]/u;
const JSON_INDENT = 2;

interface Snapshot {
  readonly openapi: OpenapiModule;
  /** The file as configured, which messages name. */
  readonly shown: string;
  readonly file: string;
  readonly surface: Surface;
}

/** The snapshot's text: the surface as JSON indented by two spaces, with a final newline. */
function surfaceText(surface: Surface): string {
  return `${JSON.stringify(surface, null, JSON_INDENT)}\n`;
}

function surfaceOf(
  openapi: OpenapiModule,
  resources: ReadonlyArray<object>,
): Surface {
  try {
    return openapi.surfaceOf(resources);
  } catch (error) {
    if (error instanceof TypeError && SURFACE_MISTAKE.test(error.message)) {
      throw new PgCatalogError(
        'registry_invalid',
        `surface: ${error.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** The registry's surface and the file it goes to, in the order SPEC 10.4 checks them. */
async function snapshot(
  config: ExtractionConfig,
  options: SurfaceOptions,
): Promise<Snapshot> {
  const resources = resourcesOf(config);
  const shown = resources.surface;
  if (shown === undefined) {
    throw new PgCatalogError(
      'config_invalid',
      'resources.surface is not configured: set it to the file the surface is written to, such as api-surface.json',
    );
  }
  const openapi = await importOpenapi();
  const registry = await callRegistry(resources);
  return {
    openapi,
    shown,
    file: resolve(options.cwd ?? process.cwd(), shown),
    surface: surfaceOf(openapi, registry),
  };
}

function committedSurface(
  { openapi, shown }: Snapshot,
  bytes: Buffer,
): Surface {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new PgCatalogError(
      'surface_unreadable',
      `the surface file ${shown} does not hold valid JSON; write it again with pg-catalog surface`,
      { cause: error },
    );
  }
  try {
    return openapi.parseSurface(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PgCatalogError(
      'surface_unreadable',
      `the surface file ${shown} is not a surface this version reads (${reason}); write it again with pg-catalog surface`,
      { cause: error },
    );
  }
}

/**
 * Writes the surface of the declared resources `config.resources.registry`
 * returns to `config.resources.surface`, creating directories, unless the
 * file already holds it byte for byte. Fails with `config_invalid` when
 * `resources` or `resources.surface` is not configured,
 * `resource_core_missing` when `@nizam-os/resource-core` cannot be loaded,
 * and `registry_invalid` when the registry function returns anything but
 * a list of objects or `surfaceOf` refuses the registry. What the registry
 * function throws is thrown.
 */
export async function writeSurface(
  config: ExtractionConfig,
  options: SurfaceOptions = {},
): Promise<SurfaceWriteReport> {
  const { file, surface } = await snapshot(config, options);
  const text = Buffer.from(surfaceText(surface), 'utf8');
  if ((await readExisting(file))?.equals(text) === true) {
    return { file, status: 'unchanged' };
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  return { file, status: 'written' };
}

/**
 * Compares the committed snapshot `config.resources.surface` with the
 * surface of the declared resources, writing nothing: `missing` without
 * the file, `changed` with the changes `diffSurfaces` finds, `unchanged`
 * without any, however the file is formatted. Fails as `writeSurface`
 * does, and with `surface_unreadable` when the file is not JSON or not a
 * surface `parseSurface` reads, such as one of another format.
 */
export async function checkSurface(
  config: ExtractionConfig,
  options: SurfaceOptions = {},
): Promise<SurfaceCheckReport> {
  const current = await snapshot(config, options);
  const bytes = await readExisting(current.file);
  if (bytes === null) {
    return { file: current.file, status: 'missing', changes: [] };
  }
  const changes = current.openapi.diffSurfaces(
    committedSurface(current, bytes),
    current.surface,
  );
  return {
    file: current.file,
    status: changes.length === 0 ? 'unchanged' : 'changed',
    changes,
  };
}
