import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { typeErrorOf } from '../test-support/failure';
import { isDeclaredResource } from './declared-resource';

const declare = untypedDeclare();

describe('declareResource: the declared resource (SPEC 3)', () => {
  it('returns a branded, frozen resource holding the table and a frozen copy of the declaration', () => {
    const declaration = {
      operations: ['list', 'get'],
      fields: { name: { access: 'read', filter: ['eq'], sort: true } },
      sort: { default: ['-name'] },
    };
    const Contacts = declare('contacts', declaration);
    expect(isDeclaredResource(Contacts)).toBe(true);
    expect(Contacts.table).toBe('contacts');
    expect(Contacts.declaration).toEqual(declaration);
    expect(Contacts.declaration).not.toBe(declaration);
    expect(Object.isFrozen(Contacts)).toBe(true);
    expect(Object.isFrozen(Contacts.declaration.fields['name']?.filter)).toBe(
      true,
    );
    declaration.fields.name.access = 'readWrite';
    expect(Contacts.declaration.fields['name']?.access).toBe('read');
  });

  it('freezes relationship filters and a sort without a default', () => {
    const Meetings = declare('meetings', {
      operations: ['list'],
      fields: { room: { access: 'read', sort: true } },
      relationships: {
        contact_id: { target: () => null, access: 'read', filter: ['eq'] },
      },
      sort: {},
    });
    const relationship = Meetings.declaration.relationships?.['contact_id'];
    expect(Object.isFrozen(relationship)).toBe(true);
    expect(Object.isFrozen(relationship?.filter)).toBe(true);
    expect(Object.isFrozen(Meetings.declaration.sort)).toBe(true);
  });

  it('never calls a target while declaring, so declarations may reference each other (SPEC 3.8)', () => {
    let calls = 0;
    const Teams = declare('teams', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
      relationships: {
        lead_id: {
          target: () => {
            calls += 1;
            return People;
          },
          access: 'read',
        },
      },
    });
    const People = declare('people', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
      relationships: { team_id: { target: () => Teams, access: 'read' } },
    });
    expect(calls).toBe(0);
    expect(isDeclaredResource(People)).toBe(true);
  });

  it('treats an optional member set to undefined as absent (SPEC 2)', () => {
    const Meetings = declare('meetings', {
      as: undefined,
      operations: ['get'],
      scope: undefined,
      clientIds: undefined,
      fields: {
        room: {
          access: 'read',
          as: undefined,
          codec: undefined,
          sort: undefined,
        },
      },
      relationships: undefined,
      search: undefined,
      sort: undefined,
      page: undefined,
      rules: undefined,
      description: undefined,
    });
    expect(Meetings.table).toBe('meetings');
  });

  it('does not take a lookalike object for a declared resource', () => {
    expect(isDeclaredResource({ table: 'contacts', declaration: {} })).toBe(
      false,
    );
    expect(isDeclaredResource(null)).toBe(false);
  });
});

describe('declareResource: the table and its identity (SPEC 3.4)', () => {
  it('refuses a table that is not a string or not in the public catalog', () => {
    expect(typeErrorOf(() => declare(1, {}))).toBe(
      'declareResource: the table must be a string, received 1',
    );
    expect(typeErrorOf(() => declare('accounts', {}))).toBe(
      'declareResource: "accounts" is not a table of the public catalog',
    );
    expect(typeErrorOf(() => declare('toString', {}))).toBe(
      'declareResource: "toString" is not a table of the public catalog',
    );
  });

  it('refuses a table without a single-column primary key', () => {
    expect(
      typeErrorOf(() =>
        declare('contact_phones', { operations: ['get'], fields: {} }),
      ),
    ).toBe('contact_phones: a resource needs a single-column primary key');
  });

  it('refuses a primary key whose type cannot carry a resource id', () => {
    const blobs = untypedDeclare(
      catalogOf({
        blobs: table('blobs', {
          id: column({ type: 'jsonb', nullable: false }),
        }),
      }),
    );
    expect(
      typeErrorOf(() => blobs('blobs', { operations: ['get'], fields: {} })),
    ).toBe("blobs: the primary key's type jsonb cannot carry a resource id");
  });
});

describe('declareResource: the shape of a declaration (SPEC 14)', () => {
  const base = { operations: ['get'], fields: {} };
  const field = (value: unknown) => () =>
    declare('contacts', { ...base, fields: { name: value } });
  const relationship = (value: unknown) => () =>
    declare('contacts', {
      ...base,
      relationships: { organization_id: value },
    });

  it('refuses a declaration that is not an object, and unknown members', () => {
    expect(typeErrorOf(() => declare('contacts', null))).toBe(
      'contacts: must be an object, received null',
    );
    expect(typeErrorOf(() => declare('contacts', { ...base, field: {} }))).toBe(
      'contacts: unknown member "field"',
    );
  });

  it('refuses members of the wrong type', () => {
    expect(
      typeErrorOf(() => declare('contacts', { ...base, operations: 'get' })),
    ).toBe('contacts.operations: must be an array, received "get"');
    expect(typeErrorOf(() => declare('contacts', { ...base, as: 1 }))).toBe(
      'contacts.as: must be a string, received 1',
    );
    expect(
      typeErrorOf(() => declare('contacts', { ...base, clientIds: 'yes' })),
    ).toBe('contacts.clientIds: must be a boolean, received "yes"');
    expect(
      typeErrorOf(() => declare('contacts', { operations: ['get'] })),
    ).toBe('contacts.fields: must be an object, received undefined');
  });

  it('refuses a field outside the grammar', () => {
    expect(typeErrorOf(field({ access: 'read', sortable: true }))).toBe(
      'contacts.fields.name: unknown member "sortable"',
    );
    expect(typeErrorOf(field({ access: 'rw' }))).toBe(
      'contacts.fields.name.access: "rw" is not one of read, readWrite, immutable, write',
    );
    expect(typeErrorOf(field({ access: 'read', filter: ['like'] }))).toBe(
      'contacts.fields.name.filter[0]: "like" is not an operator of @nizam-os/keyset-core',
    );
    expect(typeErrorOf(field({ access: 'read', filter: [] }))).toBe(
      'contacts.fields.name.filter: list at least one operator',
    );
    expect(
      typeErrorOf(field({ access: 'read', filter: ['eq', 'in', 'eq'] })),
    ).toBe('contacts.fields.name.filter[2]: "eq" is listed twice');
  });

  it('refuses a relationship outside the grammar', () => {
    expect(typeErrorOf(relationship({ target: {}, access: 'read' }))).toBe(
      "contacts.relationships.organization_id.target: must be a function returning the target's declared resource",
    );
    expect(
      typeErrorOf(relationship({ target: () => null, access: 'write' })),
    ).toBe(
      'contacts.relationships.organization_id.access: "write" is not one of read, readWrite, immutable',
    );
    expect(
      typeErrorOf(
        relationship({ target: () => null, access: 'read', filter: ['gt'] }),
      ),
    ).toBe(
      'contacts.relationships.organization_id.filter[0]: "gt" is not one of eq, ne, in, nin, isNull',
    );
    expect(
      typeErrorOf(
        relationship({ target: () => null, access: 'read', filter: [] }),
      ),
    ).toBe(
      'contacts.relationships.organization_id.filter: list at least one operator',
    );
    expect(
      typeErrorOf(
        relationship({
          target: () => null,
          access: 'read',
          filter: ['in', 'in'],
        }),
      ),
    ).toBe(
      'contacts.relationships.organization_id.filter[1]: "in" is listed twice',
    );
  });

  it('refuses search, sort, and rules outside the grammar', () => {
    expect(
      typeErrorOf(() =>
        declare('contacts', { ...base, search: { column: 1 } }),
      ),
    ).toBe('contacts.search.column: must be a column name, received 1');
    expect(
      typeErrorOf(() =>
        declare('contacts', {
          ...base,
          search: { column: 'search', mode: 'fuzzy' },
        }),
      ),
    ).toBe(
      'contacts.search.mode: "fuzzy" is not one of websearch, plain, phrase',
    );
    expect(
      typeErrorOf(() =>
        declare('contacts', {
          ...base,
          sort: { default: [{ field: 'name', direction: 'up' }] },
        }),
      ),
    ).toBe('contacts.sort.default[0].direction: "up" is not one of asc, desc');
    expect(
      typeErrorOf(() =>
        declare('contacts', { ...base, sort: { default: [{ field: 1 }] } }),
      ),
    ).toBe('contacts.sort.default[0].field: must be a column name, received 1');
    expect(
      typeErrorOf(() =>
        declare('contacts', { ...base, rules: { x: { message: 'm' } } }),
      ),
    ).toBe('contacts.rules.x: unknown member "message"');
  });
});
