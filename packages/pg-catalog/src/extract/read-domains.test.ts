import type { Catalog } from '@nizam-os/catalog-core';

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

const modifiers = { maxLength: null, precision: null, scale: null };

describe('readCatalog: domains (SPEC 2.8)', () => {
  it('lists the domains of the configured schemas by key, leaving out the ones an extension owns', () => {
    // earthdistance creates the domain earth in public; pg_depend marks it deptype 'e'.
    expect(Object.keys(catalog.domains)).toEqual([
      'amount',
      'email',
      'kind_code',
      'required_text',
      'short_text',
      'tag',
      'tag_list',
    ]);
  });

  it('reads the base type, its modifiers, the default, and every CHECK with its validation state', () => {
    expect(catalog.domains['amount']).toEqual({
      schema: 'public',
      name: 'amount',
      type: 'numeric',
      typeKind: 'base',
      array: false,
      sqlType: 'numeric(12,2)',
      maxLength: null,
      precision: 12,
      scale: 2,
      collation: null,
      nullable: true,
      default: { expression: '0', literal: '0' },
      constraints: {
        amount_cap: {
          kind: 'check',
          expression: '(VALUE < (1000000)::numeric)',
          rule: {
            kind: 'range',
            min: null,
            max: { value: '1000000', inclusive: false },
          },
          validated: false,
          definition: 'CHECK ((VALUE < (1000000)::numeric)) NOT VALID',
        },
        amount_check: {
          kind: 'check',
          expression: '(VALUE > (0)::numeric)',
          rule: {
            kind: 'range',
            min: { value: '0', inclusive: false },
            max: null,
          },
          validated: true,
          definition: 'CHECK ((VALUE > (0)::numeric))',
        },
      },
      comment: null,
    });
  });

  it('writes the members in the order of SPEC 2.8', () => {
    expect(Object.keys(catalog.domains['amount'] ?? {})).toEqual([
      'schema',
      'name',
      'type',
      'typeKind',
      'array',
      'sqlType',
      'maxLength',
      'precision',
      'scale',
      'collation',
      'nullable',
      'default',
      'constraints',
      'comment',
    ]);
  });

  it('reads a collation that differs from the base type, and the comment', () => {
    expect(catalog.domains['email']).toMatchObject({
      type: 'text',
      collation: 'C',
      comment: 'An email address.',
      constraints: {
        email_check: {
          expression: "(VALUE ~ '^[^@]+@[^@]+$'::text)",
          definition: "CHECK ((VALUE ~ '^[^@]+@[^@]+$'::text))",
        },
      },
    });
  });

  it('reads NOT NULL from typnotnull, never as a constraint, on every major (PostgreSQL 17 stores a row too)', () => {
    expect(catalog.domains['short_text']).toMatchObject({
      type: 'varchar',
      sqlType: 'character varying(40)',
      maxLength: 40,
      nullable: false,
      constraints: {
        short_text_check: {
          kind: 'check',
          expression: '(char_length((VALUE)::text) >= 1)',
          validated: true,
        },
      },
    });
    expect(catalog.domains['required_text']).toMatchObject({
      nullable: false,
      constraints: {},
    });
  });

  it('names a domain over a domain by the inner domain, which carries the modifiers', () => {
    expect(catalog.domains['tag']).toMatchObject({
      type: 'short_text',
      typeKind: 'domain',
      array: false,
      sqlType: 'short_text',
      ...modifiers,
      nullable: true,
    });
  });

  it('reads a domain over an enum with the default literal, and a domain over an array', () => {
    expect(catalog.domains['kind_code']).toMatchObject({
      type: 'contact_kind',
      typeKind: 'enum',
      default: { expression: "'person'::contact_kind", literal: 'person' },
    });
    expect(catalog.domains['tag_list']).toMatchObject({
      type: 'text',
      typeKind: 'base',
      array: true,
      sqlType: 'text[]',
    });
  });
});
