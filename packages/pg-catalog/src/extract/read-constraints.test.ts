import type { Catalog, CatalogTable } from '@nizam-os/catalog-core';

import { beforeAll, describe, expect, it } from 'vitest';

import { readReplayed } from '../test-support/replayed';
import {
  portableMigrations,
  postgres18Migrations,
} from '../test-support/schema';

let catalog: Catalog;

beforeAll(async () => {
  catalog = await readReplayed(
    [...portableMigrations, ...postgres18Migrations],
    ['public', 'audit'],
  );
});

function table(name: string): CatalogTable {
  const found = catalog.tables[name];
  if (found === undefined) {
    throw new Error(`the catalog has no table ${name}`);
  }
  return found;
}

describe('readCatalog: constraints (SPEC 2.5)', () => {
  it('reads every constraint kind, sorted by name', () => {
    expect(table('contacts').constraints).toEqual({
      contacts_email_key: {
        kind: 'unique',
        columns: ['organization_id', 'email'],
        nullsDistinct: true,
        definition: 'UNIQUE (organization_id, email)',
      },
      contacts_name_length: {
        kind: 'check',
        columns: ['name'],
        expression: '((char_length(name) >= 1) AND (char_length(name) <= 200))',
        rule: { kind: 'length', min: 1, max: 200 },
        validated: true,
        enforced: true,
        definition:
          'CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200)))',
      },
      contacts_no_overlap: {
        kind: 'exclusion',
        columns: ['organization_id', 'period'],
        definition:
          'EXCLUDE USING gist (organization_id WITH =, period WITH &&)',
      },
      contacts_organization_fk: {
        kind: 'foreignKey',
        columns: ['organization_id'],
        references: { table: 'organizations', columns: ['id'] },
        onUpdate: 'noAction',
        onDelete: 'cascade',
        validated: true,
        enforced: true,
        definition:
          'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE',
      },
      contacts_pkey: {
        kind: 'primaryKey',
        columns: ['id'],
        definition: 'PRIMARY KEY (id)',
      },
    });
  });

  it('decodes the referential actions and NOT VALID across schemas', () => {
    expect(
      table('audit.events').constraints['events_contact_fk'],
    ).toMatchObject({
      references: { table: 'contacts', columns: ['id'] },
      onUpdate: 'restrict',
      onDelete: 'setNull',
      validated: false,
    });
    expect(
      table('audit.events').constraints['events_organization_id_fkey'],
    ).toMatchObject({ onDelete: 'setDefault' });
  });

  it('leaves out the foreign keys PostgreSQL clones for the partitions of a referenced table', () => {
    // PostgreSQL adds one constraint per partition of `readings` to
    // reading_notes, named differently on each major; only the declared one
    // belongs in the catalog.
    expect(table('reading_notes').constraints).toEqual({
      reading_notes_pkey: {
        kind: 'primaryKey',
        columns: ['id'],
        definition: 'PRIMARY KEY (id)',
      },
      reading_notes_reading_fk: {
        kind: 'foreignKey',
        columns: ['sensor_id', 'taken_on'],
        references: { table: 'readings', columns: ['sensor_id', 'taken_on'] },
        onUpdate: 'noAction',
        onDelete: 'noAction',
        validated: true,
        enforced: true,
        definition:
          'FOREIGN KEY (sensor_id, taken_on) REFERENCES readings(sensor_id, taken_on)',
      },
    });
  });

  it('reads NULLS NOT DISTINCT and NOT ENFORCED (PostgreSQL 15 and 18)', () => {
    const { constraints } = table('modern');
    expect(constraints['modern_code_key']).toEqual({
      kind: 'unique',
      columns: ['code'],
      nullsDistinct: false,
      definition: 'UNIQUE NULLS NOT DISTINCT (code)',
    });
    expect(constraints['modern_positive']).toMatchObject({
      validated: false,
      enforced: false,
    });
    expect(constraints['modern_owner_fk']).toMatchObject({
      enforced: false,
      definition: 'FOREIGN KEY (owner) REFERENCES modern(id) NOT ENFORCED',
    });
  });
});

describe('readCatalog: indexes and row security (SPEC 2.6, 2.7)', () => {
  it('lists every index, including those behind constraints, with expression elements as null', () => {
    const { indexes } = table('contacts');
    expect(Object.keys(indexes)).toEqual([
      'contacts_email_key',
      'contacts_lower_email',
      'contacts_name_trgm',
      'contacts_no_overlap',
      'contacts_pkey',
    ]);
    expect(indexes['contacts_lower_email']).toEqual({
      method: 'btree',
      unique: false,
      primary: false,
      nullsDistinct: true,
      columns: [null],
      include: ['name'],
      predicate: '(email IS NOT NULL)',
      definition:
        'CREATE INDEX contacts_lower_email ON public.contacts USING btree (lower((email)::text)) INCLUDE (name) WHERE (email IS NOT NULL)',
    });
    expect(indexes['contacts_name_trgm']).toMatchObject({
      method: 'gin',
      columns: ['name'],
    });
    expect(indexes['contacts_pkey']).toMatchObject({
      unique: true,
      primary: true,
    });
    expect(table('modern').indexes['modern_code_key']).toMatchObject({
      nullsDistinct: false,
    });
  });

  it('reads forced row security and every policy command, with roles sorted and PUBLIC as public', () => {
    expect(table('contacts').rowSecurity).toEqual({
      enabled: true,
      forced: true,
      policies: {
        contacts_delete: {
          command: 'delete',
          permissive: true,
          roles: ['catalog_auditor'],
          using: 'false',
          withCheck: null,
        },
        contacts_insert: {
          command: 'insert',
          permissive: true,
          roles: ['public'],
          using: null,
          withCheck: "(kind = 'person'::contact_kind)",
        },
        contacts_reader: {
          command: 'select',
          permissive: false,
          roles: ['catalog_auditor', 'catalog_reader'],
          using: 'true',
          withCheck: null,
        },
        contacts_tenant: {
          command: 'all',
          permissive: true,
          roles: ['public'],
          using:
            "(organization_id = (current_setting('app.organization'::text))::bigint)",
          withCheck: null,
        },
        contacts_update: {
          command: 'update',
          permissive: true,
          roles: ['public'],
          using: 'true',
          withCheck: 'true',
        },
      },
    });
    expect(table('audit.events').rowSecurity).toEqual({
      enabled: false,
      forced: false,
      policies: {},
    });
  });
});
