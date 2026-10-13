/**
 * The generated modules as an application uses them: imported as
 * TypeScript, assignable to the model types (the typecheck script compiles
 * this file against the built declarations), and consistent with the pure
 * functions of the core.
 */
import type { Catalog, PublicCatalog } from '@nizam-os/catalog-core';

import { readFile } from 'node:fs/promises';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { diffCatalogs, toPublicCatalog } from '@nizam-os/catalog-core';
import { parseCatalogModule } from '@nizam-os/pg-catalog';

import { catalog } from './fixtures/contacts/expected/catalog.ts';
import { publicCatalog } from './fixtures/contacts/expected/public-catalog.ts';
import { EXPECTED_CATALOG, PUBLIC_TABLES } from './support/contacts';

// Compile-time: the `as const` literals are assignable to the model.
const typedCatalog: Catalog = catalog;
const typedPublic: PublicCatalog = publicCatalog;

describe('the generated modules in an application', () => {
  it('keep literal types a declaration library can infer from', () => {
    expectTypeOf(
      catalog.tables.contacts.columns.kind.type,
    ).toEqualTypeOf<'contact_kind'>();
    expectTypeOf(catalog.enums.contact_kind).toEqualTypeOf<
      readonly ['person', 'company']
    >();
    expectTypeOf(
      publicCatalog.tables.organizations.columns.slug.maxLength,
    ).toEqualTypeOf<63>();
    expect(catalog.tables.contacts.columns.kind.type).toBe('contact_kind');
  });

  it('public-catalog.ts is exactly toPublicCatalog of catalog.ts', () => {
    expect(toPublicCatalog(typedCatalog, PUBLIC_TABLES)).toEqual(typedPublic);
  });

  it('parseCatalogModule reads the committed file back to the same catalog, with no diff', async () => {
    const parsed = parseCatalogModule(await readFile(EXPECTED_CATALOG, 'utf8'));
    expect(parsed).toEqual(typedCatalog);
    expect(diffCatalogs(typedCatalog, parsed).changes).toEqual([]);
  });

  it('diffCatalogs reports a column a live database gained, at its path', () => {
    const live = structuredClone(typedCatalog) as any;
    live.tables.contacts.columns.notes = live.tables.contacts.columns.nickname;
    expect(diffCatalogs(typedCatalog, live).changes).toEqual([
      {
        kind: 'added',
        path: ['tables', 'contacts', 'columns', 'notes'],
        actual: typedCatalog.tables['contacts']?.columns['nickname'],
      },
    ]);
  });
});
