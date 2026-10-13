/**
 * Boot on the application's database (resource SPEC 18.3): the runtime
 * `createResourceRuntime` boots over the application's role, on PGlite and
 * on the server `RESOURCE_PG_URL` names, warning of exactly the sorts no
 * index serves, and refuses to boot as a role row security does not bind:
 * the superuser, a role with BYPASSRLS, and the owner of `calls`, which
 * does not force row security. `contacts` does, so even its owner would be
 * bound. What the catalog says is checked before any query: a scoped
 * table without row security, and a policy that never reads the scope's
 * parameter, in catalogs extracted after a migration that makes them, are
 * problems `checkResourceRuntime` reports in CI and `createResourceRuntime`
 * refuses alike.
 * @ref https://www.postgresql.org/docs/18/ddl-rowsecurity.html ("Superusers and roles with the BYPASSRLS attribute always bypass the row security system", "Table owners normally bypass row security as well")
 */
import type { Kysely } from 'kysely';

import type { BootRole, RuntimeDatabase } from './runtime/database.ts';
import type { Composition } from './runtime/fixture.ts';

import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  BootError,
  checkResourceRuntime,
  createResourceRuntime,
} from '@nizam-os/kysely-resource';

import { catalogAfter } from './runtime/catalog-variant.ts';
import { runtimeDatabases } from './runtime/database.ts';
import { runtimeOptions } from './runtime/fixture.ts';

/** Each sortable field no index without a predicate serves, scope first. */
const SORT_WARNINGS = [
  'contacts: no btree index on contacts begins with (organization_id, name), so a page sorted by name sorts every row of the scope',
  'contacts: no btree index on contacts begins with (organization_id, priority), so a page sorted by priority sorts every row of the scope',
  'contacts: no btree index on contacts begins with (organization_id, created_at), so a page sorted by createdAt sorts every row of the scope',
  'organizations: no btree index on organizations begins with (name), so a page sorted by name sorts every row',
  'organizations: no btree index on organizations begins with (seats), so a page sorted by seats sorts every row',
  'organizations: no btree index on organizations begins with (created_at), so a page sorted by createdAt sorts every row',
];

/** The one problem of booting as each role, by the role's name. */
const ROLE_PROBLEMS: ReadonlyArray<
  readonly [BootRole, (role: string) => string]
> = [
  [
    'superuser',
    (role) =>
      `role ${role}: a superuser bypasses row security on every table; connect as a role that is not one`,
  ],
  [
    'bypass',
    (role) =>
      `role ${role}: BYPASSRLS bypasses row security on every table; connect as a role without it`,
  ],
  [
    'owner',
    (role) =>
      `calls: row security does not apply to role ${role} on calls, most often because the role owns it and it does not force row security; force row security on the table, or connect as a role that does not own it`,
  ],
];

const NOT_READING = (command: string, clause: string) =>
  `contacts: the ${command} policies on contacts do not read app.organization_id in ${clause}: contacts_tenant_isolation`;

/** A migration after the application's, and the problems of the catalog extracted after it. */
const CATALOG_PROBLEMS: ReadonlyArray<
  readonly [string, string, ReadonlyArray<string>]
> = [
  [
    'a scoped table without row security',
    'alter table calls disable row level security',
    ['calls: row security is not enabled on calls'],
  ],
  [
    "a policy that never reads the scope's parameter",
    'alter policy contacts_tenant_isolation on contacts using (organization_id > 0) with check (organization_id > 0)',
    [
      NOT_READING('SELECT', 'USING'),
      NOT_READING('INSERT', 'WITH CHECK'),
      NOT_READING('UPDATE', 'USING'),
      NOT_READING('UPDATE', 'WITH CHECK'),
      NOT_READING('DELETE', 'USING'),
    ],
  ],
];

/** What `createResourceRuntime` rejected with; fails the test when it booted. */
async function bootError(
  db: Kysely<unknown>,
  composition: Composition = {},
): Promise<unknown> {
  return createResourceRuntime(runtimeOptions(db, composition)).then(
    () => {
      throw new Error('the runtime booted');
    },
    (error: unknown) => error,
  );
}

describe.each(runtimeDatabases())(
  "on %s, boot checks the application's composition",
  (_name, open) => {
    let database: RuntimeDatabase;

    beforeAll(async () => {
      database = await open();
    });
    afterAll(async () => {
      await database.close();
    });

    it("boots as the application's role, warning of exactly the sorts no index serves", async () => {
      const options = runtimeOptions(database.db);
      expect(checkResourceRuntime(options)).toEqual({
        problems: [],
        warnings: SORT_WARNINGS,
      });
      const runtime = await createResourceRuntime(options);
      expect(runtime.warnings).toEqual(SORT_WARNINGS);
      expect(Object.isFrozen(runtime)).toBe(true);
    });

    it.each(ROLE_PROBLEMS)(
      'refuses to boot as the %s role, with the one problem it has',
      async (role, problem) => {
        const { error, user } = await database.as(role, async (db) => ({
          error: await bootError(db),
          user: (
            await sql<{
              user: string;
            }>`select current_user as "user"`.execute(db)
          ).rows[0]?.user,
        }));
        const problems = [problem(String(user))];
        expect(error).toBeInstanceOf(BootError);
        expect(error).toMatchObject({ problems, message: problems[0] });
      },
    );

    it.each(CATALOG_PROBLEMS)(
      'refuses %s before any query, in CI and at boot alike',
      async (_case, migration, problems) => {
        const catalog = await catalogAfter(migration);
        const options = runtimeOptions(database.db, { catalog });
        expect(checkResourceRuntime(options).problems).toEqual(problems);
        const error = await bootError(database.db, { catalog });
        expect(error).toBeInstanceOf(BootError);
        expect(error).toMatchObject({
          problems,
          message: problems.join('\n'),
        });
      },
    );
  },
);
