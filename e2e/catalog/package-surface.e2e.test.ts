/**
 * Package surface. Both packages must resolve through their published
 * `exports` maps at runtime and export exactly the values the SPEC lists
 * (section 1) for what has shipped. Value imports on purpose: a missing
 * dist file or a wrong `exports` entry fails here before any feature test.
 */
import { describe, expect, it } from 'vitest';

import * as core from '@nizam-os/catalog-core';
import * as pgCatalog from '@nizam-os/pg-catalog';

function names(module: object): Array<string> {
  return Object.keys(module).toSorted();
}

const CORE = [
  'CATALOG_FORMAT',
  'diffCatalogs',
  'toCamelCase',
  'toPublicCatalog',
  'toSnakeCase',
].toSorted();

const PG_CATALOG = [
  'PgCatalogError',
  'checkRules',
  'checkSurface',
  'defineExtraction',
  'drift',
  'extract',
  'extractCatalog',
  'formatDiff',
  'formatRules',
  'formatSurface',
  'introspectCatalog',
  'isPgCatalogError',
  'parseCatalogModule',
  'renderCatalogModule',
  'renderKyselyTypes',
  'renderPublicCatalogModule',
  'writeSurface',
].toSorted();

describe('package surface (SPEC 1)', () => {
  it('@nizam-os/catalog-core exports the documented values', () => {
    expect(names(core)).toEqual(CORE);
  });

  it('@nizam-os/pg-catalog re-exports the core bindings themselves and adds its own', () => {
    expect(names(pgCatalog)).toEqual([...CORE, ...PG_CATALOG].toSorted());
    expect(pgCatalog.toPublicCatalog).toBe(core.toPublicCatalog);
    expect(pgCatalog.diffCatalogs).toBe(core.diffCatalogs);
    expect(pgCatalog.CATALOG_FORMAT).toBe(core.CATALOG_FORMAT);
    expect(pgCatalog.toCamelCase).toBe(core.toCamelCase);
    expect(pgCatalog.toSnakeCase).toBe(core.toSnakeCase);
  });

  it('resolves package.json through the exports maps', async () => {
    const corePackage = (await import('@nizam-os/catalog-core/package.json', {
      with: { type: 'json' },
    })) as {
      default: { name: string };
    };
    const pgPackage = (await import('@nizam-os/pg-catalog/package.json', {
      with: { type: 'json' },
    })) as {
      default: { name: string };
    };
    expect(corePackage.default.name).toBe('@nizam-os/catalog-core');
    expect(pgPackage.default.name).toBe('@nizam-os/pg-catalog');
  });
});
