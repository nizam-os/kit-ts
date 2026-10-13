/**
 * checkRules (SPEC 10.3) end to end: the resources of
 * `@nizam-os/resource-core` declared over the catalog extracted from the
 * test application's migrations, replayed into PGlite (and the server
 * `CATALOG_PG_URL` names), agree with the database on every fixture; each
 * fault planted in a validator, a storage codec, or the catalog is
 * reported; and the configuration's mistakes fail before any replay.
 */
import type { PublicCatalog } from '@nizam-os/catalog-core';

import type { ExtractionConfig, ResourcesConfig } from '../config';

import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toPublicCatalog } from '@nizam-os/catalog-core';
import { defineValidator } from '@nizam-os/resource-core';

import { PgCatalogError } from '../errors';
import {
  ORACLE_MIGRATIONS,
  ORACLE_TABLES,
  oracleRegistry,
  slotsText,
} from '../test-support/oracle-registry';
import { extractCatalog } from './extract';
import { checkRules } from './rules';

const SERVER = process.env['CATALOG_PG_URL'];

let catalog: PublicCatalog;

beforeAll(async () => {
  catalog = toPublicCatalog(
    await extractCatalog({ migrations: () => ORACLE_MIGRATIONS }),
    ORACLE_TABLES,
  );
});

function config(
  resources: Partial<ResourcesConfig> = {},
  changes: Partial<ExtractionConfig> = {},
): ExtractionConfig {
  return {
    migrations: () => ORACLE_MIGRATIONS,
    out: {
      catalog: 'catalog.ts',
      public: { file: 'public.ts', tables: [...ORACLE_TABLES] },
    },
    resources: {
      registry: () => oracleRegistry(catalog),
      storage: { slots: slotsText },
      ...resources,
    },
    ...changes,
  };
}

function failing(report: Awaited<ReturnType<typeof checkRules>>) {
  return report.cases
    .filter(
      ({ problem, disagreements }) =>
        problem !== null || disagreements.length > 0,
    )
    .map(({ subject, problem, disagreements }) => ({
      subject,
      problem,
      disagreements: disagreements.map(
        ({ label, reason }) => `${label}: ${reason}`,
      ),
    }));
}

describe('checkRules (SPEC 10.3)', () => {
  it('runs every case of the registry and finds the declarations and PGlite agree', async () => {
    const report = await checkRules(config());
    expect(
      report.cases.map(({ kind, subject }) => `${kind} ${subject}`),
    ).toEqual([
      'field teams.name',
      'field teams.code',
      'validator teams CHECK teams_code_check (validator noHyphen)',
      'codec teams.slots (codec slots)',
      'field members.handle',
      'field members.note',
      'relationship members.team',
      'validator domain handle CHECK handle_check (validator noSpace)',
      'validator members CHECK members_team_or_note (validator teamOrNote)',
    ]);
    expect(report.cases.every(({ fixtures }) => fixtures > 0)).toBe(true);
    expect(failing(report)).toEqual([]);
    expect(report.unusedTables).toEqual([]);
  });

  it('reports a validator that refuses what its CHECK holds', async () => {
    const strict = defineValidator({
      schema: z
        .string()
        .refine((code) => !code.includes('-') && !code.includes('_')),
      fixtures: { accept: ['ab'], reject: ['a-b', 'a_b'] },
    });
    const report = await checkRules(
      config({
        registry: () =>
          oracleRegistry(catalog, { validators: { noHyphen: strict } }),
      }),
    );
    expect(failing(report)).toEqual([
      {
        subject: 'teams CHECK teams_code_check (validator noHyphen)',
        problem: null,
        disagreements: [
          'reject[1]: the validator refuses it; the database accepts it',
        ],
      },
    ]);
  });

  it('reports a storage codec whose text the database reads as another value, and one that cannot write a fixture', async () => {
    const report = await checkRules(
      config({
        storage: {
          slots: {
            read: slotsText.read,
            write: ({
              from,
              to,
            }: {
              readonly from: number;
              readonly to: number;
            }) => {
              if (from < 0) {
                throw new RangeError('a negative slot');
              }
              return `[${from},${to}]`;
            },
          },
        },
      }),
    );
    expect(failing(report)).toEqual([
      {
        subject: 'teams.slots (codec slots)',
        problem: null,
        disagreements: [
          'fixtures[0]: the database stores [1,6), which reads back as {"from":1,"to":6}',
          'fixtures[1]: the storage codec cannot write it: a negative slot',
        ],
      },
    ]);
  });

  it('reports the cases a catalog older than the migrations names objects for', async () => {
    const renamed = ORACLE_MIGRATIONS.map(({ name, sql }) => ({
      name,
      sql: sql.replace('teams_code_check', 'teams_code_no_hyphen'),
    }));
    const report = await checkRules(config({}, { migrations: () => renamed }));
    const problem =
      'the replayed database has no CHECK teams_code_check on teams';
    expect(failing(report)).toEqual([
      { subject: 'teams.code', problem, disagreements: [] },
      {
        subject: 'teams CHECK teams_code_check (validator noHyphen)',
        problem,
        disagreements: [],
      },
    ]);
  });

  it('lists the public tables no declared resource reads', async () => {
    const report = await checkRules(
      config({ registry: () => oracleRegistry(catalog).slice(0, 1) }),
    );
    expect(report.unusedTables).toEqual(['members']);
  });
});

describe('checkRules refuses a configuration it cannot run', () => {
  it('without resources', async () => {
    const { resources: _resources, ...withoutResources } = config();
    await expect(checkRules(withoutResources)).rejects.toThrow(
      new PgCatalogError(
        'config_invalid',
        'resources is not configured: set resources.registry to a function that returns the declared resources',
      ),
    );
  });

  const registries: ReadonlyArray<
    readonly [string, ResourcesConfig['registry'], string]
  > = [
    [
      'a registry function that returns no array',
      // A JavaScript configuration can return anything.
      () => ({}) as never,
      'resources.registry must return an array of declared resources',
    ],
    [
      'a registry with something other than a declared resource',
      () => [{ table: 'teams' }],
      'rules: oracleCases.resources[0]: must be a resource declareResource returned',
    ],
  ];

  it.each(registries)('with %s', async (_name, registry, message) => {
    await expect(checkRules(config({ registry }))).rejects.toThrow(
      new PgCatalogError('registry_invalid', message),
    );
  });

  it('without the storage codec of a codec a field names', async () => {
    const report = checkRules(config({ storage: {} }));
    await expect(report).rejects.toThrow(
      new PgCatalogError(
        'registry_invalid',
        'rules: oracleCases.options.storage.slots: must be a storage codec over text, since teams.slots names codec slots',
      ),
    );
  });

  it('throws what the registry function throws', async () => {
    const failure = new Error('cannot import the resources');
    await expect(
      checkRules(
        config({
          registry: () => {
            throw failure;
          },
        }),
      ),
    ).rejects.toBe(failure);
  });
});

describe.skipIf(SERVER === undefined)(
  'checkRules on a PostgreSQL server',
  () => {
    it('finds the declarations and the server agree', async () => {
      const report = await checkRules(
        config({}, { database: { url: () => SERVER } }),
      );
      expect(failing(report)).toEqual([]);
    });
  },
);
