/**
 * The contacts application of `fixtures/contacts/`: its extraction
 * configuration, relative to a project directory that holds the
 * `migrations/` folder, and the paths of the files `extract` must produce.
 */
import type { ExtractionConfig } from '@nizam-os/pg-catalog';

import { fileURLToPath } from 'node:url';

function fixture(path: string): string {
  return fileURLToPath(
    new URL(`../fixtures/contacts/${path}`, import.meta.url),
  );
}

export const MIGRATIONS_DIR: string = fixture('migrations/');
export const EXPECTED_CATALOG: string = fixture('expected/catalog.ts');
export const EXPECTED_PUBLIC: string = fixture('expected/public-catalog.ts');
export const EXPECTED_TYPES: string = fixture('expected/db.ts');
/** The types rendered with `camelCase: true`, for applications that use CamelCasePlugin. */
export const EXPECTED_CAMEL_TYPES: string = fixture('expected/db-camel.ts');
/** The types rendered with `driver: 'pglite'`, for applications on Kysely's PGliteDialect. */
export const EXPECTED_PGLITE_TYPES: string = fixture('expected/db-pglite.ts');

export const PUBLIC_TABLES: ReadonlyArray<string> = [
  'contacts',
  'contact_phones',
  'organizations',
];
export const PGLITE_EXTENSIONS: ReadonlyArray<string> = [
  'pg_trgm',
  'btree_gist',
  'citext',
];

/** The configuration an application would keep in `pg-catalog.config.ts`. */
export const contactsConfig: ExtractionConfig = {
  migrations: 'migrations',
  database: { pglite: { extensions: PGLITE_EXTENSIONS } },
  schemas: ['public', 'audit'],
  out: {
    catalog: 'src/db/catalog.ts',
    public: { file: 'src/db/public-catalog.ts', tables: PUBLIC_TABLES },
    types: 'src/db/db.ts',
  },
};

/** What a hotfix outside the migrations leaves behind: a column added, a policy dropped, a CHECK loosened. */
export const HOTFIX = `alter table contacts add column fax text;
drop policy meetings_tenant_isolation on meetings;
alter table organizations drop constraint organizations_seats_check,
  add constraint organizations_seats_check check (seats >= 0);`;

/** `formatDiff` of the committed catalog against a database after `HOTFIX`. */
export const HOTFIX_REPORT: string = [
  '3 objects differ: 1 added, 1 removed, 1 changed',
  '',
  'Columns',
  '  + contacts.fax',
  '',
  'Constraints',
  '  ~ organizations.organizations_seats_check',
  '      expression: expected "(seats > 0)", actual "(seats >= 0)"',
  '      rule.min.inclusive: expected false, actual true',
  '      definition: expected "CHECK ((seats > 0))", actual "CHECK ((seats >= 0))"',
  '',
  'Policies',
  '  - meetings.meetings_tenant_isolation',
].join('\n');
