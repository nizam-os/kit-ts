// The extraction configuration of the PostgreSQL 18 schema (resource SPEC
// 15.4): NOT ENFORCED constraints, which PostgreSQL 14 cannot parse, so it
// replays into PGlite (PostgreSQL 18) only. `pg-catalog extract` run in this
// directory writes catalog.ts and public-catalog.ts; the suite runs
// `pg-catalog extract --check` here to prove they are current.
import { defineExtraction } from '@nizam-os/pg-catalog';

export default defineExtraction({
  migrations: 'migrations',
  database: { pglite: {} },
  out: {
    catalog: { file: 'catalog.ts', interface: 'Postgres18Catalog' },
    public: {
      file: 'public-catalog.ts',
      interface: 'Postgres18PublicCatalog',
      tables: ['imported_contacts', 'owners'],
    },
  },
});
