/**
 * A relationship's metadata describes its id (SPEC 3.4, 8): a string on
 * the wire that names a value of its key, so it takes the key's format,
 * fraction digits, bounds, and options, and a `bool` key's id is `true` or
 * `false`, the two texts `id-schema.ts` accepts. One case per key type.
 */
import type { PublicColumn, PublicConstraint } from '@nizam-os/catalog-core';

import type { FieldLimits } from './types';

import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';

const NONE: FieldLimits = {
  minLength: null,
  maxLength: null,
  minimum: null,
  exclusiveMinimum: null,
  maximum: null,
  exclusiveMaximum: null,
  multipleOf: null,
  patterns: [],
};

const LABELS = ['calm', 'tense'];

/** Each key type: its column, and what the id's metadata states beyond `wire: 'string'`. */
const KEYS: ReadonlyArray<
  readonly [string, Partial<PublicColumn>, Readonly<Record<string, unknown>>]
> = [
  ['bool', {}, { format: null, options: ['true', 'false'], limits: NONE }],
  [
    'int4',
    {},
    {
      format: 'int32',
      options: null,
      limits: { ...NONE, minimum: '-2147483648', maximum: '2147483647' },
    },
  ],
  ['float4', {}, { format: 'float', options: null, limits: NONE }],
  [
    'varchar',
    { maxLength: 8 },
    { format: null, options: null, limits: { ...NONE, maxLength: 8 } },
  ],
  ['mood', { typeKind: 'enum' }, { format: null, options: LABELS }],
  [
    'timestamptz',
    { precision: 3 },
    { format: 'date-time', fractionDigits: 3, limits: NONE },
  ],
  [
    'numeric',
    { precision: 6, scale: 2 },
    {
      format: 'decimal',
      limits: {
        ...NONE,
        exclusiveMinimum: '-10000',
        exclusiveMaximum: '10000',
        multipleOf: '0.01',
      },
    },
  ],
  ['uuid', {}, { format: 'uuid', options: null, limits: NONE }],
];

const keyColumn = (type: string, overrides: Partial<PublicColumn>) =>
  column({ type, sqlType: type, nullable: false, ...overrides });

const keyTable = (type: string) => `key_${type}s`;

const foreignKey = (type: string): PublicConstraint => ({
  kind: 'foreignKey',
  columns: [`${type}_id`],
  references: { table: keyTable(type), columns: ['id'] },
  enforced: true,
});

const declare = untypedDeclare({
  ...catalogOf({
    ...Object.fromEntries(
      KEYS.map(([type, overrides]) => [
        keyTable(type),
        table(keyTable(type), { id: keyColumn(type, overrides) }),
      ]),
    ),
    links: table(
      'links',
      {
        id: keyColumn('uuid', {}),
        ...Object.fromEntries(
          KEYS.map(([type, overrides]) => [
            `${type}_id`,
            { ...keyColumn(type, overrides), nullable: true },
          ]),
        ),
      },
      Object.fromEntries(
        KEYS.map(([type]) => [`links_${type}_id_fkey`, foreignKey(type)]),
      ),
    ),
  }),
  enums: { mood: LABELS },
});

const TARGETS = new Map(
  KEYS.map(([type]) => [
    type,
    declare(keyTable(type), { operations: ['get'], fields: {} }),
  ]),
);

const Links = declare('links', {
  operations: ['update'],
  fields: {},
  relationships: Object.fromEntries(
    KEYS.map(([type]) => [
      `${type}_id`,
      { target: () => TARGETS.get(type), access: 'readWrite' },
    ]),
  ),
});

describe('the metadata of a relationship id (SPEC 3.4, 8)', () => {
  it.each(KEYS.map(([type, , stated]) => [type, stated]))(
    'a %s key',
    (type, stated) => {
      expect(Links.fields[type]).toMatchObject({
        kind: 'relationship',
        wire: 'string',
        target: keyTable(type),
        items: null,
        ...stated,
      });
    },
  );

  it("agrees with the linkage schema on a bool key's ids", () => {
    const { bool } = Links.linkage.update.shape;
    const accepts = (id: string) =>
      bool?.safeParse({ type: 'key_bools', id }).success === true;
    expect(
      ['true', 'false', 't', '1', 'TRUE'].filter((id) => accepts(id)),
    ).toEqual(Links.fields['bool']?.options);
  });
});
