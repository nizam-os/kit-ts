/**
 * keyset-core's view of a level (SPEC 11.2, keyset SPEC 3.1, 4.2): its
 * field type, an enum's values, an array's element type, the collation,
 * and the operators the type takes. A text level under `enum` rules is an
 * enum of the values every rule allows; an enum without values, a JSON
 * type, and an array of enum values have no keyset type.
 * Not published with the package.
 * @packageDocumentation
 */
import type { PublicCatalog, Rule } from '@nizam-os/catalog-core';

import type { ValueLevel } from './value-levels';

import { domainRules } from './value-levels';

/** A keyset type and what it carries. */
export interface ModelKeysetType {
  readonly type: string;
  /** An enum's values, sorted, since the SPEC gives them no order. */
  readonly values?: ReadonlyArray<string>;
  readonly of?: string;
  readonly collation?: 'insensitive';
}

const SCALAR_TYPES: Readonly<Record<string, string>> = {
  text: 'text',
  varchar: 'text',
  bpchar: 'text',
  citext: 'text',
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
};

const COMPARABLE = new Set([
  'text',
  'integer',
  'bigint',
  'decimal',
  'float',
  'date',
  'time',
  'timestamp',
  'timestamptz',
]);
const TEXT_PATTERNS = [
  'contains',
  'startsWith',
  'endsWith',
  'eqi',
  'containsi',
  'startsWithi',
  'endsWithi',
];

function enumOf(values: ReadonlyArray<string>): ModelKeysetType | null {
  return values.length === 0
    ? null
    : { type: 'enum', values: [...values].toSorted() };
}

/** The values every `enum` rule allows of `start`, which an enum's labels may seed. */
function allowed(
  start: ReadonlyArray<string>,
  memberships: ReadonlyArray<ReadonlyArray<string>>,
): Array<string> {
  return start.filter((value) =>
    memberships.every((values) => values.includes(value)),
  );
}

/**
 * The values a scalar level allows (SPEC 8 `options`): an enum's labels or
 * the values of its `enum` rules, each narrowed by the others; `null` when
 * neither restricts it.
 */
export function enumValuesOf(
  catalog: PublicCatalog,
  level: ValueLevel,
  extra: ReadonlyArray<Rule>,
): Array<string> | null {
  const base = level.base!;
  const memberships = [...domainRules(level), ...extra].flatMap((rule) =>
    rule.kind === 'enum' ? [rule.values] : [],
  );
  if (base.isEnum) {
    return allowed(catalog.enums[base.type] ?? [], memberships);
  }
  return memberships.length === 0
    ? null
    : allowed(memberships[0]!, memberships);
}

function scalarType(
  catalog: PublicCatalog,
  level: ValueLevel,
  extra: ReadonlyArray<Rule>,
): ModelKeysetType | null {
  const base = level.base!;
  const values = enumValuesOf(catalog, level, extra);
  const type = base.isEnum ? 'enum' : SCALAR_TYPES[base.type];
  if (type === undefined) {
    return null;
  }
  if (base.isEnum || (type === 'text' && values !== null)) {
    return enumOf(values ?? []);
  }
  return base.type === 'citext' ? { type, collation: 'insensitive' } : { type };
}

/** The keyset type of a level under `extra`, the column's own rules; `null` when it has none. */
export function keysetTypeOf(
  catalog: PublicCatalog,
  level: ValueLevel,
  extra: ReadonlyArray<Rule>,
): ModelKeysetType | null {
  if (level.element === null) {
    return scalarType(catalog, level, extra);
  }
  const element = scalarType(catalog, level.element, []);
  return element === null || element.type === 'enum'
    ? null
    : { type: 'array', of: element.type };
}

/** The operators keyset-core takes for a field of `type` (keyset SPEC 4.2). */
export function fieldOperators(type: string, nullable: boolean): Array<string> {
  const nulls = nullable ? ['isNull'] : [];
  if (type === 'array') {
    return ['contains', 'containedBy', 'overlaps', ...nulls];
  }
  return [
    'eq',
    'ne',
    ...(type === 'boolean' ? [] : ['in', 'nin']),
    ...(COMPARABLE.has(type) ? ['gt', 'gte', 'lt', 'lte', 'between'] : []),
    ...(type === 'text' ? TEXT_PATTERNS : []),
    ...nulls,
  ];
}

/** A relationship's operators (SPEC 11.3): `bool` keys take no lists, NOT NULL keys no `isNull`. */
export function relationshipOperators(
  type: string,
  nullable: boolean,
): Array<string> {
  return [
    'eq',
    'ne',
    ...(type === 'boolean' ? [] : ['in', 'nin']),
    ...(nullable ? ['isNull'] : []),
  ];
}
