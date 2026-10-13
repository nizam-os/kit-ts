import type { PublicColumn } from '@nizam-os/catalog-core';

import { describe, expect, it } from 'vitest';

import { isRequiredOnInsert } from '../catalog/requirement';
import { internalsOf } from '../declare/declared-resource';
import {
  catalogOf,
  column,
  domain,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { Contacts, Organizations } from '../test-support/domain-resources';
import { serverValueColumns } from './server-values';

const NOT_NULL = { nullable: false } as const;
const notNullDomain = (name: string, overrides: Partial<PublicColumn> = {}) =>
  column({ type: name, typeKind: 'domain', sqlType: name, ...overrides });

const things = table(
  'things',
  {
    id: column({ ...NOT_NULL, type: 'uuid', sqlType: 'uuid' }),
    organization_id: column(NOT_NULL),
    plain: column(NOT_NULL),
    nullable: column(),
    defaulted: column({ ...NOT_NULL, default: { literal: 'x' } }),
    identity: column({ ...NOT_NULL, type: 'int8', identity: 'byDefault' }),
    generated: column({
      ...NOT_NULL,
      generated: { kind: 'stored', searchConfig: null },
    }),
    ruled: column(),
    strict: notNullDomain('strict_text'),
    strict_default: notNullDomain('strict_default'),
    strict_list: notNullDomain('strict_text', { array: true }),
    written: column(NOT_NULL),
    read_only: column(NOT_NULL),
  },
  {
    things_ruled_check: {
      kind: 'check',
      columns: ['ruled'],
      rule: { kind: 'notNull' },
      enforced: true,
    },
  },
);
const catalog = catalogOf(
  { things },
  {
    strict_text: domain('strict_text', { nullable: false }),
    strict_default: domain('strict_default', {
      nullable: false,
      default: { literal: 'x' },
    }),
  },
);

/** Each column, and whether an insert that leaves it out fails (SPEC 6.3). */
const REQUIRED: ReadonlyArray<readonly [string, boolean]> = [
  ['id', true],
  ['organization_id', true],
  ['plain', true],
  ['nullable', false],
  ['defaulted', false],
  ['identity', false],
  ['generated', false],
  ['ruled', true],
  ['strict', true],
  ['strict_default', false],
  ['strict_list', false],
  ['written', true],
  ['read_only', true],
];

const declare = untypedDeclare(catalog, {
  scopes: { organization: { column: 'organization_id' } },
});

function columnsOf(declaration: object): ReadonlyArray<string> {
  const internals = internalsOf(declare('things', declaration));
  return internals === undefined ? [] : serverValueColumns(internals);
}

describe('isRequiredOnInsert (SPEC 6.3)', () => {
  it.each(REQUIRED)('%s: %s', (name, required) => {
    expect(isRequiredOnInsert(catalog, things, name)).toBe(required);
  });

  it('agrees with the member specs of declared resources', () => {
    for (const resource of [Contacts, Organizations]) {
      const internals = internalsOf(resource);
      const tableDef = internals?.catalog.tables[resource.table];
      if (internals === undefined || tableDef === undefined) {
        throw new Error(`${resource.table} is not declared`);
      }
      const { fields } = internals.specs;
      const runtime = fields.map(({ column: name }) => [
        name,
        isRequiredOnInsert(internals.catalog, tableDef, name),
      ]);
      expect(runtime).toEqual(
        fields.map((spec) => [spec.column, spec.required]),
      );
    }
  });
});

describe('serverValueColumns (SPEC 3.3, 12.3)', () => {
  const base = {
    operations: ['get', 'create'],
    fields: {
      written: { access: 'readWrite' },
      read_only: { access: 'read' },
    },
  };

  it('lists the required columns no client member, scope, or client id covers', () => {
    expect(columnsOf(base)).toEqual([
      'id',
      'organization_id',
      'plain',
      'ruled',
      'strict',
      'read_only',
    ]);
    expect(
      columnsOf({ ...base, scope: 'organization', clientIds: true }),
    ).toEqual(['plain', 'ruled', 'strict', 'read_only']);
  });

  it('lists none for a resource that does not create', () => {
    expect(
      columnsOf({
        ...base,
        operations: ['get'],
        fields: { read_only: { access: 'read' } },
      }),
    ).toEqual([]);
  });
});
