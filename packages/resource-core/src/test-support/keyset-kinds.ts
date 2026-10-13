/**
 * A table with a column of each keyset type (SPEC 11.2) and a resource
 * that filters each with every operator its type takes, `isNull`
 * included, for the tests of `keysetRequest`. Every column but the key is
 * nullable; `mood` is an enum by its `enum` rule, `tags` an array of
 * text, and `search` a generated `tsvector`. Typed wide: runtime tests
 * only. Not published with the package.
 * @packageDocumentation
 */
import type { FieldType } from '@nizam-os/keyset-core';

import type { DeclaredResource } from '../declare/declared-resource';

import { operatorsFor } from '@nizam-os/keyset-core';

import {
  catalogOf,
  check,
  column,
  table,
  untypedDeclare,
} from './catalog-builder';

/** Each filtered member's keyset type, by public name, which is also its column. */
export const KIND_TYPES: Readonly<Record<string, FieldType>> = {
  label: 'text',
  count: 'integer',
  total: 'bigint',
  amount: 'decimal',
  ratio: 'float',
  active: 'boolean',
  ref: 'uuid',
  mood: 'enum',
  born: 'date',
  seen: 'timestamp',
  at: 'timestamptz',
  tags: 'array',
};

/** The labels of `mood`'s `enum` rule. */
export const MOODS: readonly [string, string] = ['calm', 'busy'];

const KINDS_TABLE = table(
  'kinds',
  {
    id: column({ type: 'uuid', sqlType: 'uuid', nullable: false }),
    label: column(),
    count: column({ type: 'int4', sqlType: 'integer' }),
    total: column({ type: 'int8', sqlType: 'bigint' }),
    amount: column({ type: 'numeric', sqlType: 'numeric' }),
    ratio: column({ type: 'float8', sqlType: 'double precision' }),
    active: column({ type: 'bool', sqlType: 'boolean' }),
    ref: column({ type: 'uuid', sqlType: 'uuid' }),
    mood: column(),
    born: column({ type: 'date', sqlType: 'date' }),
    seen: column({
      type: 'timestamp',
      sqlType: 'timestamp without time zone',
    }),
    at: column({ type: 'timestamptz', sqlType: 'timestamp with time zone' }),
    tags: column({ array: true, sqlType: 'text[]' }),
    search: column({
      type: 'tsvector',
      sqlType: 'tsvector',
      generated: { kind: 'stored', searchConfig: 'simple' },
    }),
  },
  { kinds_mood_check: check('mood', { kind: 'enum', values: MOODS }) },
);

/** `label` and `count` also sort, `count` descending by default. */
export const Kinds: DeclaredResource = untypedDeclare(
  catalogOf({ kinds: KINDS_TABLE }),
)('kinds', {
  operations: ['list', 'get'],
  fields: Object.fromEntries(
    Object.entries(KIND_TYPES).map(([name, type]) => [
      name,
      {
        access: 'read',
        filter: [...operatorsFor(type, true)],
        sort: name === 'label' || name === 'count',
      },
    ]),
  ),
  search: { column: 'search' },
  sort: { default: ['-count'] },
});
