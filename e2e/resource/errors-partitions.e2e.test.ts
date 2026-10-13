/**
 * Violations raised through the partitioned `calls` table (resource SPEC
 * 9.5), on PGlite and on the server `RESOURCE_PG_URL` names. Each names
 * the partition that holds the row, in whichever schema it lives, so
 * `constraintError` alone finds no code: `partitionViolation` gives the
 * names to resolve, `PARTITION_ROOT_SQL` resolves them to `calls` and its
 * constraint, and `constraintError` then gives the declared code. The ids
 * land in each of the three partitions, which both majors agree on.
 */
import type { OracleDatabase } from './support/oracle-database.ts';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  constraintError,
  PARTITION_ROOT_SQL,
  partitionViolation,
} from '@nizam-os/resource-core/server';

import { Calls } from './resources/calls.ts';
import { CONTACTS_SCHEMA, liveDatabases } from './support/oracle-database.ts';

const ADA = '00000000-0000-4000-8000-000000000001';
const NO_CONTACT = '00000000-0000-4000-8000-00000000dead';
/** Each partition of `calls`, the id of the call it stores, and another id it would store. */
const PARTITIONS = [
  [
    'calls_even',
    '00000000-0000-4000-8000-0000000000c1',
    '00000000-0000-4000-8000-0000000000c3',
  ],
  [
    'archive.calls_odd_1',
    '00000000-0000-4000-8000-0000000000c8',
    '00000000-0000-4000-8000-0000000000cc',
  ],
  [
    'archive.calls_odd_3',
    '00000000-0000-4000-8000-0000000000c2',
    '00000000-0000-4000-8000-0000000000c5',
  ],
] as const;
const SEED = [
  "insert into organizations (name, slug, handle) values ('Acme', 'acme', 'acme')",
  `insert into contacts (id, organization_id, name) values ('${ADA}', 1, 'Ada')`,
];

/** An insert into `calls` of `id` with the given SQL literals in place of the valid ones. */
function insertCall(id: string, values: Readonly<Record<string, string>> = {}) {
  const row = {
    id: `'${id}'`,
    organization_id: '1',
    contact_id: `'${ADA}'`,
    minutes: '5',
    note: "'Hello'",
    ...values,
  };
  return `insert into calls (${Object.keys(row).join(', ')}) values (${Object.values(row).join(', ')})`;
}

/**
 * A violation: its insert, given the stored call's id and another id of
 * its partition, the constraint `calls` names it by, and its code. A CHECK
 * and a NOT NULL are checked before the row reaches an index, a foreign
 * key after, so only the duplicate reuses the stored id.
 */
const VIOLATIONS: ReadonlyArray<
  readonly [
    string,
    (stored: string, other: string) => string,
    string | undefined,
    string,
  ]
> = [
  [
    'a second call with the id',
    (stored) => insertCall(stored),
    'calls_pkey',
    'CALLS_PKEY',
  ],
  [
    'no minutes',
    (_stored, other) => insertCall(other, { minutes: '0' }),
    'calls_minutes_check',
    'CALLS_MINUTES_CHECK',
  ],
  [
    'no note',
    (_stored, other) => insertCall(other, { note: 'null' }),
    undefined,
    'CALLS_NOTE_NOT_NULL',
  ],
  [
    'a contact no row is',
    (_stored, other) => insertCall(other, { contact_id: `'${NO_CONTACT}'` }),
    'calls_contact_id_fkey',
    'CALLS_CONTACT_ID_FKEY',
  ],
];

/** What PostgreSQL refuses `sql` with, in a transaction it rolls back. */
async function refusalOf(
  database: OracleDatabase,
  sql: string,
): Promise<unknown> {
  await database.query('begin');
  try {
    await database.query(sql);
  } catch (error) {
    return error;
  } finally {
    await database.query('rollback');
  }
  throw new Error(`PostgreSQL accepted ${sql}`);
}

for (const [name, open] of liveDatabases(CONTACTS_SCHEMA)) {
  describe(`what ${name} refuses through a partition`, () => {
    let database: OracleDatabase;
    const resolve = async (
      names: NonNullable<ReturnType<typeof partitionViolation>>,
    ) => {
      const [row] = await database.query(PARTITION_ROOT_SQL, [
        names.schema,
        names.table,
        names.constraint ?? null,
      ]);
      return row === undefined
        ? undefined
        : {
            schema: String(row['schema']),
            table: String(row['table']),
            constraint:
              typeof row['constraint'] === 'string'
                ? row['constraint']
                : undefined,
          };
    };

    beforeAll(async () => {
      database = await open();
      for (const sql of [
        ...SEED,
        ...PARTITIONS.map(([, stored]) => insertCall(stored)),
      ]) {
        await database.query(sql);
      }
    });

    afterAll(async () => {
      await database.close();
    });

    describe.each(PARTITIONS)('in %s', (partition, stored, other) => {
      it.each(VIOLATIONS)(
        'maps %s to the code of calls',
        async (_what, sql, constraint, code) => {
          const thrown = await refusalOf(database, sql(stored, other));
          const options = { resource: Calls, operation: 'create' } as const;
          expect(constraintError(thrown, options)).toBeUndefined();
          const names = partitionViolation(thrown, options);
          if (names === undefined) {
            throw new Error('the violation names no partition', {
              cause: thrown,
            });
          }
          expect(
            `${names.schema}.${names.table}`.replace(/^public\./u, ''),
          ).toBe(partition);
          const root = await resolve(names);
          expect(root).toEqual({
            schema: 'public',
            table: 'calls',
            constraint,
          });
          expect(
            constraintError(thrown, { ...options, partition: root })?.code,
          ).toBe(code);
        },
      );
    });

    it('resolves a table that is not a partition to nothing', async () => {
      expect(
        await resolve({
          schema: 'public',
          table: 'calls',
          constraint: 'calls_pkey',
        }),
      ).toBeUndefined();
      expect(
        await resolve({ schema: 'public', table: 'contacts' }),
      ).toBeUndefined();
    });
  });
}
