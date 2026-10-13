// The extraction configuration of the contacts application, as the
// application keeps it next to its migrations. `pg-catalog extract` run in
// this directory writes catalog.ts and public-catalog.ts; the suite runs
// `pg-catalog extract --check` here to prove they are current.
import { defineExtraction } from '@nizam-os/pg-catalog';

export default defineExtraction({
  migrations: 'migrations',
  database: { pglite: { extensions: ['pg_trgm', 'btree_gist', 'citext'] } },
  schemas: ['public', 'audit'],
  out: {
    catalog: { file: 'catalog.ts', interface: 'ContactsCatalog' },
    public: {
      file: 'public-catalog.ts',
      interface: 'ContactsPublicCatalog',
      tables: [
        'badge_awards',
        'badges',
        'calls',
        'contacts',
        'contact_phones',
        'import_batches',
        'import_rows',
        'meetings',
        'notes',
        'organizations',
      ],
    },
  },
});
