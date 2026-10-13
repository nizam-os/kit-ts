/**
 * The compile errors of SPEC 11.2 that the unit-test catalog has no table
 * for: a primary key keyset-core cannot order, and a search configuration
 * keyset-core cannot emit, declared or generated.
 */
import type { DeclarationCheck, IdentityCheck } from './declaration-check';
import type { DeclareContext } from './registries';
import type { SearchDeclaration } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from './create-declare-resource';

const NOT_NULL = {
  typeKind: 'base',
  array: false,
  maxLength: null,
  precision: null,
  scale: null,
  nullable: false,
  default: null,
  identity: null,
  generated: null,
} as const;

/** A table keyed by `id` with the given columns and no constraint but its key. */
function keyed<const TColumns extends object>(name: string, columns: TColumns) {
  return {
    schema: 'public',
    name,
    primaryKey: ['id'],
    columns,
    constraints: {},
  } as const;
}

const catalog = {
  format: 3,
  enums: { void_kind: [], mood: ['calm', 'tense'] },
  domains: {},
  tables: {
    voids: keyed('voids', {
      id: {
        ...NOT_NULL,
        type: 'void_kind',
        typeKind: 'enum',
        sqlType: 'void_kind',
      },
    }),
    moods: keyed('moods', {
      id: { ...NOT_NULL, type: 'mood', typeKind: 'enum', sqlType: 'mood' },
    }),
    documents: keyed('documents', {
      id: { ...NOT_NULL, type: 'uuid', sqlType: 'uuid' },
      heading: { ...NOT_NULL, type: 'text', sqlType: 'text' },
      body: { ...NOT_NULL, type: 'tsvector', sqlType: 'tsvector' },
      title: {
        ...NOT_NULL,
        type: 'tsvector',
        sqlType: 'tsvector',
        generated: { kind: 'stored', searchConfig: 'app.unaccented' },
      },
    }),
  },
} as const;

type Context = DeclareContext<typeof catalog>;
const declareResource = createDeclareResource({ catalog });

/** The messages a declaration over `documents` with `search` gets at that member. */
type SearchMessages<TSearch extends SearchDeclaration> =
  DeclarationCheck<
    Context,
    'documents',
    {
      operations: readonly ['list'];
      fields: { heading: { access: 'read' } };
      search: TSearch;
    }
  > extends { readonly search: infer TCheck }
    ? keyof TCheck
    : never;

describe('the primary key keyset-core orders by (SPEC 11.2)', () => {
  it('refuses an enum key without labels where the table is named', () => {
    expectTypeOf<
      keyof IdentityCheck<Context, 'voids'>
    >().toEqualTypeOf<'voids: the primary key is an enum without values, which @nizam-os/keyset-core cannot order'>();
    expectTypeOf<keyof IdentityCheck<Context, 'moods'>>().toBeNever();
    // @ts-expect-error void_kind has no labels
    declareResource('voids', { operations: ['get'], fields: {} });
    declareResource('moods', { operations: ['get'], fields: {} });
  });
});

describe('the search configuration keyset-core emits (SPEC 11.2)', () => {
  it('refuses a declared configuration outside the regconfig syntax', () => {
    expectTypeOf<
      SearchMessages<{
        readonly column: 'body';
        readonly config: 'pg_catalog.english';
      }>
    >().toEqualTypeOf<'search.config: "pg_catalog.english" is not a text search configuration @nizam-os/keyset-core accepts (^[a-z_][a-z0-9_]{0,62}$)'>();
    expectTypeOf<
      SearchMessages<{ readonly column: 'body'; readonly config: 'english' }>
    >().toBeNever();
    declareResource('documents', {
      operations: ['list'],
      fields: {},
      // @ts-expect-error a qualified configuration name
      search: { column: 'body', config: 'pg_catalog.english' },
    });
  });

  it('refuses a generated configuration outside the regconfig syntax', () => {
    expectTypeOf<
      SearchMessages<{ readonly column: 'title' }>
    >().toEqualTypeOf<'search.column: the column is generated with config "app.unaccented", which @nizam-os/keyset-core does not accept (^[a-z_][a-z0-9_]{0,62}$)'>();
    declareResource('documents', {
      operations: ['list'],
      fields: {},
      // @ts-expect-error the column is generated with a qualified configuration
      search: { column: 'title' },
    });
  });
});
