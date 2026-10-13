/**
 * `constraintError(thrown, { resource, operation, pointer })` (SPEC 9.5):
 * the declared error of a PostgreSQL integrity violation raised inside an
 * operation, or `undefined` for anything it does not own, which the ban's
 * `map` (typically `postgresMapper()`) then handles with its SQLSTATE
 * table. It runs inside the operation because only there are the
 * operation and the base of the document known. The driver error is found
 * and read by `@nizam-os/ban-core/postgresql`, so node-postgres, PGlite,
 * postgres.js, Neon, and Bun need no import here.
 *
 * A NOT NULL violation names its table and column but no constraint on any
 * supported major, so its rule key is the NOT NULL key; a domain's CHECK
 * names the domain in field `d` and no table; every other violation names
 * its table and constraint. A violation is matched by schema and name, and
 * a found code is kept only when its constraint kind is the one the
 * SQLSTATE reports, since a unique index may share its name with a CHECK
 * or FOREIGN KEY constraint of its table (catalog ADR 0009). A remove
 * carries no members, so every integrity violation it raises is another
 * row's: a reference that blocks it (23503, or 23001 for `ON DELETE
 * RESTRICT` from PostgreSQL 18) or a referential action whose result breaks
 * a constraint of the referencing row, such as `ON DELETE SET NULL` against
 * a CHECK. It names the referencing table, which may not be a declared
 * resource, so it is the built-in `CONFLICT`. A violation a partition
 * raised names the partition; with `partition`, the names
 * `StorageAdapter.partitionRoot` resolved for it, it is read as the
 * partitioned table's (`partition.ts`).
 * @ref https://www.postgresql.org/docs/18/protocol-error-fields.html
 * @ref https://www.postgresql.org/docs/18/errcodes-appendix.html
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/ri_triggers.c (ri_ReportViolation: ERRCODE_RESTRICT_VIOLATION)
 * @packageDocumentation
 */
import type { PostgresErrorFields } from '@nizam-os/ban-core/postgresql';

import type { DeclaredInternals } from '../declare/declared-resource';
import type { ConstraintKind } from '../errors/error-entry';
import type { ConstraintErrorOptions } from './constraint-options';
import type { ViolationNames } from './violation-names';

import { BanError, BUILTIN_CATALOG } from '@nizam-os/ban-core';
import {
  findPostgresError,
  readPostgresFields,
} from '@nizam-os/ban-core/postgresql';

import { notNullKey } from '../catalog/columns';
import { ownValue } from '../internal/object';
import { codeError } from './code-error';
import { checkOptions } from './constraint-options';

/** The constraint kinds each integrity SQLSTATE reports. */
const SQLSTATE_KINDS: ReadonlyMap<
  string,
  ReadonlySet<ConstraintKind>
> = new Map([
  ['23502', new Set<ConstraintKind>(['notNull'])],
  ['23503', new Set<ConstraintKind>(['foreignKey'])],
  ['23505', new Set<ConstraintKind>(['unique', 'primaryKey'])],
  ['23514', new Set<ConstraintKind>(['check'])],
  ['23P01', new Set<ConstraintKind>(['exclusion'])],
]);
const NOT_NULL_VIOLATION = '23502';
/** SQLSTATE class 23, integrity constraint violation. */
const INTEGRITY_VIOLATION_CLASS = '23';
const STILL_REFERENCED = 'The resource is still referenced.';

/** The code of a domain CHECK the violation names by its domain, schema, and constraint. */
function domainCheckCode(
  internals: DeclaredInternals,
  fields: PostgresErrorFields,
): string | undefined {
  for (const [name, checks] of internals.domainChecks) {
    const domain = ownValue(internals.catalog.domains, name);
    if (
      domain !== undefined &&
      domain.schema === fields.schema &&
      domain.name === fields.dataType
    ) {
      return fields.constraint === undefined
        ? undefined
        : checks.get(fields.constraint);
    }
  }
  return undefined;
}

/** A table and constraint as a violation names them, each possibly absent. */
type Named = Pick<PostgresErrorFields, 'schema' | 'table' | 'constraint'>;

/** The table and constraint the violation names: the partitioned table's, when `partition` resolved them. */
function namesOf(
  fields: PostgresErrorFields,
  partition: ViolationNames | undefined,
): Named {
  return partition === undefined
    ? fields
    : {
        schema: partition.schema,
        table: partition.table,
        constraint: partition.constraint,
      };
}

/** The code of the rule the violation names, before its kind is checked. */
function codeOf(
  internals: DeclaredInternals,
  fields: PostgresErrorFields,
  partition: ViolationNames | undefined,
): string | undefined {
  const { resource, catalog } = internals;
  if (fields.table === undefined) {
    return domainCheckCode(internals, fields);
  }
  const names = namesOf(fields, partition);
  const tableDef = ownValue(catalog.tables, resource.table);
  if (
    tableDef === undefined ||
    tableDef.schema !== names.schema ||
    tableDef.name !== names.table
  ) {
    return undefined;
  }
  if (fields.sqlstate === NOT_NULL_VIOLATION) {
    return fields.column === undefined
      ? undefined
      : resource.names.rules.get(notNullKey(tableDef, fields.column));
  }
  return names.constraint === undefined
    ? undefined
    : resource.names.rules.get(names.constraint);
}

/**
 * The declared error of a PostgreSQL integrity violation raised inside an
 * operation on `options.resource`: the code's status and title, its
 * constraint kind's constant detail, one item per member of the code's
 * `fields` under `options.pointer`, and the driver error, never a wrapper,
 * as `cause`. `undefined` when `thrown` carries no PostgreSQL error or a
 * violation the resource declares no code for. Throws `TypeError` for
 * options that do not name a declared resource, an operation, and a
 * pointer, or whose `partition` is not what `partitionRoot` answers.
 */
export function constraintError(
  thrown: unknown,
  options: ConstraintErrorOptions,
): BanError | undefined {
  const { internals, operation, base, partition } = checkOptions(
    'constraintError',
    options,
  );
  const driverError = findPostgresError(thrown);
  if (driverError === undefined) {
    return undefined;
  }
  const fields = readPostgresFields(driverError);
  if (
    operation === 'remove' &&
    fields.sqlstate.startsWith(INTEGRITY_VIOLATION_CLASS)
  ) {
    return new BanError({
      ...BUILTIN_CATALOG.CONFLICT,
      code: 'CONFLICT',
      detail: STILL_REFERENCED,
      cause: driverError,
    });
  }
  const code = codeOf(internals, fields, partition);
  const { errors } = internals.resource;
  const entry = code === undefined ? undefined : ownValue(errors, code);
  if (
    code === undefined ||
    entry === undefined ||
    SQLSTATE_KINDS.get(fields.sqlstate)?.has(entry.kind) !== true
  ) {
    return undefined;
  }
  return codeError(internals.resource, code, entry, base, driverError);
}
