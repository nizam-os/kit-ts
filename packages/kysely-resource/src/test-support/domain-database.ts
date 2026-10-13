import type { Kysely, LogEvent } from 'kysely';

/**
 * The database of the lifecycle tests: the storage contract's schema with
 * an outbox, the storage over it, and what a test reads back from it, the
 * events the outbox holds and the tasks a workspace holds.
 */
import type { DomainEvent } from '@nizam-os/resource-core/server';

import type { KyselyStorage } from '../storage/types';
import type { TestDatabase } from './database';

import { sql } from 'kysely';

import { scopeValues } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { createKyselyStorage } from '../storage/create-storage';
import { contractDatabase, storageOptions } from './database';
import { BEHAVIORS, MEMBER_ID } from './domain';

/** The outbox the storage records events in (resource SPEC 18.6). */
export const OUTBOX_TABLE = `create table contract_outbox (
  position int8 generated always as identity primary key,
  name text not null,
  version int4 not null,
  payload jsonb not null
)`;

/** The contract's schema with the outbox; `log` sees every query Kysely runs. */
export function domainDatabase(log?: (event: LogEvent) => void): TestDatabase {
  const database = contractDatabase([OUTBOX_TABLE], log);
  return {
    ...database,
    reset: async () => {
      await database.exec(
        `${contractFixture.seed}truncate table contract_outbox restart identity;`,
      );
    },
  };
}

/** The storage over `db`, as an application creates it. */
export function domainStorage(db: Kysely<unknown>): KyselyStorage {
  return createKyselyStorage(storageOptions(db));
}

/** The events the outbox holds, oldest first. */
export async function outboxEvents(
  db: Kysely<unknown>,
): Promise<ReadonlyArray<DomainEvent>> {
  const { rows } = await sql<{
    name: string;
    version: number;
    payload: string;
  }>`select name, version, payload::text as payload from contract_outbox order by position`.execute(
    db,
  );
  return rows.map((row) => {
    const payload: unknown = JSON.parse(row.payload);
    return { name: row.name, version: row.version, payload };
  });
}

/** The titles of the tasks of `workspace`, in title order. */
export async function taskTitles(
  db: Kysely<unknown>,
  workspace: string,
): Promise<ReadonlyArray<string>> {
  const { rows } = await sql<{
    title: string;
  }>`select title from tasks where workspace_id = ${workspace}::text::int8 order by title`.execute(
    db,
  );
  return rows.map((row) => row.title);
}

/**
 * Creates a task through the storage, past the domain's policy and rules,
 * in `workspace`, linked to `parent` when given; resolves to its id.
 */
export async function storedTask(
  storage: KyselyStorage,
  title: string,
  options: { readonly workspace?: string; readonly parent?: string } = {},
): Promise<string> {
  const { workspace = '1', parent } = options;
  const row = await storage.transaction(
    scopeValues(contractFixture.scopes, { workspace }),
    async (tx) =>
      storage.create(tx, BEHAVIORS.tasks.resource, {
        attributes: { title, points: '3' },
        relationships: parent === undefined ? {} : { parent },
        values: { created_by: MEMBER_ID },
      }),
  );
  return row.id;
}
