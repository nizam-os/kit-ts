import type { PublicCatalog } from '@nizam-os/catalog-core';

import { describe, expect, it } from 'vitest';

import { internalsOf } from '../declare/declared-resource';
import { baseSpec, specOf } from '../schema/value-form';
import {
  catalogOf,
  check,
  column,
  domain,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { keysetTypeOf } from './keyset-type';

/** The keyset type of each field a read-only declaration of `columns` gives. */
function keysetTypes(
  catalog: PublicCatalog,
  tableName: string,
  columns: ReadonlyArray<string>,
  codecs: Readonly<Record<string, string>> = {},
): Readonly<Record<string, unknown>> {
  const declare = untypedDeclare(catalog);
  const fields = Object.fromEntries(
    columns.map((name) => [name, { access: 'read', codec: codecs[name] }]),
  );
  const internals = internalsOf(
    declare(tableName, { operations: ['get'], fields }),
  );
  if (internals === undefined) {
    throw new Error(`${tableName} is not declared`);
  }
  return Object.fromEntries(
    internals.specs.fields.map((spec) => [
      spec.column,
      keysetTypeOf(spec.value),
    ]),
  );
}

function baseType(type: string): unknown {
  const spec = baseSpec({
    type,
    typeKind: 'base',
    array: false,
    maxLength: null,
    precision: null,
    scale: null,
  });
  return spec === undefined ? 'no wire form' : keysetTypeOf(spec)?.type;
}

describe('keysetTypeOf (SPEC 11.2)', () => {
  it('maps each base type as the table does', () => {
    const table11 = {
      text: 'text',
      varchar: 'text',
      bpchar: 'text',
      citext: 'text',
      'extensions.citext': 'text',
      int2: 'integer',
      int4: 'integer',
      int8: 'bigint',
      numeric: 'decimal',
      float4: 'float',
      float8: 'float',
      bool: 'boolean',
      uuid: 'uuid',
      date: 'date',
      timestamp: 'timestamp',
      timestamptz: 'timestamptz',
      json: undefined,
      jsonb: undefined,
    };
    for (const [type, expected] of Object.entries(table11)) {
      expect(baseType(type), type).toBe(expected);
    }
  });

  it('reads domains, enum labels, enum rules, and citext from the catalog', () => {
    expect(
      keysetTypes(contactsCatalog, 'contacts', [
        'kind',
        'status',
        'email',
        'discount',
        'tags',
        'created_at',
      ]),
    ).toEqual({
      kind: { type: 'enum', values: ['person', 'company'] },
      status: { type: 'enum', values: ['active', 'archived'] },
      email: { type: 'text', collation: 'insensitive' },
      discount: { type: 'decimal' },
      tags: { type: 'array', of: 'text' },
      created_at: { type: 'timestamptz' },
    });
  });

  it('types an array by its element, which keeps no collation', () => {
    expect(keysetTypes(contactsCatalog, 'meetings', ['attendees'])).toEqual({
      attendees: { type: 'array', of: 'text' },
    });
  });

  it('gives none for json, a codec, an array of enum values, and an enum without values', () => {
    const things = catalogOf(
      {
        things: table(
          'things',
          {
            id: column({ type: 'uuid', nullable: false }),
            moods: column({ type: 'mood', typeKind: 'enum', array: true }),
            labels: column({ type: 'label', typeKind: 'domain', array: true }),
            nothing: column({ type: 'void_kind', typeKind: 'enum' }),
            neither: column({ type: 'label', typeKind: 'domain' }),
          },
          {
            things_neither_check: check('neither', {
              kind: 'enum',
              values: ['c'],
            }),
          },
        ),
      },
      {
        label: domain('label', {
          constraints: {
            label_check: {
              kind: 'check',
              rule: { kind: 'enum', values: ['a', 'b'] },
            },
          },
        }),
      },
    );
    const enums = { mood: ['calm', 'tense'], void_kind: [] };
    expect(
      keysetTypes({ ...things, enums }, 'things', [
        'moods',
        'labels',
        'nothing',
        'neither',
      ]),
    ).toEqual({
      moods: undefined,
      labels: undefined,
      nothing: undefined,
      neither: undefined,
    });
    expect(keysetTypes(contactsCatalog, 'audit.changes', ['payload'])).toEqual({
      payload: undefined,
    });
    expect(
      keysetTypes(contactsCatalog, 'meetings', ['during'], { during: 'range' }),
    ).toEqual({ during: undefined });
    expect(
      keysetTypeOf(
        specOf({
          kind: 'codec',
          name: 'phone',
          codec: TEST_REGISTRIES.codecs.phone,
        }),
      ),
    ).toBeUndefined();
  });
});
