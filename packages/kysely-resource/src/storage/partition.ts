import type { Kysely } from 'kysely';

/**
 * Partitions (SPEC 18.2, obligation 11 of resource SPEC 12.8):
 * `partitionRoot` runs resource-core's `PARTITION_ROOT_SQL` as a statement
 * of its own, outside any operation, and answers the names of its row, or
 * `undefined` when the table is not a partition. The query reads only
 * system catalogs, which every role may read.
 * @packageDocumentation
 */
import type { AnyDatabase } from '@nizam-os/kysely-keyset';
import type { ViolationNames } from '@nizam-os/resource-core/server';

import { CompiledQuery } from 'kysely';

import { PARTITION_ROOT_SQL } from '@nizam-os/resource-core/server';

/** A row of `PARTITION_ROOT_SQL`. */
interface PartitionRow {
  readonly schema: string;
  readonly table: string;
  readonly constraint: string | null;
}

/** The partitioned table at the top of `names.table`'s tree and its name for `names.constraint`; `undefined` for a table that is not a partition. */
export async function partitionRoot(
  db: Kysely<AnyDatabase>,
  names: ViolationNames,
): Promise<ViolationNames | undefined> {
  const { rows } = await db.executeQuery<PartitionRow>(
    CompiledQuery.raw(PARTITION_ROOT_SQL, [
      names.schema,
      names.table,
      names.constraint ?? null,
    ]),
  );
  const [row] = rows;
  if (row === undefined) {
    return undefined;
  }
  const { schema, table, constraint } = row;
  return constraint === null
    ? { schema, table }
    : { schema, table, constraint };
}
