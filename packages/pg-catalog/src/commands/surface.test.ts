/**
 * writeSurface and checkSurface (SPEC 10.4) over the test application's
 * declarations: the snapshot written as `surfaceOf` gives it and left
 * alone when current; the committed snapshot compared with the registry,
 * each change marked breaking or safe; and the mistakes in the
 * configuration, the registry, and the file, each with its code. Neither
 * replays the migrations.
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

import type { ExtractionConfig } from '../config';

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { toPublicCatalog } from '@nizam-os/catalog-core';
import { surfaceOf } from '@nizam-os/resource-core/openapi';

import { PgCatalogError } from '../errors';
import {
  ORACLE_MIGRATIONS,
  ORACLE_TABLES,
  oracleRegistry,
} from '../test-support/oracle-registry';
import { extractCatalog } from './extract';
import { checkSurface, writeSurface } from './surface';

let catalog: PublicCatalog;
let directory: string;

beforeAll(async () => {
  catalog = toPublicCatalog(
    await extractCatalog({ migrations: () => ORACLE_MIGRATIONS }),
    ORACLE_TABLES,
  );
});

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pg-catalog-surface-'));
});

/** A configuration whose migrations do not exist, which the surface never reads. */
function config(
  teamFields?: object,
  surface: string | null = 'api/surface.json',
): ExtractionConfig {
  return {
    migrations: 'no-migrations-here',
    out: { catalog: 'catalog.ts' },
    resources: {
      registry: () => oracleRegistry(catalog, { teamFields }),
      ...(surface === null ? {} : { surface }),
    },
  };
}

function snapshotPath(): string {
  return join(directory, 'api', 'surface.json');
}

describe('writeSurface', () => {
  it('writes the surface as JSON indented by two spaces, creating its directory, then leaves it alone', async () => {
    const written = await writeSurface(config(), { cwd: directory });
    expect(written).toEqual({ file: snapshotPath(), status: 'written' });
    expect(await readFile(snapshotPath(), 'utf8')).toBe(
      `${JSON.stringify(surfaceOf(oracleRegistry(catalog) as never), null, 2)}\n`,
    );
    expect(await writeSurface(config(), { cwd: directory })).toEqual({
      file: snapshotPath(),
      status: 'unchanged',
    });
  });

  it('rewrites a file that holds anything else', async () => {
    await mkdir(join(directory, 'api'));
    await writeFile(snapshotPath(), '{}');
    expect((await writeSurface(config(), { cwd: directory })).status).toBe(
      'written',
    );
  });
});

describe('checkSurface', () => {
  it('reports a missing snapshot, writing nothing', async () => {
    expect(await checkSurface(config(), { cwd: directory })).toEqual({
      file: snapshotPath(),
      status: 'missing',
      changes: [],
    });
    await expect(readFile(snapshotPath())).rejects.toThrow(/ENOENT/u);
  });

  it('finds no change in a current snapshot, however it is formatted', async () => {
    await writeSurface(config(), { cwd: directory });
    const text = await readFile(snapshotPath(), 'utf8');
    await writeFile(snapshotPath(), JSON.stringify(JSON.parse(text)));
    expect(await checkSurface(config(), { cwd: directory })).toEqual({
      file: snapshotPath(),
      status: 'unchanged',
      changes: [],
    });
  });

  it('marks an operator added safe, and a write withdrawn and its NOT NULL code removed breaking', async () => {
    await writeSurface(config(), { cwd: directory });
    const safe = await checkSurface(
      config({ name: { access: 'readWrite', filter: ['eq'] } }),
      { cwd: directory },
    );
    expect(safe).toEqual({
      file: snapshotPath(),
      status: 'changed',
      changes: [
        {
          path: ['teams', 'fields', 'name', 'operators', 'eq'],
          change: 'added',
          breaking: false,
          before: null,
          after: 'eq',
        },
      ],
    });
    const breaking = await checkSurface(config({ name: { access: 'read' } }), {
      cwd: directory,
    });
    expect(breaking.status).toBe('changed');
    expect(
      breaking.changes.map(({ path, breaking: broke }) => [
        path.join('.'),
        broke,
      ]),
    ).toEqual([
      ['teams.fields.name.access', true],
      ['teams.fields.name.required', false],
      ['teams.codes.TEAMS_NAME_NOT_NULL', true],
    ]);
  });
});

describe('the surface commands refuse what they cannot run', () => {
  it('without resources or a surface file', async () => {
    const { resources: _resources, ...bare } = config();
    await expect(writeSurface(bare, { cwd: directory })).rejects.toThrow(
      new PgCatalogError(
        'config_invalid',
        'resources is not configured: set resources.registry to a function that returns the declared resources',
      ),
    );
    await expect(
      checkSurface(config(undefined, null), { cwd: directory }),
    ).rejects.toThrow(
      new PgCatalogError(
        'config_invalid',
        'resources.surface is not configured: set it to the file the surface is written to, such as api-surface.json',
      ),
    );
  });

  const registries: ReadonlyArray<readonly [string, () => unknown, string]> = [
    [
      'a registry function that returns no array',
      () => ({}),
      'resources.registry must return an array of declared resources',
    ],
    [
      'a registry with something other than a declared resource',
      () => [{ table: 'teams' }],
      'surface: surfaceOf.resources[0]: must be a resource declareResource returned',
    ],
  ];

  it.each(registries)('with %s', async (_name, registry, message) => {
    const broken = {
      ...config(),
      resources: { registry: registry as never, surface: 'surface.json' },
    };
    await expect(writeSurface(broken, { cwd: directory })).rejects.toThrow(
      new PgCatalogError('registry_invalid', message),
    );
  });

  it('throws what the registry function throws', async () => {
    const failure = new Error('cannot import the resources');
    const broken = {
      ...config(),
      resources: {
        registry: () => {
          throw failure;
        },
        surface: 'surface.json',
      },
    };
    await expect(checkSurface(broken, { cwd: directory })).rejects.toBe(
      failure,
    );
  });

  const files: ReadonlyArray<readonly [string, string, string]> = [
    [
      'is not JSON',
      '<<<<<<< HEAD\n{}',
      'the surface file api/surface.json does not hold valid JSON; write it again with pg-catalog surface',
    ],
    [
      'is of another format',
      '{ "format": 2, "resources": {} }',
      'the surface file api/surface.json is not a surface this version reads (parseSurface.format: format 2 is not supported (expected 1)); write it again with pg-catalog surface',
    ],
    [
      'is no surface',
      '{ "format": 1, "resources": { "teams": {} } }',
      'the surface file api/surface.json is not a surface this version reads (parseSurface.resources.teams.operations: Invalid input: expected array, received undefined); write it again with pg-catalog surface',
    ],
  ];

  it.each(files)('with a snapshot that %s', async (_name, text, message) => {
    await mkdir(join(directory, 'api'));
    await writeFile(snapshotPath(), text);
    await expect(checkSurface(config(), { cwd: directory })).rejects.toThrow(
      new PgCatalogError('surface_unreadable', message),
    );
  });
});
