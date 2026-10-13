/**
 * The types a generated column or domain names (SPEC 5.1): each base type
 * with the modifiers PostgreSQL allows on it, an enum, or a domain, as
 * `pg-catalog` records them, `sqlType` spelled as `format_type` prints it.
 * Not published with the package.
 * @packageDocumentation
 */
import type { PublicDomain, TypeKind } from '@nizam-os/catalog-core';

import type { Random } from './random';

/** The scalar base types of SPEC 5.1 with a wire form, `json` and `jsonb` aside. */
export const SCALAR_BASES = [
  'text',
  'varchar',
  'bpchar',
  'citext',
  'int2',
  'int4',
  'int8',
  'numeric',
  'float4',
  'float8',
  'bool',
  'uuid',
  'date',
  'timestamp',
  'timestamptz',
] as const;

/** The JSON types: a field of any JSON value, never an array element (SPEC 5.1). */
export const JSON_BASES = ['json', 'jsonb'] as const;

/** A base type the generator draws. */
export type BaseName =
  | (typeof SCALAR_BASES)[number]
  | (typeof JSON_BASES)[number];

/** A type as a column or a domain names it, before `array`. */
export interface TypeRef {
  readonly type: string;
  readonly typeKind: TypeKind;
  readonly sqlType: string;
  readonly maxLength: number | null;
  readonly precision: number | null;
  readonly scale: number | null;
}

const MAX_VARCHAR = 300;
const MAX_BPCHAR = 12;
const MAX_NUMERIC_PRECISION = 20;
const MAX_FRACTION_DIGITS = 6;

const SPELLINGS: Readonly<Record<BaseName, string>> = {
  text: 'text',
  varchar: 'character varying',
  bpchar: 'character',
  citext: 'citext',
  int2: 'smallint',
  int4: 'integer',
  int8: 'bigint',
  numeric: 'numeric',
  float4: 'real',
  float8: 'double precision',
  bool: 'boolean',
  uuid: 'uuid',
  date: 'date',
  timestamp: 'timestamp without time zone',
  timestamptz: 'timestamp with time zone',
  json: 'json',
  jsonb: 'jsonb',
};

const plain = (type: string, sqlType: string): TypeRef => ({
  type,
  typeKind: 'base',
  sqlType,
  maxLength: null,
  precision: null,
  scale: null,
});

function lengthRef(random: Random, base: 'varchar' | 'bpchar'): TypeRef {
  if (base === 'varchar' && random.chance(0.3)) {
    return plain(base, SPELLINGS.varchar);
  }
  const maxLength = random.int(
    1,
    base === 'varchar' ? MAX_VARCHAR : MAX_BPCHAR,
  );
  return {
    ...plain(base, `${SPELLINGS[base]}(${String(maxLength)})`),
    maxLength,
  };
}

function numericRef(random: Random): TypeRef {
  if (random.chance(0.3)) {
    return plain('numeric', 'numeric');
  }
  const precision = random.int(1, MAX_NUMERIC_PRECISION);
  const scale = random.int(0, Math.min(precision, MAX_FRACTION_DIGITS));
  return {
    ...plain('numeric', `numeric(${String(precision)},${String(scale)})`),
    precision,
    scale,
  };
}

function timestampRef(
  random: Random,
  base: 'timestamp' | 'timestamptz',
): TypeRef {
  if (random.chance(0.5)) {
    return plain(base, SPELLINGS[base]);
  }
  const precision = random.int(0, MAX_FRACTION_DIGITS);
  const zone = base === 'timestamp' ? 'without' : 'with';
  return {
    ...plain(base, `timestamp(${String(precision)}) ${zone} time zone`),
    precision,
  };
}

/** The base type `base` with modifiers drawn from `random`. */
export function baseRef(random: Random, base: BaseName): TypeRef {
  if (base === 'varchar' || base === 'bpchar') {
    return lengthRef(random, base);
  }
  if (base === 'numeric') {
    return numericRef(random);
  }
  if (base === 'timestamp' || base === 'timestamptz') {
    return timestampRef(random, base);
  }
  return plain(base, SPELLINGS[base]);
}

/** The enum `name`. */
export function enumRef(name: string): TypeRef {
  return { ...plain(name, name), typeKind: 'enum' };
}

/** The domain `domain`, whose modifiers it carries itself. */
export function domainRef(domain: PublicDomain): TypeRef {
  return { ...plain(domain.name, domain.name), typeKind: 'domain' };
}
