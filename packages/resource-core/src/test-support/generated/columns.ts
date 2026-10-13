/**
 * Generated columns (SPEC 15.2): of every type of SPEC 5.1, an enum, a
 * domain, or an array of one of them, nullable or not, with or without a
 * default, and some identity or generated; and primary keys of the types
 * a resource id can carry (SPEC 3.4).
 * Not published with the package.
 * @packageDocumentation
 */
import type { PublicColumn } from '@nizam-os/catalog-core';

import type { TypeScope } from './domains';
import type { Random } from './random';
import type { TypeRef } from './type-refs';

import { elementDomains } from './domains';
import {
  baseRef,
  domainRef,
  enumRef,
  JSON_BASES,
  SCALAR_BASES,
} from './type-refs';

const INTEGER_BASES = new Set(['int2', 'int4', 'int8']);

/** The enums with labels, which a key or a filtered enum needs. */
function labelledEnums(scope: TypeScope): Array<string> {
  return Object.entries(scope.enums)
    .filter(([, labels]) => labels.length > 0)
    .map(([name]) => name);
}

/** A column of `ref`, plain: no default, identity, or generation. */
function columnOf(
  ref: TypeRef,
  array: boolean,
  nullable: boolean,
): PublicColumn {
  return {
    type: ref.type,
    typeKind: ref.typeKind,
    array,
    sqlType: array ? `${ref.sqlType}[]` : ref.sqlType,
    maxLength: ref.maxLength,
    precision: ref.precision,
    scale: ref.scale,
    nullable,
    default: null,
    identity: null,
    generated: null,
  };
}

type Shape = 'base' | 'array' | 'enum' | 'domain' | 'domainArray';

function shapeType(
  random: Random,
  scope: TypeScope,
  shape: Shape,
): readonly [TypeRef, boolean] {
  const enums = Object.keys(scope.enums);
  const domains = Object.values(scope.domains);
  const scalars = elementDomains(scope);
  if (shape === 'enum' && enums.length > 0) {
    return [enumRef(random.pick(enums)), random.chance(0.3)];
  }
  if (shape === 'domain' && domains.length > 0) {
    return [domainRef(random.pick(domains)), false];
  }
  if (shape === 'domainArray' && scalars.length > 0) {
    return [domainRef(random.pick(scalars)), true];
  }
  if (shape === 'array') {
    return [baseRef(random, random.pick(SCALAR_BASES)), true];
  }
  return [
    baseRef(random, random.pick([...SCALAR_BASES, ...JSON_BASES])),
    false,
  ];
}

/** A column of a random shape over the types of `scope`. */
export function generateColumn(random: Random, scope: TypeScope): PublicColumn {
  const shape = random.pick<Shape>([
    'base',
    'base',
    'base',
    'array',
    'enum',
    'domain',
    'domain',
    'domainArray',
  ]);
  const [ref, array] = shapeType(random, scope, shape);
  const column = columnOf(ref, array, random.chance(0.6));
  if (
    !array &&
    ref.typeKind === 'base' &&
    INTEGER_BASES.has(ref.type) &&
    random.chance(0.12)
  ) {
    return {
      ...column,
      nullable: false,
      identity: random.pick(['always', 'byDefault'] as const),
    };
  }
  if (random.chance(0.08)) {
    return {
      ...column,
      generated: {
        kind: random.pick(['stored', 'virtual'] as const),
        searchConfig: null,
      },
    };
  }
  return random.chance(0.3)
    ? { ...column, default: { literal: null } }
    : column;
}

type KeyKind =
  | 'identityAlways'
  | 'identityByDefault'
  | 'uuid'
  | 'text'
  | 'int2'
  | 'numeric'
  | 'date'
  | 'bpchar'
  | 'float8'
  | 'timestamptz'
  | 'bool'
  | 'enum';

const KEY_KINDS: ReadonlyArray<KeyKind> = [
  'identityAlways',
  'identityByDefault',
  'uuid',
  'uuid',
  'text',
  'int2',
  'numeric',
  'date',
  'bpchar',
  'float8',
  'timestamptz',
  'bool',
  'enum',
];

/** A primary key column whose type carries a resource id and orders a page (SPEC 3.4). */
export function generateKey(random: Random, scope: TypeScope): PublicColumn {
  const kind = random.pick(KEY_KINDS);
  const enums = labelledEnums(scope);
  if (kind === 'identityAlways' || kind === 'identityByDefault') {
    const ref = baseRef(random, kind === 'identityAlways' ? 'int4' : 'int8');
    const identity = kind === 'identityAlways' ? 'always' : 'byDefault';
    return { ...columnOf(ref, false, false), identity };
  }
  if (kind === 'uuid') {
    return {
      ...columnOf(baseRef(random, 'uuid'), false, false),
      default: { literal: null },
    };
  }
  if (kind === 'enum' && enums.length > 0) {
    return columnOf(enumRef(random.pick(enums)), false, false);
  }
  return columnOf(
    baseRef(random, kind === 'enum' ? 'text' : kind),
    false,
    false,
  );
}
