/**
 * The TypeScript names of the Kysely types (SPEC 9.2): two objects with one
 * name, or an object named like a helper, Kysely's types, or `DB`, fail
 * with `name_collision` instead of writing a file that does not compile.
 */
import type { Catalog } from '@nizam-os/catalog-core';

import { describe, expect, it } from 'vitest';

import { isPgCatalogError } from '../errors';
import { catalogOf, table } from '../test-support/kysely-catalog';
import { renderKyselyTypes } from './kysely-types';

function collision(catalog: Catalog): string {
  try {
    renderKyselyTypes(catalog);
  } catch (error) {
    if (isPgCatalogError(error) && error.code === 'name_collision') {
      return error.message;
    }
    throw error;
  }
  throw new Error('expected a name_collision');
}

describe('renderKyselyTypes: name_collision', () => {
  it('fails when two objects map to one TypeScript name', () => {
    expect(
      collision(
        catalogOf({ tables: { a_b: table('a_b', {}), 'a.b': table('b', {}) } }),
      ),
    ).toBe('table a_b and table a.b map to the same TypeScript name ABTable');
    expect(
      collision(
        catalogOf({
          enums: { contacts_table: [] },
          tables: { contacts: table('contacts', {}) },
        }),
      ),
    ).toBe(
      'table contacts and enum contacts_table map to the same TypeScript name ContactsTable',
    );
  });

  it('fails when an object takes the name of a helper, of Kysely, or of DB', () => {
    expect(collision(catalogOf({ enums: { json_value: [] } }))).toBe(
      'enum json_value and the helper JsonValue map to the same TypeScript name JsonValue',
    );
    // Reserved under either driver, so switching drivers cannot introduce a collision.
    expect(collision(catalogOf({ enums: { json_parameter: [] } }))).toBe(
      'enum json_parameter and the helper JsonParameter map to the same TypeScript name JsonParameter',
    );
    expect(collision(catalogOf({ enums: { generated: [] } }))).toBe(
      "enum generated and Kysely's Generated map to the same TypeScript name Generated",
    );
    expect(collision(catalogOf({ enums: { DB: [] } }))).toBe(
      'enum DB and the DB interface map to the same TypeScript name DB',
    );
  });
});
