/**
 * Integrity violations as node-postgres 8.23, postgres.js 3.4.9, and PGlite
 * 0.5.8 report them (SPEC 9.5): the fields each driver set on the error of
 * each statement, captured on PostgreSQL 14.19 (node-postgres, postgres.js)
 * and PGlite's PostgreSQL 18, which agree field for field. node-postgres and
 * PGlite share pg-protocol's error class, which declares every field and
 * leaves an absent one `undefined`; postgres.js names each field after the
 * protocol and sets only the fields the server sent. `restrict` is what
 * PostgreSQL 18 raises when the foreign key is `on delete restrict` and an
 * owner Things references is removed; PostgreSQL 14 raises `foreignKey`.
 * The schema:
 *
 * ```sql
 * create domain short_code as text constraint short_code_check check (length(value) <= 3);
 * create table owners (id int primary key, label text);
 * create table things (
 *   id int primary key, organization_id int not null, name text not null,
 *   code short_code, qty int constraint things_qty_check check (qty >= 0),
 *   owner_id int references owners(id), during tstzrange,
 *   constraint things_code_key unique (code),
 *   constraint things_during_excl exclude using gist (during with &&));
 * ```
 *
 * Not published with the package.
 * @ref https://github.com/brianc/node-postgres/blob/master/packages/pg-protocol/src/messages.ts
 * @ref https://github.com/porsager/postgres/blob/master/src/errors.js
 * @packageDocumentation
 */
import type { PublicColumn } from '@nizam-os/catalog-core';

import type { DeclaredResource } from '../declare/declared-resource';

import {
  catalogOf,
  column,
  domain,
  table,
  untypedDeclare,
} from './catalog-builder';
import { TEST_REGISTRIES } from './definer';

/** The fields of a violation, by the node-postgres names. */
export interface Violation {
  readonly code: string;
  readonly schema: string;
  readonly table?: string;
  readonly column?: string;
  readonly constraint?: string;
  readonly dataType?: string;
}

type ViolationName =
  | 'notNull'
  | 'scopeNotNull'
  | 'unique'
  | 'check'
  | 'exclusion'
  | 'foreignKey'
  | 'restrict'
  | 'primaryKey'
  | 'domainCheck';

const THINGS = { code: '23505', schema: 'public', table: 'things' } as const;

/** What each statement raised; removing an owner Things references raises `foreignKey` too. */
export const VIOLATIONS: Readonly<Record<ViolationName, Violation>> = {
  notNull: { ...THINGS, code: '23502', column: 'name' },
  scopeNotNull: { ...THINGS, code: '23502', column: 'organization_id' },
  unique: { ...THINGS, constraint: 'things_code_key' },
  check: { ...THINGS, code: '23514', constraint: 'things_qty_check' },
  exclusion: { ...THINGS, code: '23P01', constraint: 'things_during_excl' },
  foreignKey: { ...THINGS, code: '23503', constraint: 'things_owner_id_fkey' },
  restrict: { ...THINGS, code: '23001', constraint: 'things_owner_id_fkey' },
  primaryKey: { ...THINGS, constraint: 'things_pkey' },
  domainCheck: {
    code: '23514',
    schema: 'public',
    constraint: 'short_code_check',
    dataType: 'short_code',
  },
};

/** pg-protocol's `DatabaseError`, which node-postgres and PGlite throw. */
class DatabaseError extends Error {
  public override readonly name: string = 'error';
  public severity: string | undefined;
  public code: string | undefined;
  public schema: string | undefined;
  public table: string | undefined;
  public column: string | undefined;
  public dataType: string | undefined;
  public constraint: string | undefined;
}

/** postgres.js's `PostgresError`. */
class PostgresError extends Error {
  public override readonly name: string = 'PostgresError';
}

function databaseError(violation: Violation): Error {
  return Object.assign(new DatabaseError('violates a constraint'), {
    severity: 'ERROR',
    ...violation,
  });
}

/** Each driver's error for a violation. */
export const DRIVERS: ReadonlyArray<
  readonly [string, (violation: Violation) => Error]
> = [
  ['node-postgres', databaseError],
  ['PGlite', databaseError],
  [
    'postgres.js',
    (violation) =>
      Object.assign(new PostgresError('violates a constraint'), {
        severity_local: 'ERROR',
        severity: 'ERROR',
        code: violation.code,
        schema_name: violation.schema,
        ...(violation.table === undefined
          ? {}
          : { table_name: violation.table }),
        ...(violation.column === undefined
          ? {}
          : { column_name: violation.column }),
        ...(violation.constraint === undefined
          ? {}
          : { constraint_name: violation.constraint }),
        ...(violation.dataType === undefined
          ? {}
          : { 'data type_name': violation.dataType }),
      }),
  ],
];

const int = (overrides: Partial<PublicColumn> = {}): PublicColumn =>
  column({ type: 'int4', sqlType: 'integer', ...overrides });

const catalog = catalogOf(
  {
    owners: table(
      'owners',
      { id: int({ nullable: false }), label: column() },
      {
        owners_pkey: { kind: 'primaryKey', columns: ['id'] },
      },
    ),
    things: table(
      'things',
      {
        id: int({ nullable: false }),
        organization_id: int({ nullable: false }),
        name: column({ nullable: false }),
        code: column({
          type: 'short_code',
          typeKind: 'domain',
          sqlType: 'short_code',
        }),
        qty: int(),
        owner_id: int(),
        during: column({ type: 'tstzrange', sqlType: 'tstzrange' }),
      },
      {
        things_pkey: { kind: 'primaryKey', columns: ['id'] },
        things_code_key: {
          kind: 'unique',
          columns: ['code'],
          nullsDistinct: true,
          partial: false,
        },
        things_qty_check: {
          kind: 'check',
          columns: ['qty'],
          rule: {
            kind: 'range',
            min: { value: '0', inclusive: true },
            max: null,
          },
          enforced: true,
        },
        things_owner_id_fkey: {
          kind: 'foreignKey',
          columns: ['owner_id'],
          references: { table: 'owners', columns: ['id'] },
          enforced: true,
        },
        things_during_excl: { kind: 'exclusion', columns: ['during'] },
      },
    ),
  },
  {
    short_code: domain('short_code', {
      constraints: {
        short_code_check: {
          kind: 'check',
          rule: { kind: 'length', min: null, max: 3 },
        },
      },
    }),
  },
);

const declare = untypedDeclare(catalog, {
  codecs: TEST_REGISTRIES.codecs,
  validators: TEST_REGISTRIES.validators,
  scopes: { organization: { column: 'organization_id' } },
});

const READ_WRITE = { access: 'readWrite' } as const;

export const Owners: DeclaredResource = declare('owners', {
  operations: ['get', 'create', 'remove'],
  clientIds: true,
  fields: { label: READ_WRITE },
});

export const Things: DeclaredResource = declare('things', {
  operations: ['get', 'create', 'update', 'remove'],
  scope: 'organization',
  clientIds: true,
  fields: {
    name: READ_WRITE,
    code: READ_WRITE,
    qty: READ_WRITE,
    during: { access: 'readWrite', codec: 'range' },
  },
  relationships: { owner_id: { target: () => Owners, access: 'readWrite' } },
});
