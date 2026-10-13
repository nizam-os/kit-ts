/**
 * Defects the storage contract must catch (resource SPEC 12.9): each
 * builds the reference adapter with one obligation broken, by rewriting
 * or skipping a statement on its way to the database or by wrapping the
 * adapter, and names the cases that must then fail. A contract case that
 * passes whatever the adapter does proves nothing; these show that each
 * fails for the defect it is about.
 */
import type { FaultyAdapter } from './faulty-adapters.ts';

import { PARTITION_ROOT_SQL } from '@nizam-os/resource-core/server';

import { OUTBOX } from './contract-database.ts';
import {
  CONTEXTLESS,
  outboxAfterRun,
  reference,
  rewriting,
  unguarded,
  withNulls,
  wrapping,
} from './faulty-adapters.ts';
import { LIST_FAULTS } from './list-faults.ts';
import { READ_FAULTS } from './read-faults.ts';

/** A defect: what it breaks, the cases that must fail, and the adapter that has it. */
export interface Fault {
  readonly name: string;
  readonly fails: ReadonlyArray<string>;
  /** Only a server runs two transactions at once; PGlite serializes them. */
  readonly concurrent?: boolean;
  /** The SQLSTATE the database refuses the defect's writes with, before any check of a case runs. */
  readonly refused?: string;
  readonly adapter: FaultyAdapter;
}

const SET_LOCAL = 'select set_config($1, $2, true)';
const SCOPE_PREDICATE = /"workspace_id" = (\$\d+)::text::"int8"/gu;
const ROW_LOCK = / for (?:no key )?update$/u;

const O1_FIRST =
  "obligation 1: sets each scope's parameter before the transaction's first statement";
const O1_UNCHANGED =
  'obligation 1: rolls back and rejects with what the run threw, unchanged';
const O1_WENT_ON =
  'obligation 1: rejects with the error of a statement that failed, though the run went on';
const O6_ROLLBACK =
  "obligation 6: a refused statement rejects its transaction and rolls back the transaction's earlier writes";
const O10_UPDATE =
  'obligation 10: a row locked for an update takes no other write until the transaction ends';
const O10_REMOVE =
  'obligation 10: a row locked for a remove takes no new reference until the transaction ends';
const O11_ROOT =
  'obligation 11: partitionRoot names the partitioned table and its constraint for what a partition raised';
const O11_NONE =
  'obligation 11: partitionRoot answers undefined for a table that is not a partition';

/** The defects, each with the cases that must fail. */
export const FAULTS: ReadonlyArray<Fault> = [
  {
    name: 'never sets the scope parameters',
    fails: [O1_FIRST],
    adapter: rewriting((sql) => (sql === SET_LOCAL ? undefined : sql)),
  },
  {
    name: 'sets the scope parameters for the session',
    fails: ['obligation 1: sets the parameters for their transaction only'],
    adapter: rewriting((sql) =>
      sql === SET_LOCAL ? 'select set_config($1, $2, false)' : sql,
    ),
  },
  {
    name: 'runs every statement in a transaction of its own',
    fails: [O1_UNCHANGED, O6_ROLLBACK],
    adapter: (database) => reference(async (run) => run(database.autocommit)),
  },
  {
    name: 'commits after a failed statement',
    fails: [O1_WENT_ON],
    adapter: unguarded,
  },
  {
    name: 'replaces errors with its own',
    fails: [
      O1_UNCHANGED,
      O1_WENT_ON,
      'obligation 6: a CHECK violation reaches constraintError',
      'obligation 6: a unique violation reaches constraintError, within the scope',
      'obligation 6: a duplicate client id reaches constraintError',
      'obligation 6: a foreign key violation reaches constraintError',
      'obligation 6: removing a referenced row reaches constraintError as CONFLICT',
      O6_ROLLBACK,
    ],
    adapter: wrapping((adapter) => ({
      ...adapter,
      transaction: async (scopes, run) => {
        try {
          return await adapter.transaction(scopes, run);
        } catch {
          throw new Error('the transaction failed');
        }
      },
    })),
  },
  {
    name: 'leaves out the scope predicate',
    fails: [
      'obligation 7: a row of another scope is absent for get, lock, update, and remove',
      "obligation 2: count counts the rows of the transaction's scope only",
      "obligation 2: every page of list holds the rows of the transaction's scope only",
    ],
    adapter: rewriting((sql) =>
      sql.replaceAll(SCOPE_PREDICATE, '$1::text is not null'),
    ),
  },
  ...READ_FAULTS,
  {
    name: 'writes a member left out as null',
    fails: [
      'obligation 4: create writes only the members present, so the defaults apply',
      'obligation 4: update writes only the members present, and null clears a member',
    ],
    refused: '23502',
    adapter: wrapping((adapter) => ({
      ...adapter,
      create: async (tx, resource, input) =>
        adapter.create(tx, resource, withNulls(input)),
      update: async (tx, resource, id, input) =>
        adapter.update(tx, resource, id, withNulls(input)),
    })),
  },
  {
    name: 'writes the scope column from another scope',
    fails: [
      "obligation 4: create writes the scope column from the transaction's scope",
    ],
    adapter: wrapping((adapter) => ({
      ...adapter,
      create: async (tx, resource, input) =>
        adapter.create(
          {
            ...tx,
            scopes: tx.scopes.map((scope) => ({ ...scope, value: '1' })),
          },
          resource,
          input,
        ),
    })),
  },
  {
    name: 'ignores relationships on update',
    fails: [
      "obligation 4: writes a relationship by its target's id, and null clears it",
    ],
    adapter: wrapping((adapter) => ({
      ...adapter,
      update: async (tx, resource, id, input) =>
        adapter.update(tx, resource, id, { ...input, relationships: {} }),
    })),
  },
  {
    name: 'finds no row for an update without members',
    fails: [
      'obligation 4: an update without members changes nothing and returns the row',
    ],
    adapter: wrapping((adapter) => ({
      ...adapter,
      update: async (tx, resource, id, input) =>
        Object.keys(input.attributes).length +
          Object.keys(input.relationships).length ===
        0
          ? undefined
          : adapter.update(tx, resource, id, input),
    })),
  },
  ...LIST_FAULTS,
  {
    name: 'counts without the quota lock',
    fails: [
      'obligation 8: count and the following insert are atomic per quota and scope value',
    ],
    concurrent: true,
    adapter: rewriting((sql) =>
      sql.includes('pg_advisory_xact_lock') ? undefined : sql,
    ),
  },
  {
    name: 'locks no row',
    fails: [O10_UPDATE, O10_REMOVE],
    concurrent: true,
    adapter: rewriting((sql) => sql.replace(ROW_LOCK, '')),
  },
  {
    name: 'locks a row before a remove as before an update',
    fails: [O10_REMOVE],
    concurrent: true,
    adapter: rewriting((sql) => sql.replace(ROW_LOCK, ' for no key update')),
  },
  {
    name: 'resolves no partition',
    fails: [O11_ROOT],
    adapter: rewriting((sql) =>
      sql === PARTITION_ROOT_SQL ? `${sql} limit 0` : sql,
    ),
  },
  {
    name: "keeps the name of the partition's own index",
    fails: [O11_ROOT],
    adapter: wrapping((adapter) => ({
      ...adapter,
      partitionRoot: async (names) => {
        const root = await adapter.partitionRoot(names);
        return root === undefined
          ? undefined
          : { ...root, constraint: names.constraint };
      },
    })),
  },
  {
    name: 'answers a missing constraint as null',
    fails: [O11_ROOT],
    adapter: wrapping((adapter) => ({
      ...adapter,
      partitionRoot: async (names) => {
        const root = await adapter.partitionRoot(names);
        if (root === undefined || root.constraint !== undefined) {
          return root;
        }
        // The defect passes on the SQL NULL of the row, which the type rules out.
        const answer = { ...root };
        Reflect.set(answer, 'constraint', null);
        return answer;
      },
    })),
  },
  {
    name: 'answers for a table that is not a partition',
    fails: [O11_NONE],
    adapter: wrapping((adapter) => ({
      ...adapter,
      partitionRoot: async (names) =>
        (await adapter.partitionRoot(names)) ?? names,
    })),
  },
  {
    name: 'writes the outbox outside the transaction',
    fails: ['obligation 9: drops the events of a transaction that rolls back'],
    adapter: wrapping(outboxAfterRun),
  },
  {
    name: 'binds its cursors to no context',
    fails: [
      'obligation 12: a cursor issued in one scope is refused in another',
    ],
    adapter: (database) => reference(database.transact, CONTEXTLESS),
  },
  {
    name: 'never writes the outbox',
    fails: [
      'obligation 9: records events with the transaction, in the order recorded',
    ],
    adapter: rewriting((sql) =>
      sql.startsWith(`insert into "${OUTBOX}"`) ? undefined : sql,
    ),
  },
];
