/**
 * A relationship's column spells ids as the key it references (SPEC 3.1).
 * PostgreSQL 14 and 18 take each foreign key below, and print the value it
 * shares with its key two ways: `char(4)` pads `ab` to four characters
 * where `char(6)` pads it to six, `numeric(10,3)` prints `1.500` where
 * `numeric(10,2)` prints `1.50`, `float8` prints the `real` 1.1 as
 * `1.100000023841858`, and `char(4)` keeps the padding `text` never has.
 * @ref https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-FK
 */
import type { PublicColumn, PublicDomain } from '@nizam-os/catalog-core';

import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  domain,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { typeErrorOf } from '../test-support/failure';

const typed = (
  type: string,
  sqlType: string,
  more: Partial<PublicColumn> = {},
) => column({ type, sqlType, nullable: false, ...more });
const CHAR_4 = typed('bpchar', 'character(4)', { maxLength: 4 });
const CHAR_6 = typed('bpchar', 'character(6)', { maxLength: 6 });
const NUMERIC_10_2 = typed('numeric', 'numeric(10,2)', {
  precision: 10,
  scale: 2,
});
const NUMERIC_10_3 = typed('numeric', 'numeric(10,3)', {
  precision: 10,
  scale: 3,
});
const CODE: PublicDomain = domain('code', {
  type: 'bpchar',
  sqlType: 'character(4)',
  maxLength: 4,
});

/** Declares `holders.key_id`, a foreign key typed `fk` to `keys.id`, typed `key`. */
const holders = (fk: PublicColumn, key: PublicColumn) => () =>
  untypedDeclare(
    catalogOf(
      {
        keys: table('keys', { id: key }),
        holders: table(
          'holders',
          { id: typed('uuid', 'uuid'), key_id: fk },
          {
            holders_key_id_fkey: {
              kind: 'foreignKey',
              columns: ['key_id'],
              references: { table: 'keys', columns: ['id'] },
              enforced: true,
            },
          },
        ),
      },
      { code: CODE },
    ),
  )('holders', {
    operations: ['get'],
    fields: {},
    relationships: { key_id: { target: () => null, access: 'read' } },
  });

describe('declareResource: a relationship spells ids as its key (SPEC 3.1)', () => {
  it.each([
    [CHAR_4, CHAR_6, 'character(4)', 'character(6)'],
    [NUMERIC_10_3, NUMERIC_10_2, 'numeric(10,3)', 'numeric(10,2)'],
    [
      typed('float8', 'double precision'),
      typed('float4', 'real'),
      'double precision',
      'real',
    ],
    [typed('text', 'text'), CHAR_4, 'text', 'character(4)'],
    [CHAR_4, typed('text', 'text'), 'character(4)', 'text'],
    [typed('int8', 'bigint'), NUMERIC_10_2, 'bigint', 'numeric(10,2)'],
  ])('refuses %# a %s foreign key to a %s key', (fk, key, fkType, keyType) => {
    expect(typeErrorOf(holders(fk, key))).toBe(
      `holders.relationships.key_id: type ${fkType} spells ids unlike ${keyType}, the type of keys.id`,
    );
  });

  it('takes a foreign key whose type prints the value as its key does', () => {
    const accepted: ReadonlyArray<readonly [PublicColumn, PublicColumn]> = [
      [CHAR_4, CHAR_4],
      [typed('code', 'code', { typeKind: 'domain' }), CHAR_4],
      [typed('int4', 'integer'), typed('int8', 'bigint')],
      [typed('int8', 'bigint'), typed('int2', 'smallint')],
      [
        typed('varchar', 'character varying(10)', { maxLength: 10 }),
        typed('text', 'text'),
      ],
      [
        typed('numeric', 'numeric(12,2)', { precision: 12, scale: 2 }),
        NUMERIC_10_2,
      ],
    ];
    for (const [fk, key] of accepted) {
      expect(holders(fk, key)).not.toThrow();
    }
  });
});
