import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  check,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { typeErrorOf } from '../test-support/failure';

const declare = untypedDeclare();
const list = (value: object) => () =>
  declare('contacts', { operations: ['list'], fields: {}, ...value });

const SYNTAX = '(^[A-Za-z0-9][A-Za-z0-9_-]*$)';

describe('declareResource: the names keyset-core and jsonapi-core take (SPEC 11.2)', () => {
  it('refuses a filtered or sortable public name outside keyset-core field names', () => {
    expect(
      typeErrorOf(
        list({
          fields: { name: { access: 'read', as: 'größe', filter: ['eq'] } },
        }),
      ),
    ).toBe(
      `contacts.fields.name.filter: public name "größe" is outside @nizam-os/keyset-core's field names ${SYNTAX}`,
    );
    expect(
      typeErrorOf(
        list({
          fields: { name: { access: 'read', as: 'full name', sort: true } },
        }),
      ),
    ).toBe(
      `contacts.fields.name.sort: public name "full name" is outside @nizam-os/keyset-core's field names ${SYNTAX}`,
    );
    expect(
      list({ fields: { name: { access: 'read', as: 'größe' } } }),
    ).not.toThrow();
  });

  it('reads the name camelCase derives from a column', () => {
    const people = untypedDeclare(
      catalogOf({
        people: table('people', {
          id: column({ type: 'uuid', nullable: false }),
          prénom: column(),
        }),
      }),
    );
    expect(
      typeErrorOf(() =>
        people('people', {
          operations: ['list'],
          fields: { prénom: { access: 'read', sort: true } },
        }),
      ),
    ).toBe(
      `people.fields.prénom.sort: public name "prénom" is outside @nizam-os/keyset-core's field names ${SYNTAX}`,
    );
  });

  it('refuses a filtered member named after the filter disjunction or, with search, the search member', () => {
    expect(
      typeErrorOf(
        list({
          fields: { name: { access: 'read', as: 'or', filter: ['eq'] } },
        }),
      ),
    ).toBe(
      'contacts.fields.name.filter: public name "or" is the filter disjunction, filter[or]',
    );
    expect(
      typeErrorOf(
        list({
          fields: { name: { access: 'read', as: 'q', filter: ['eq'] } },
          search: { column: 'search' },
        }),
      ),
    ).toBe(
      'contacts.fields.name.filter: public name "q" is the search parameter, filter[q]',
    );
    expect(
      typeErrorOf(
        list({
          relationships: {
            organization_id: {
              target: () => null,
              access: 'read',
              as: 'or',
              filter: ['eq'],
            },
          },
        }),
      ),
    ).toBe(
      'contacts.relationships.organization_id.filter: public name "or" is the filter disjunction, filter[or]',
    );
    expect(
      list({ fields: { name: { access: 'read', as: 'q', filter: ['eq'] } } }),
    ).not.toThrow();
    expect(
      list({
        fields: { name: { access: 'read', as: 'or', sort: true } },
        search: { column: 'search' },
      }),
    ).not.toThrow();
  });
});

const keyed = (catalog: Parameters<typeof untypedDeclare>[0]) => () =>
  untypedDeclare(catalog)('things', { operations: ['get'], fields: {} });

/** A text-keyed table whose two enum rules on the key intersect in `second`'s values among a and b. */
const twoRules = (second: ReadonlyArray<string>) =>
  catalogOf({
    things: table(
      'things',
      { id: column({ nullable: false }) },
      {
        things_a: check('id', { kind: 'enum', values: ['a', 'b'] }),
        things_b: check('id', { kind: 'enum', values: second }),
      },
    ),
  });

describe('declareResource: the primary key keyset-core orders by (SPEC 11.2)', () => {
  it('refuses an enum key without labels', () => {
    const catalog = {
      ...catalogOf({
        things: table('things', {
          id: column({ type: 'void_kind', typeKind: 'enum', nullable: false }),
        }),
      }),
      enums: { void_kind: [] },
    };
    expect(typeErrorOf(keyed(catalog))).toBe(
      'things: the primary key is an enum without values, which @nizam-os/keyset-core cannot order',
    );
  });

  it('refuses a text key whose enum rules leave no value, and keeps one they leave', () => {
    expect(typeErrorOf(keyed(twoRules(['c'])))).toBe(
      'things: the primary key is an enum without values, which @nizam-os/keyset-core cannot order',
    );
    expect(keyed(twoRules(['b', 'c']))).not.toThrow();
  });
});
