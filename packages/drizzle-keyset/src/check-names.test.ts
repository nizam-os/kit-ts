import { describe, expect, it } from 'vitest';

import { defineKeyset } from '@nizam-os/keyset-core';

import { checkNames } from './check-names';
import { CONTACTS, contacts } from './test-support/keysets';
import { schema } from './test-support/schema';

const { emails } = CONTACTS.relations;

/** The test keyset's definition with `change` over its options, validated by the core. */
function definition(change: Record<string, unknown>) {
  return defineKeyset({ ...CONTACTS, ...change }).definition;
}

describe('checkNames (SPEC 14.1)', () => {
  it('accepts names that resolve, in every option', () => {
    expect(() => {
      checkNames(contacts.definition, schema);
    }).not.toThrow();
    for (const search of [{ vector: 'searchVector' }, { columns: ['bio'] }]) {
      expect(() => {
        checkNames(definition({ search }), schema);
      }).not.toThrow();
    }
  });

  it.each([
    [
      'a missing table',
      { table: 'people_view' },
      'table: the schema has no table people_view',
    ],
    [
      'a member that is not a table',
      { table: 'contactsRelations' },
      'table: the schema has no table contactsRelations',
    ],
    [
      'a prototype key',
      { table: 'constructor' },
      'table: the schema has no table constructor',
    ],
    [
      'a column field',
      {
        fields: {
          ...CONTACTS.fields,
          age: { column: 'years', type: 'integer', nullable: true },
        },
      },
      'fields.age.column: the schema table contacts has no column years',
    ],
    [
      'a column named like a prototype member',
      {
        fields: {
          ...CONTACTS.fields,
          id: { column: 'toString', type: 'uuid' },
        },
      },
      'fields.id.column: the schema table contacts has no column toString',
    ],
    [
      'a relation table',
      {
        relations: {
          ...CONTACTS.relations,
          emails: { ...emails, table: 'emails' },
        },
      },
      'relations.emails.table: the schema has no table emails',
    ],
    [
      'a join column of the related table',
      {
        relations: {
          ...CONTACTS.relations,
          emails: { ...emails, on: { ownerId: 'id' } },
        },
      },
      'relations.emails.on: the schema table contactEmails has no column ownerId',
    ],
    [
      'a join column of the main table',
      {
        relations: {
          ...CONTACTS.relations,
          emails: { ...emails, on: { contactId: 'uuid' } },
        },
      },
      'relations.emails.on.contactId: the schema table contacts has no column uuid',
    ],
    [
      'a relation field',
      {
        relations: {
          ...CONTACTS.relations,
          emails: {
            ...emails,
            fields: { email: { column: 'address', type: 'text' } },
          },
        },
      },
      'relations.emails.fields.email.column: the schema table contactEmails has no column address',
    ],
    [
      'an aggregate column',
      {
        fields: {
          ...CONTACTS.fields,
          latestStart: {
            aggregate: {
              relation: 'workHistory',
              fn: 'max',
              column: 'started',
            },
            type: 'date',
          },
        },
      },
      'fields.latestStart.aggregate.column: the schema table workHistory has no column started',
    ],
    [
      'a like search column',
      { search: { mode: 'like', columns: ['firstName', 'surname'] } },
      'search.columns: the schema table contacts has no column surname',
    ],
    [
      'a full-text search column',
      { search: { columns: ['bio', 'surname'] } },
      'search.columns: the schema table contacts has no column surname',
    ],
    [
      'a search vector',
      { search: { vector: 'vector' } },
      'search.vector: the schema table contacts has no column vector',
    ],
  ])('refuses %s', (_case, change, message) => {
    expect(() => {
      checkNames(definition(change), schema);
    }).toThrow(new TypeError(message));
  });

  it('requires nullable: true over a column that is not notNull, of the main table or a relation (ADR 0016)', () => {
    expect(() => {
      checkNames(
        definition({
          fields: {
            ...CONTACTS.fields,
            age: { column: 'age', type: 'integer' },
          },
        }),
        schema,
      );
    }).toThrow(
      new TypeError(
        'fields.age.nullable must be true: contacts.age is nullable',
      ),
    );
    const self = {
      table: 'contacts',
      on: { id: 'id' },
      fields: { age: { column: 'age', type: 'integer' } },
    };
    expect(() => {
      checkNames(
        definition({ relations: { ...CONTACTS.relations, self } }),
        schema,
      );
    }).toThrow(
      new TypeError(
        'relations.self.fields.age.nullable must be true: contacts.age is nullable',
      ),
    );
    const declared = {
      ...self,
      fields: { age: { column: 'age', type: 'integer', nullable: true } },
    };
    expect(() => {
      checkNames(
        definition({ relations: { ...CONTACTS.relations, self: declared } }),
        schema,
      );
    }).not.toThrow();
  });

  it('refuses an aggregate over a relation a definition the core did not validate lacks', () => {
    expect(() => {
      checkNames({ ...contacts.definition, relations: new Map() }, schema);
    }).toThrow(
      new TypeError('fields.emailCount.aggregate.relation is not declared'),
    );
  });
});
