import type { DefaultedKeysetInit } from '@nizam-os/keyset-core';

import { describe, expect, it } from 'vitest';

import { defineKeyset } from '@nizam-os/keyset-core';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { Contacts, Organizations } from '../test-support/definition-resources';

const SECRET = 'a cursor secret of at least thirty-two bytes';

/** The contacts declaration's keyset definition, written by hand from SPEC 11.2. */
const CONTACTS_KEYSET: DefaultedKeysetInit = {
  table: 'contacts',
  key: ['id'],
  fields: {
    id: {
      column: 'id',
      type: 'uuid',
      nullable: false,
      sortable: true,
      operators: [],
    },
    kind: {
      column: 'kind',
      type: 'enum',
      values: ['person', 'company'],
      nullable: false,
      sortable: false,
      operators: ['eq', 'in'],
    },
    name: {
      column: 'name',
      type: 'text',
      nullable: false,
      sortable: true,
      operators: ['eq', 'startsWithi'],
    },
    alias: {
      column: 'nickname',
      type: 'text',
      nullable: true,
      sortable: false,
      operators: ['isNull'],
    },
    email: {
      column: 'email',
      type: 'text',
      collation: 'insensitive',
      nullable: true,
      sortable: false,
      operators: ['eqi'],
    },
    status: {
      column: 'status',
      type: 'enum',
      values: ['active', 'archived'],
      nullable: false,
      sortable: false,
      operators: ['in'],
    },
    priority: {
      column: 'priority',
      type: 'integer',
      nullable: true,
      sortable: true,
      operators: [],
    },
    tags: {
      column: 'tags',
      type: 'array',
      of: 'text',
      nullable: false,
      sortable: false,
      operators: ['contains'],
    },
    createdAt: {
      column: 'created_at',
      type: 'timestamptz',
      nullable: false,
      sortable: true,
      operators: ['gte', 'lt'],
    },
    organization: {
      column: 'organization_id',
      type: 'bigint',
      nullable: false,
      sortable: false,
      operators: ['eq', 'in'],
    },
  },
  search: { vector: 'search', config: 'simple', mode: 'websearch' },
  sort: { default: ['-createdAt', { field: 'name', direction: 'asc' }] },
  page: { default: 25, max: 50, range: false },
};

describe('keyset (SPEC 11.2)', () => {
  it('equals the definition written by hand for contacts', () => {
    expect(Contacts.keyset).toEqual(CONTACTS_KEYSET);
  });

  it('is frozen throughout, since every request of every server shares it', () => {
    const { keyset } = Contacts;
    const fields = Object.values(keyset.fields);
    expect(Object.isFrozen(keyset)).toBe(true);
    expect(Object.isFrozen(keyset.key)).toBe(true);
    expect(Object.isFrozen(keyset.fields)).toBe(true);
    expect(fields.every((field) => Object.isFrozen(field))).toBe(true);
    expect(fields.every((field) => Object.isFrozen(field.operators))).toBe(
      true,
    );
    const kind = keyset.fields['kind'];
    expect(
      kind !== undefined && 'values' in kind && Object.isFrozen(kind.values),
    ).toBe(true);
    expect(Object.isFrozen(keyset.search)).toBe(true);
    expect(Object.isFrozen(keyset.sort)).toBe(true);
    expect(Object.isFrozen(keyset.sort?.default)).toBe(true);
    expect(Object.isFrozen(keyset.sort?.default?.[1])).toBe(true);
    expect(Object.isFrozen(keyset.page)).toBe(true);
  });

  it('keys a field that only sorts, maps an ascending default, and spells out the page', () => {
    expect(Organizations.keyset).toEqual({
      table: 'organizations',
      key: ['id'],
      fields: {
        id: {
          column: 'id',
          type: 'bigint',
          nullable: false,
          sortable: true,
          operators: [],
        },
        name: {
          column: 'name',
          type: 'text',
          nullable: false,
          sortable: true,
          operators: [],
        },
      },
      sort: { default: ['name'] },
      page: { default: 20, max: 50, range: false },
    });
  });

  it('is computed when the resource is declared, without reading a target', () => {
    const declare = createDeclareResource({
      catalog: contactsCatalog,
      ...TEST_REGISTRIES,
    });
    const Lonely = declare('contacts', {
      operations: ['list'],
      fields: {},
      relationships: {
        organization_id: {
          target: () => null,
          access: 'read',
          filter: ['eq'],
        },
      },
    });
    expect(Lonely.keyset.fields).toHaveProperty('organization');
    expect(() => Lonely.resource).toThrow(
      'contacts.relationships.organization_id.target: must return the declared resource of organizations',
    );
  });

  it('names a table outside the default schema without its schema', () => {
    const declare = createDeclareResource({
      catalog: contactsCatalog,
      ...TEST_REGISTRIES,
    });
    expect(
      declare('audit.changes', { operations: ['list'], fields: {} }).keyset
        .table,
    ).toBe('changes');
  });

  it('is a definition keyset-core accepts and plans requests in public names', async () => {
    const keyset = defineKeyset({
      ...Contacts.keyset,
      cursor: { secret: SECRET },
    });
    expect([...keyset.definition.fields.keys()]).toEqual(
      Object.keys(CONTACTS_KEYSET.fields),
    );
    const plan = await keyset.plan({
      filter: {
        and: [
          { field: 'name', op: 'startsWithi', value: 'ad' },
          { field: 'organization', op: 'in', value: ['7'] },
        ],
      },
      sort: ['priority'],
      search: 'ada',
    });
    expect(plan.sort).toEqual([
      { field: 'priority', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
    expect((await keyset.plan({})).sort).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'name', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
  });
});
