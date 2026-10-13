/**
 * Extraction checks for runtimes with a file system and WebAssembly (Bun
 * and Deno): replay the contacts migrations into PGlite through the built
 * `@nizam-os/pg-catalog` and compare with the reviewed catalog module and
 * Kysely types of both drivers, byte for byte.
 */
import type { Checks } from './report.ts';

import { readFile } from 'node:fs/promises';

import {
  extractCatalog,
  renderCatalogModule,
  renderKyselyTypes,
} from '@nizam-os/pg-catalog';

import { catalog } from '../fixtures/contacts/expected/catalog.ts';
import {
  EXPECTED_CATALOG,
  EXPECTED_PGLITE_TYPES,
  EXPECTED_TYPES,
  MIGRATIONS_DIR,
  PGLITE_EXTENSIONS,
} from '../support/contacts.ts';
import { check, sameJson } from './report.ts';

export const extractChecks: Checks = {
  'extractCatalog on PGlite reproduces the reviewed catalog and Kysely types':
    async () => {
      const extracted = await extractCatalog({
        migrations: MIGRATIONS_DIR,
        database: { pglite: { extensions: PGLITE_EXTENSIONS } },
        schemas: ['public', 'audit'],
      });
      sameJson(extracted, catalog, 'catalog');
      check(
        renderCatalogModule(extracted) ===
          (await readFile(EXPECTED_CATALOG, 'utf8')),
        'catalog module',
      );
      check(
        renderKyselyTypes(extracted) ===
          (await readFile(EXPECTED_TYPES, 'utf8')),
        'Kysely types',
      );
      check(
        renderKyselyTypes(extracted, { driver: 'pglite' }) ===
          (await readFile(EXPECTED_PGLITE_TYPES, 'utf8')),
        'Kysely types for PGlite',
      );
    },
};
