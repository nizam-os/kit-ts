/**
 * Runtime-neutral checks (SPEC 13.1) over the built `@nizam-os/catalog-core`:
 * slice and diff the generated contacts catalog. No database and no
 * Node.js API, so the same module runs on Bun, Deno, and workerd.
 */
import type { Catalog } from '@nizam-os/catalog-core';

import type { Checks } from './report.ts';

import {
  CATALOG_FORMAT,
  diffCatalogs,
  toPublicCatalog,
} from '@nizam-os/catalog-core';

import { catalog } from '../fixtures/contacts/expected/catalog.ts';
import { publicCatalog } from '../fixtures/contacts/expected/public-catalog.ts';
import { check, sameJson } from './report.ts';

const PUBLIC_TABLES = ['contacts', 'contact_phones', 'organizations'];

/** The catalog a live database would have after `contacts_tenant_isolation` was dropped. */
function withoutTenantPolicy(): Catalog {
  const { contacts } = catalog.tables;
  return {
    ...catalog,
    tables: {
      ...catalog.tables,
      contacts: {
        ...contacts,
        rowSecurity: { ...contacts.rowSecurity, policies: {} },
      },
    },
  };
}

export const neutralChecks: Checks = {
  'the generated catalog has the current format': () => {
    const format: number = catalog.format;
    check(format === CATALOG_FORMAT, `format ${format}`);
  },
  'toPublicCatalog reproduces public-catalog.ts': () => {
    sameJson(
      toPublicCatalog(catalog, PUBLIC_TABLES),
      publicCatalog,
      'public slice',
    );
  },
  'diffCatalogs finds nothing between equal catalogs': () => {
    check(
      diffCatalogs(catalog, structuredClone(catalog)).changes.length === 0,
      'expected no changes',
    );
  },
  'diffCatalogs reports a removed policy at its path': () => {
    const [change, ...rest] = diffCatalogs(
      catalog,
      withoutTenantPolicy(),
    ).changes;
    check(
      rest.length === 0 && change?.kind === 'removed',
      `expected one removal, got ${JSON.stringify(change)}`,
    );
    check(
      change.path.join('.') ===
        'tables.contacts.rowSecurity.policies.contacts_tenant_isolation',
      `path ${change.path.join('.')}`,
    );
  },
};
