/**
 * The connected checks of boot (SPEC 18.3), at `createResourceRuntime`
 * only, through the storage's connection without its plugins: a role that
 * is a superuser or has `BYPASSRLS` bypasses row security on every table,
 * and a role that owns a table bypasses it there unless the table forces
 * it, which `row_security_active` reports for the role. A role that
 * bypasses row security everywhere is the one problem: every table would
 * report it again.
 * @ref https://www.postgresql.org/docs/18/view-pg-roles.html
 * @ref https://www.postgresql.org/docs/18/functions-info.html (`row_security_active`)
 * @ref https://www.postgresql.org/docs/18/ddl-rowsecurity.html
 * @packageDocumentation
 */
import type { Kysely } from 'kysely';

import type { AnyDatabase } from '@nizam-os/kysely-keyset';

import type { BootContext } from './options';

import { sql } from 'kysely';

import { ownValue } from '../internal/object';

interface RoleRow {
  readonly role: string;
  readonly superuser: string;
  readonly bypass: string;
}

/** The role's problems, and its name for the messages of the tables. */
async function roleProblems(db: Kysely<AnyDatabase>): Promise<{
  readonly role: string;
  readonly problems: ReadonlyArray<string>;
}> {
  const { rows } =
    await sql<RoleRow>`select current_user::text as "role", rolsuper::text as "superuser", rolbypassrls::text as "bypass" from pg_roles where rolname = current_user`.execute(
      db,
    );
  const [row] = rows;
  if (row === undefined) {
    return { role: 'current_user', problems: [] };
  }
  return {
    role: row.role,
    problems: [
      ...(row.superuser === 'true'
        ? [
            `role ${row.role}: a superuser bypasses row security on every table; connect as a role that is not one`,
          ]
        : []),
      ...(row.superuser !== 'true' && row.bypass === 'true'
        ? [
            `role ${row.role}: BYPASSRLS bypasses row security on every table; connect as a role without it`,
          ]
        : []),
    ],
  };
}

/** The problem of a scoped resource's table whose row security does not apply to `role`. */
async function tableProblem(
  db: Kysely<AnyDatabase>,
  role: string,
  type: string,
  table: {
    readonly reference: string;
    readonly schema: string;
    readonly name: string;
  },
): Promise<string | undefined> {
  const { rows } = await sql<{
    readonly active: string;
  }>`select row_security_active(c.oid)::text as "active" from pg_class as c join pg_namespace as n on n.oid = c.relnamespace where n.nspname = ${table.schema}::text and c.relname = ${table.name}::text`.execute(
    db,
  );
  const [row] = rows;
  if (row === undefined) {
    return `${type}: the database has no table ${table.reference}`;
  }
  return row.active === 'true'
    ? undefined
    : `${type}: row security does not apply to role ${role} on ${table.reference}, most often because the role owns it and it does not force row security; force row security on the table, or connect as a role that does not own it`;
}

/** The role's problems, or else each scoped table's whose row security the catalog says is enabled. */
export async function connectedProblems(
  boot: BootContext,
): Promise<ReadonlyArray<string>> {
  const { db } = boot.config;
  const { role, problems } = await roleProblems(db);
  if (problems.length > 0) {
    return problems;
  }
  const tables: Array<string> = [];
  for (const [, { resource }] of boot.resources) {
    const table = ownValue(boot.catalog.tables, resource.table);
    if (
      resource.declaration.scope === undefined ||
      table?.rowSecurity.enabled !== true
    ) {
      continue;
    }
    const problem = await tableProblem(db, role, resource.names.type, {
      reference: resource.table,
      schema: table.schema,
      name: table.name,
    });
    if (problem !== undefined) {
      tables.push(problem);
    }
  }
  return tables;
}
