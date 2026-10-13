/**
 * The full catalog boot's tests read (resource SPEC 18.3), extracted by
 * pg-catalog from the storage contract's schema on PGlite, as an
 * application's CI extracts its own: the outbox, row security on `tasks`
 * whose policy reads the workspace's parameter, and copies of `tasks`,
 * each holding the row security or the indexes a case reads. A case puts
 * a copy's row security or indexes on `tasks`, so every policy and index
 * it reads is as PostgreSQL printed it.
 */
import type { Catalog, CatalogTable } from '@nizam-os/catalog-core';

import { extractCatalog } from '@nizam-os/pg-catalog';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { OUTBOX_TABLE } from './domain-database';

/** The workspace parameter as a policy compares it, `NULL` when unset. */
const WORKSPACE =
  "nullif(current_setting('contract.workspace_id', true), '')::int8";

/** Row security on `tasks`, as the domain's tests leave it. */
export const TASKS_ROW_SECURITY: string = `alter table tasks enable row level security;
create policy tasks_workspace on tasks using (workspace_id = ${WORKSPACE});`;

/** A copy of `tasks` named `name`, its row security enabled, with `policies`. */
function secured(name: string, policies: string): string {
  return `create table ${name} (like tasks including all);
alter table ${name} enable row level security;
${policies}`;
}

const COPIES = `create table rls_none (like tasks including all);
${secured('rls_empty', '')}
${secured('rls_open', 'create policy rls_open_all on rls_open using (true) with check (true);')}
${secured(
  'rls_restricted',
  `create policy rls_restricted_all on rls_restricted using (true) with check (true);
create policy rls_restricted_workspace on rls_restricted as restrictive using (workspace_id = ${WORKSPACE});`,
)}
${secured(
  'rls_commands',
  `create policy rls_commands_select on rls_commands for select using (workspace_id = ${WORKSPACE});
create policy rls_commands_insert on rls_commands for insert with check (true);
create policy rls_commands_update on rls_commands for update using (workspace_id = ${WORKSPACE});
create policy rls_commands_delete on rls_commands for delete using (true);`,
)}
${secured(
  'rls_spelled',
  "create policy rls_spelled_workspace on rls_spelled using (workspace_id = nullif(current_setting('CONTRACT.Workspace_ID', true), '')::int8);",
)}
${secured(
  'rls_quoted',
  "create policy rls_quoted_workspace on rls_quoted using (workspace_id = nullif(current_setting('contract.workspace_id''', true), '')::int8);",
)}
${secured(
  'rls_other',
  "create policy rls_other_workspace on rls_other using (workspace_id = nullif(current_setting('contract.workspace', true), '')::int8);",
)}
${secured(
  'rls_mixed',
  `create policy rls_mixed_workspace on rls_mixed using (workspace_id = ${WORKSPACE});
create policy rls_mixed_admin on rls_mixed using (current_user = 'admin');`,
)}
${secured(
  'rls_unlocked',
  `create policy rls_unlocked_select on rls_unlocked for select using (workspace_id = ${WORKSPACE});
create policy rls_unlocked_delete on rls_unlocked for delete using (workspace_id = ${WORKSPACE});
create policy rls_unlocked_update on rls_unlocked for update using (true) with check (workspace_id = ${WORKSPACE});`,
)}
create table idx_none (like tasks including defaults);
create table idx_partial (like tasks including defaults);
create index idx_partial_title on idx_partial (workspace_id, title) where not done;
create table idx_descending (like tasks including defaults);
create index idx_descending_title on idx_descending (workspace_id, title desc);
create table idx_brin (like tasks including defaults);
create index idx_brin_title on idx_brin using brin (workspace_id, title);
create table idx_scoped (like tasks including defaults);
create unique index idx_scoped_parent on idx_scoped (parent_id, title);
create unique index idx_scoped_parent_nulls on idx_scoped (parent_id, title) nulls not distinct;
create unique index idx_scoped_global on idx_scoped (title) where workspace_id is null;
create unique index idx_scoped_open on idx_scoped (title) where not done;
create table idx_unique (like tasks including defaults);
create unique index idx_unique_title on idx_unique (title);
create unique index idx_unique_lower on idx_unique (lower(title));
create unique index idx_unique_scoped on idx_unique (workspace_id, title);
create unique index idx_unique_creator on idx_unique (created_by);`;

let extracted: Promise<Catalog> | undefined;

/** The catalog, extracted once. */
export async function bootCatalog(): Promise<Catalog> {
  extracted ??= extractCatalog({
    migrations: () => [
      ...contractFixture.migrations.map((sql, index) => ({
        name: `V${String(index + 1)}__contract.sql`,
        sql,
      })),
      { name: 'V90__outbox.sql', sql: OUTBOX_TABLE },
      { name: 'V91__row_security.sql', sql: TASKS_ROW_SECURITY },
      { name: 'V92__copies.sql', sql: COPIES },
    ],
    schemas: ['public', 'contract_archive'],
  });
  return extracted;
}

/** `catalog` with `tasks` holding the `part` of the table `copy`. */
export function tasksLike(
  catalog: Catalog,
  copy: string,
  part: keyof Pick<CatalogTable, 'rowSecurity' | 'indexes'>,
): Catalog {
  const { tasks } = catalog.tables;
  const source = catalog.tables[copy];
  if (tasks === undefined || source === undefined) {
    throw new Error(`the boot catalog has no table ${copy}`);
  }
  return {
    ...catalog,
    tables: { ...catalog.tables, tasks: { ...tasks, [part]: source[part] } },
  };
}

/** `catalog` with the table `name` changed by `change`. */
export function withTable(
  catalog: Catalog,
  name: string,
  change: (table: CatalogTable) => CatalogTable,
): Catalog {
  const table = catalog.tables[name];
  if (table === undefined) {
    throw new Error(`the boot catalog has no table ${name}`);
  }
  return { ...catalog, tables: { ...catalog.tables, [name]: change(table) } };
}

/** `catalog` without the table `name`. */
export function withoutTable(catalog: Catalog, name: string): Catalog {
  const { [name]: _removed, ...tables } = catalog.tables;
  return { ...catalog, tables };
}
