/**
 * Violations a partition raises (SPEC 9.5). PostgreSQL stores a row
 * written through a partitioned table in one of its partitions, and a
 * violation names that partition, in whichever schema it lives, as its
 * table. A CHECK keeps the partitioned table's name, since the partition
 * inherits it, and a foreign key usually does, but a PRIMARY KEY, UNIQUE,
 * or EXCLUDE violation names the partition's own index. Partitions are
 * often created after the migrations ran, by pg_partman or by the
 * application, so the public catalog does not list them (ADR 0010): once
 * the operation's transaction ended, the runtime asks the storage adapter,
 * whose query is `PARTITION_ROOT_SQL`, and gives the answer to
 * `constraintError` as `partition`.
 * @ref https://www.postgresql.org/docs/18/ddl-partitioning.html
 * @ref https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-INFO-PARTITION (pg_partition_root)
 * @ref https://www.postgresql.org/docs/18/catalog-pg-constraint.html (conparentid)
 * @packageDocumentation
 */
import type { ConstraintErrorOptions } from './constraint-options';
import type { ViolationNames } from './violation-names';

import {
  findPostgresError,
  readPostgresFields,
} from '@nizam-os/ban-core/postgresql';

import { ownValue } from '../internal/object';
import { checkOptions } from './constraint-options';

/** SQLSTATE class 23, integrity constraint violation. */
const INTEGRITY_VIOLATION_CLASS = '23';

/**
 * The query of `StorageAdapter.partitionRoot`: `$1` the schema, `$2` the
 * table, and `$3` the constraint or `NULL`, each as text. For a partition
 * it returns one row, `schema`, `table`, and `constraint`: the partitioned
 * table at the top of the partition's tree, and that table's name for
 * `$3`, which is the constraint `$3` was cloned from (the top of its
 * `conparentid` chain, for a PRIMARY KEY, UNIQUE, FOREIGN KEY, or EXCLUDE
 * constraint), the unique index `$3` is attached to, or the CHECK `$3`
 * inherits, else `NULL`. For any other table it returns no row. It reads
 * only system catalogs, which every role may read.
 */
export const PARTITION_ROOT_SQL: string = `with recursive
  leaf as (
    select c.oid, pg_catalog.pg_partition_root(c.oid) as root
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = $1 and c.relname = $2 and c.relispartition
  ),
  chain as (
    select con.oid, con.conname, con.conparentid, con.conrelid
    from leaf
    join pg_catalog.pg_constraint con on con.conrelid = leaf.oid
    where con.conname = $3
    union all
    select parent.oid, parent.conname, parent.conparentid, parent.conrelid
    from chain
    join pg_catalog.pg_constraint parent on parent.oid = chain.conparentid
  ),
  names as (
    select 1 as rank, chain.conname as name
    from chain
    join leaf on chain.conrelid = leaf.root
    union all
    select 2, root_index.relname
    from leaf
    join pg_catalog.pg_index leaf_index on leaf_index.indrelid = leaf.oid
    join pg_catalog.pg_class leaf_class on leaf_class.oid = leaf_index.indexrelid
    join pg_catalog.pg_class root_index
      on root_index.oid = pg_catalog.pg_partition_root(leaf_index.indexrelid)
    join pg_catalog.pg_index root_definition
      on root_definition.indexrelid = root_index.oid and root_definition.indrelid = leaf.root
    where leaf_class.relname = $3
    union all
    select 3, con.conname
    from leaf
    join pg_catalog.pg_constraint con on con.conrelid = leaf.root
    where con.conname = $3 and con.contype = 'c'
  )
select n.nspname as "schema", r.relname as "table",
  (select names.name from names order by names.rank limit 1) as "constraint"
from leaf
join pg_catalog.pg_class r on r.oid = leaf.root
join pg_catalog.pg_namespace n on n.oid = r.relnamespace`;

/** Whether `names` is the table the resource is declared on. */
function isDeclaredTable(
  options: ReturnType<typeof checkOptions>,
  names: ViolationNames,
): boolean {
  const { catalog, resource } = options.internals;
  const tableDef = ownValue(catalog.tables, resource.table);
  return tableDef?.schema === names.schema && tableDef.name === names.table;
}

/**
 * The names to resolve with `StorageAdapter.partitionRoot` when `thrown`
 * carries an integrity violation naming a table other than the
 * resource's, as one a partition of it raised does. `undefined` for any
 * other error, for a violation of the resource's own table, and for a
 * remove, whose violations are all `CONFLICT`. Throws `TypeError` for the
 * options `constraintError` refuses.
 */
export function partitionViolation(
  thrown: unknown,
  options: ConstraintErrorOptions,
): ViolationNames | undefined {
  const checked = checkOptions('partitionViolation', options);
  const driverError = findPostgresError(thrown);
  if (driverError === undefined || checked.operation === 'remove') {
    return undefined;
  }
  const { errorClass, schema, table, constraint } =
    readPostgresFields(driverError);
  if (
    errorClass !== INTEGRITY_VIOLATION_CLASS ||
    schema === undefined ||
    table === undefined
  ) {
    return undefined;
  }
  const names =
    constraint === undefined
      ? { schema, table }
      : { schema, table, constraint };
  return isDeclaredTable(checked, names) ? undefined : Object.freeze(names);
}
