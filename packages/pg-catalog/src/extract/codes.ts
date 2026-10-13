/**
 * The single-character codes of `pg_catalog`, decoded to the model's names.
 * @ref https://www.postgresql.org/docs/18/catalog-pg-type.html (typtype)
 * @ref https://www.postgresql.org/docs/18/catalog-pg-constraint.html (confupdtype, confdeltype)
 * @ref https://www.postgresql.org/docs/18/catalog-pg-policy.html (polcmd)
 * @ref https://www.postgresql.org/docs/18/catalog-pg-attribute.html (attidentity, attgenerated)
 * @packageDocumentation
 */
import type {
  Identity,
  PolicyCommand,
  ReferentialAction,
  TypeKind,
} from '@nizam-os/catalog-core';

import { PgCatalogError } from '../errors';

export const TYPE_KINDS: Readonly<Record<string, TypeKind>> = {
  b: 'base',
  e: 'enum',
  d: 'domain',
  c: 'composite',
  r: 'range',
  m: 'multirange',
};

export const REFERENTIAL_ACTIONS: Readonly<Record<string, ReferentialAction>> =
  {
    a: 'noAction',
    r: 'restrict',
    c: 'cascade',
    n: 'setNull',
    d: 'setDefault',
  };

export const POLICY_COMMANDS: Readonly<Record<string, PolicyCommand>> = {
  '*': 'all',
  r: 'select',
  a: 'insert',
  w: 'update',
  d: 'delete',
};

/** `attidentity`; `""` is not an identity column. */
export const IDENTITIES: Readonly<Record<string, Identity>> = {
  a: 'always',
  d: 'byDefault',
};

/** `attgenerated`; `""` is not a generated column, and `v` arrived in PostgreSQL 18. */
export const GENERATED_KINDS: Readonly<Record<string, 'stored' | 'virtual'>> = {
  s: 'stored',
  v: 'virtual',
};

/**
 * The model name of `code`. A code missing from the table comes from a
 * PostgreSQL newer than this package knows, so it fails as
 * `unsupported_server` rather than guessing.
 */
export function decode<TValue>(
  codes: Readonly<Record<string, TValue>>,
  code: string,
  column: string,
): TValue {
  const value = Object.hasOwn(codes, code) ? codes[code] : undefined;
  if (value === undefined) {
    throw new PgCatalogError(
      'unsupported_server',
      `the server returned ${column} "${code}", which this version of @nizam-os/pg-catalog does not know`,
    );
  }
  return value;
}

/** Decodes an optional code, where `""` means none. */
export function decodeOptional<TValue>(
  codes: Readonly<Record<string, TValue>>,
  code: string,
  column: string,
): TValue | null {
  return code === '' ? null : decode(codes, code, column);
}
