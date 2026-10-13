/**
 * Helpers for the error code tests (SPEC 9): the entry of each kind, and a
 * one-table catalog with the domains a case needs. Wide types: runtime
 * tests only. Not published with the package.
 * @packageDocumentation
 */
import type {
  PublicColumn,
  PublicConstraint,
  PublicDomain,
  Rule,
} from '@nizam-os/catalog-core';

import type { DeclaredResource } from '../declare/declared-resource';

import {
  catalogOf,
  column,
  domain,
  table,
  untypedDeclare,
} from './catalog-builder';
import { TEST_REGISTRIES } from './definer';

/** A derived code's entry, as `toEqual` compares it. */
export interface EntryLike {
  readonly status: number;
  readonly title: string;
  readonly kind: string;
  readonly fields: ReadonlyArray<string>;
}

const INVALID = { status: 422, title: 'Invalid Attribute' } as const;
const CONFLICT = { status: 409, title: 'Conflict' } as const;

/** The entry of a CHECK over `fields`. */
export function check(...fields: Array<string>): EntryLike {
  return { ...INVALID, kind: 'check', fields };
}

/** The entry of a NOT NULL key of `field`. */
export function notNull(field: string): EntryLike {
  return { ...INVALID, kind: 'notNull', fields: [field] };
}

/** The entry of a UNIQUE, PRIMARY KEY, or EXCLUDE constraint over `fields`. */
export function conflict(
  kind: 'unique' | 'primaryKey' | 'exclusion',
  ...fields: Array<string>
): EntryLike {
  return { ...CONFLICT, kind, fields };
}

/** The entry of a foreign key over `fields`. */
export function missing(...fields: Array<string>): EntryLike {
  return {
    status: 404,
    title: 'Related Resource Not Found',
    kind: 'foreignKey',
    fields,
  };
}

export const SIZE: Rule = { kind: 'length', min: 1, max: 10 };
export const UPPER: Rule = {
  kind: 'pattern',
  source: '^[A-Z]+$',
  flags: 'su',
};

/** A column whose type is the domain `name`. */
export function domainColumn(name: string): PublicColumn {
  return column({ type: name, typeKind: 'domain', sqlType: name });
}

/** The domain `name` over `text`, or over `base`, with one CHECK. */
export function checkedDomain(
  name: string,
  constraint: string,
  rule: Rule,
  base?: string,
): PublicDomain {
  return domain(name, {
    ...(base === undefined
      ? {}
      : { type: base, typeKind: 'domain', sqlType: base }),
    constraints: { [constraint]: { kind: 'check', rule } },
  });
}

/**
 * A resource over table `t`, keyed by a uuid `id`, with the columns,
 * constraints, and domains given, and the definer's `domains` entries.
 */
export function declareOver(
  columns: Readonly<Record<string, PublicColumn>>,
  constraints: Readonly<Record<string, PublicConstraint>>,
  domains: ReadonlyArray<PublicDomain>,
  declaration: object,
  domainRules: object = {},
): DeclaredResource {
  const id = column({ type: 'uuid', sqlType: 'uuid', nullable: false });
  const catalog = catalogOf(
    { t: table('t', { id, ...columns }, constraints) },
    Object.fromEntries(domains.map((entry) => [entry.name, entry])),
  );
  return untypedDeclare(catalog, {
    codecs: TEST_REGISTRIES.codecs,
    validators: TEST_REGISTRIES.validators,
    domains: domainRules,
  })('t', {
    operations: ['get', 'create'],
    ...declaration,
  });
}
