import type {
  Catalog,
  CatalogColumn,
  CatalogTable,
} from '@nizam-os/catalog-core';

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

/** A column with every member at its plain value, overridden by `members`. */
function column(members: Partial<CatalogColumn>): CatalogColumn {
  return {
    type: 'text',
    typeKind: 'base',
    array: false,
    sqlType: 'text',
    maxLength: null,
    precision: null,
    scale: null,
    collation: null,
    nullable: true,
    default: null,
    identity: null,
    generated: null,
    comment: null,
    ...members,
  };
}

describe('readCatalog: tables and columns (SPEC 2.3, 2.4)', () => {
  it('keys tables by reference name and reads the comment and the primary key', () => {
    expect(table('audit.events')).toMatchObject({
      schema: 'audit',
      name: 'events',
      primaryKey: ['id'],
    });
    expect(table('organizations')).toMatchObject({
      comment: 'Tenants.',
      primaryKey: ['id'],
    });
    expect(table('measurements').primaryKey).toBeNull();
  });

  it('lists columns in attnum order with the members in the order of SPEC 2.4', () => {
    const { columns } = table('contacts');
    expect(Object.keys(columns)).toEqual([
      'id',
      'organization_id',
      'kind',
      'name',
      'email',
      'tags',
      'balance',
      'score',
      'code',
      'Display Name',
      'search',
      'seq',
      'period',
    ]);
    expect(Object.keys(columns['id'] ?? {})).toEqual(Object.keys(column({})));
  });

  it('decodes modifiers and accepts the constant defaults of SPEC 7.3', () => {
    const { columns } = table('contacts');
    expect(columns['balance']).toEqual(
      column({
        type: 'numeric',
        sqlType: 'numeric(12,2)',
        precision: 12,
        scale: 2,
        default: { expression: '0', literal: '0' },
      }),
    );
    expect(columns['score']).toEqual(
      column({
        type: 'float8',
        sqlType: 'double precision',
        default: { expression: "'-0.5'::numeric", literal: '-0.5' },
      }),
    );
    expect(columns['code']).toEqual(
      column({
        type: 'bpchar',
        sqlType: 'character(3)',
        maxLength: 3,
        default: { expression: "'abc'::bpchar", literal: 'abc' },
      }),
    );
  });

  it('keeps the expression and gives no literal for function calls and sequences', () => {
    expect(table('contacts').columns['id']?.default).toEqual({
      expression: 'gen_random_uuid()',
      literal: null,
    });
    expect(table('audit.events').columns['id']?.default).toEqual({
      expression: "nextval('events_id_seq'::regclass)",
      literal: null,
    });
  });

  it('reads enum, domain, array-of-domain, and range columns; a domain column carries no modifiers', () => {
    const { columns } = table('contacts');
    expect(columns['kind']).toEqual(
      column({
        type: 'contact_kind',
        typeKind: 'enum',
        sqlType: 'contact_kind',
        nullable: false,
        default: { expression: "'person'::contact_kind", literal: 'person' },
      }),
    );
    expect(columns['email']).toEqual(
      column({ type: 'email', typeKind: 'domain', sqlType: 'email' }),
    );
    expect(columns['tags']).toEqual(
      column({
        type: 'tag',
        typeKind: 'domain',
        array: true,
        sqlType: 'tag[]',
        nullable: false,
        default: { expression: "'{}'::tag[]", literal: '{}' },
      }),
    );
    expect(columns['period']).toEqual(
      column({ type: 'tstzrange', typeKind: 'range', sqlType: 'tstzrange' }),
    );
  });

  it('qualifies a type outside the default schema while sqlType keeps format_type spelling', () => {
    expect(table('audit.events').columns['action']).toEqual(
      column({
        type: 'audit.action',
        typeKind: 'enum',
        sqlType: 'action',
        nullable: false,
      }),
    );
  });

  it('reads an explicit collation, a quoted name, and a column comment', () => {
    expect(table('contacts').columns['Display Name']).toEqual(
      column({ collation: 'C' }),
    );
    expect(table('contacts').columns['name']).toEqual(
      column({ nullable: false, comment: 'The display name.' }),
    );
  });

  it('reads identity columns, which have no default', () => {
    expect(table('organizations').columns['id']).toEqual(
      column({
        type: 'int8',
        sqlType: 'bigint',
        nullable: false,
        identity: 'always',
      }),
    );
    expect(table('contacts').columns['seq']).toEqual(
      column({
        type: 'int4',
        sqlType: 'integer',
        nullable: false,
        identity: 'byDefault',
      }),
    );
  });

  it('reads generated columns with their expression and no default, stored and (PostgreSQL 18) virtual', () => {
    expect(table('contacts').columns['search']).toEqual(
      column({
        type: 'tsvector',
        sqlType: 'tsvector',
        generated: {
          kind: 'stored',
          expression:
            "to_tsvector('english'::regconfig, ((COALESCE(name, ''::text) || ' '::text) || COALESCE((email)::text, ''::text)))",
          searchConfig: 'english',
        },
      }),
    );
    expect(table('modern').columns['doubled']).toEqual(
      column({
        type: 'int4',
        sqlType: 'integer',
        generated: {
          kind: 'virtual',
          expression: '(id * 2)',
          searchConfig: null,
        },
      }),
    );
  });

  it('decodes negative scales and scales above the precision (PostgreSQL 15 and later)', () => {
    expect(table('modern').columns['amount']).toMatchObject({
      sqlType: 'numeric(5,-2)',
      precision: 5,
      scale: -2,
    });
    expect(table('modern').columns['ratio']).toMatchObject({
      sqlType: 'numeric(3,5)',
      precision: 3,
      scale: 5,
    });
  });
});
