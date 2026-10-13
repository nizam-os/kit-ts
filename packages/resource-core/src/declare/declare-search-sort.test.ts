import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { typeErrorOf } from '../test-support/failure';

const declare = untypedDeclare();
const base = {
  operations: ['list', 'get'],
  fields: { name: { access: 'read', sort: true } },
};

const withDefaultSort = (entries: unknown) => () =>
  declare('contacts', {
    operations: ['list'],
    fields: {
      name: { access: 'read', sort: true },
      kind: { access: 'read' },
      created_at: { access: 'read', sort: true },
    },
    sort: { default: entries },
  });

describe('declareResource: search, sort, and page (SPEC 3.7)', () => {
  it('refuses a search column that is not a tsvector, and a config that differs from the generated one', () => {
    expect(
      typeErrorOf(() =>
        declare('contacts', { ...base, search: { column: 'name' } }),
      ),
    ).toBe(
      'contacts.search.column: "name" is not a tsvector column of contacts',
    );
    expect(
      typeErrorOf(() =>
        declare('contacts', {
          ...base,
          search: { column: 'search', config: 'english' },
        }),
      ),
    ).toBe(
      'contacts.search.config: the column is generated with config "simple"',
    );
    expect(() =>
      declare('contacts', {
        ...base,
        search: { column: 'search', config: 'simple' },
      }),
    ).not.toThrow();
  });

  it('requires a config for a tsvector column the application maintains', () => {
    const documents = untypedDeclare(
      catalogOf({
        documents: table('documents', {
          id: column({ type: 'uuid' }),
          body_vector: column({ type: 'tsvector', sqlType: 'tsvector' }),
        }),
      }),
    );
    const declaration = {
      operations: ['list'],
      fields: {},
      search: { column: 'body_vector' },
    };
    expect(typeErrorOf(() => documents('documents', declaration))).toBe(
      'documents.search.config: required, because body_vector is not generated with a configuration',
    );
    expect(() =>
      documents('documents', {
        ...declaration,
        search: { column: 'body_vector', config: 'english' },
      }),
    ).not.toThrow();
  });

  it('refuses a configuration keyset-core cannot emit, declared or generated', () => {
    const documents = untypedDeclare(
      catalogOf({
        documents: table('documents', {
          id: column({ type: 'uuid' }),
          body_vector: column({ type: 'tsvector', sqlType: 'tsvector' }),
          title_vector: column({
            type: 'tsvector',
            sqlType: 'tsvector',
            generated: { kind: 'stored', searchConfig: 'app.unaccented' },
          }),
        }),
      }),
    );
    expect(
      typeErrorOf(() =>
        documents('documents', {
          operations: ['list'],
          fields: {},
          search: { column: 'body_vector', config: 'pg_catalog.english' },
        }),
      ),
    ).toBe(
      'documents.search.config: "pg_catalog.english" is not a text search configuration @nizam-os/keyset-core accepts (^[a-z_][a-z0-9_]{0,62}$)',
    );
    expect(
      typeErrorOf(() =>
        documents('documents', {
          operations: ['list'],
          fields: {},
          search: { column: 'title_vector' },
        }),
      ),
    ).toBe(
      'documents.search.column: the column is generated with config "app.unaccented", which @nizam-os/keyset-core does not accept (^[a-z_][a-z0-9_]{0,62}$)',
    );
  });

  it('refuses a default sort over a field without sort: true', () => {
    expect(typeErrorOf(withDefaultSort(['-kind']))).toBe(
      'contacts.sort.default[0]: "kind" is not declared with sort: true',
    );
    expect(
      typeErrorOf(
        withDefaultSort(['name', { field: 'nickname', direction: 'desc' }]),
      ),
    ).toBe(
      'contacts.sort.default[1]: "nickname" is not declared with sort: true',
    );
    expect(
      withDefaultSort(['-created_at', { field: 'name', direction: 'asc' }]),
    ).not.toThrow();
  });

  it('refuses a default sort that names a field twice, as keyset-core does', () => {
    expect(
      typeErrorOf(
        withDefaultSort(['-name', { field: 'name', direction: 'asc' }]),
      ),
    ).toBe('contacts.sort.default[1]: "name" is listed twice');
    expect(typeErrorOf(withDefaultSort(['name', 'created_at', 'name']))).toBe(
      'contacts.sort.default[2]: "name" is listed twice',
    );
  });

  it('merges page over the definer member by member and checks the result', () => {
    expect(
      typeErrorOf(() =>
        declare('contacts', { ...base, page: { default: 200 } }),
      ),
    ).toBe('contacts.page.default: 200 exceeds the max page size 100');
    const narrow = untypedDeclare(contactsCatalog, {
      ...TEST_REGISTRIES,
      page: { max: 50 },
    });
    expect(
      typeErrorOf(() => narrow('contacts', { ...base, page: { default: 60 } })),
    ).toBe('contacts.page.default: 60 exceeds the max page size 50');
    expect(() =>
      narrow('contacts', { ...base, page: { default: 60, max: 80 } }),
    ).not.toThrow();
  });
});
