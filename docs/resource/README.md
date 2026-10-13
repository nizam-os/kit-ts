# resource: one declaration per table, the whole API derived

Declare a resource once, keyed by your PostgreSQL names, and get its public names, Zod schemas, form
metadata, error codes, localized messages, JSON:API definition, keyset pagination, and OpenAPI
document, all typed by the catalog `@nizam-os/pg-catalog` extracts from your migrations:

| Package                                                                    | What it is                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@nizam-os/resource-core`](../../packages/resource-core)                   | Declarations and everything derived from them, the typed messages and their localization, the `server` contracts (policies, scopes, quotas, rules, effects, the storage adapter contract), and OpenAPI. Runs in browsers and servers.                                                                                                                                                                        |
| [`@nizam-os/kysely-resource`](../../packages/kysely-resource)               | The runtime over Kysely on PostgreSQL: the storage adapter, which runs each operation in one transaction scoped to the actor's tenant, for row security policies and its own scope predicate alike.                                                                                                                                                                                                          |
| [`@nizam-os/hono-resource`](../../packages/hono-resource)                   | The routes on Hono: every operation a runtime runs, each relationship's links, the Atomic Operations endpoint over `runtime.transaction`, and the OpenAPI document, served where the declarations' links point, with the request's actor resolved once, any other method answered 405 with `Allow`, and `resourceTypeOf` for localized errors.                                                               |
| [`@nizam-os/resource-ui`](../../packages/resource-ui)                       | A model of each declared resource's forms and lists, for any framework: labels and options from the application's messages, validation in the server's words, the write a form sends, refusals on their fields, and list state as TanStack Table v9 holds it. Imports no framework and nothing of TanStack.                                                                                                  |
| [`@nizam-os/tanstack-form-resource`](../../packages/tanstack-form-resource) | [TanStack Form](https://tanstack.com/form/v1) options over those form models, which the form of every adapter takes, React's, Vue's, Solid's, Svelte's, Angular's, and Lit's, and a refused write's texts on their fields, through `@tanstack/form-core`. The client's calls go to TanStack Query through [`@nizam-os/tanstack-query-jsonapi`](../../packages/tanstack-query-jsonapi), of the jsonapi family. |

Status: the 0.x line is in development and unreleased. Every choice is written down in
[`SPEC.md`](SPEC.md).

## Install

```bash
pnpm add @nizam-os/resource-core zod
pnpm add -D @nizam-os/pg-catalog @electric-sql/pglite
```

`zod` 4.5 or later is a peer dependency: from 4.5 on, `.min()` and `.max()` count code points, as
PostgreSQL does.

## Quick start

```ts
// pg-catalog.config.ts: expose the tables your API serves
import { defineExtraction } from '@nizam-os/pg-catalog';

export default defineExtraction({
  migrations: 'db/migrations',
  out: {
    catalog: 'src/generated/catalog.ts',
    public: { file: 'src/generated/public-catalog.ts', tables: ['contacts', 'organizations'] },
    types: 'src/generated/db.ts',
  },
});
```

```ts
// src/resources/declare.ts
import { createDeclareResource } from '@nizam-os/resource-core';

import { publicCatalog } from '../generated/public-catalog';

export const declareResource = createDeclareResource({
  catalog: publicCatalog,
  scopes: { organization: { column: 'organization_id' } },
  links: { base: '/api/v1' },
});

// src/resources/contacts.ts
import { declareResource } from './declare';

export const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'organization',
  fields: {
    name: { access: 'readWrite', filter: ['containsi'], sort: true },
    email: { access: 'readWrite', filter: ['eq'] },
    status: { access: 'readWrite', filter: ['eq', 'in'] },
    created_at: { access: 'read', sort: true },
  },
  search: { column: 'search' },
  sort: { default: ['-created_at'] },
  rules: { contacts_email_unique: { code: 'CONTACT_EMAIL_TAKEN' } },
});
```

```ts
import type { Infer } from '@nizam-os/resource-core';

Contacts.schema.create.parse({ name: 'Ada' }); // status and the rest default in the database
Contacts.schema.update.parse({ status: 'archived' }); // the name stays as it is
Contacts.fields.name.limits; // { minLength: 1, maxLength: 200, ... }
Contacts.errors.CONTACT_EMAIL_TAKEN; // { status: 409, title: 'Conflict', fields: ['email'] }
type NewContact = Infer<typeof Contacts>['create']; // { name: string; status?: 'active' | 'archived'; ... }
```

## What you get

- **Names you do not choose by hand.** The type is the table name, fields are camelCase columns,
  relationships are foreign keys without `_id`, error codes are constraint names in upper case. `as`
  and `code` are the only overrides, and the committed surface snapshot shows every change in
  review.
- **Schemas the database agrees with.** Create requires exactly what PostgreSQL requires, update
  changes only what it is sent, translated CHECKs become checks, and values PostgreSQL would reject
  or silently alter (a rounded decimal, a truncated string, a lone surrogate) are rejected with a
  pointer to the member.
- **Form metadata the schemas agree with.** `Contacts.fields` states each member's wire type,
  format, requiredness, limits, options, and default, typed by the catalog and read from the same
  specs as the schemas, so a form never copies a limit by hand. Probes built from it alone agree
  with PostgreSQL on every column type and on two real schemas.
- **Errors clients can act on.** Schema issues are `VALIDATION_FAILED` items named by JSON Schema
  keywords (`maxLength`, `enum`, ...) with their limit; database rejections carry the constraint's
  code with the right status: 409 for a duplicate, 404 for a missing related resource, 422 for a
  CHECK.
- **Messages typed over all of it.** `defineMessages` maps your i18n library's message functions
  (Paraglide's `m.*`) to every code, issue kind, constraint kind, field, and option your resources
  can produce; a missing one, or a translation using a variable its kind does not receive, fails
  `tsc`. `localizeErrors` turns the server's errors into the request's locale.
- **An API served from the declarations.** `createResourceRuntime` runs each operation in one
  transaction scoped to the actor, or several together with `runtime.transaction`, and
  `jsonApiRoutes({ runtime, actor })` serves the operations it runs at the paths the declarations'
  links name, so the links, the routes, and the OpenAPI paths never disagree.
- **Definitions for the rest of the stack.** `Contacts.resource` is a `@nizam-os/jsonapi-core`
  definition and `Contacts.keyset` a `@nizam-os/keyset-core` one, and `openapi([...])` documents
  every operation, parameter, schema, and error code, with every example validated.

## Best practices

- **Expose deliberately.** List a table in `public.tables` only when it is an API resource, and
  declare only the columns clients need; an undeclared column is invisible to the API.
- **Name your constraints.** `constraint contacts_email_unique unique (organization_id, email)`
  becomes `CONTACTS_EMAIL_UNIQUE`; an auto-generated name becomes a code you will want to rename
  with `code`. A unique index derives its code from its name too, partial or not, so name it like a
  constraint. Only an index over an expression has none, and its violation falls back to the generic
  409: prefer a `citext` column with a plain UNIQUE to a unique index on `lower(email)`, or map the
  index by name through `postgresMapper`'s `constraints`.
- **Drive forms from `fields`, check with the schemas.** Mark required members by `required`, offer
  `options` as choices, and compare numeric bounds as decimal strings. Validators and CHECKs over
  several columns are not in the metadata, so validate the whole write with `write.create` or
  `write.update` before sending it.
- **Let the database own defaults.** Never add a default to a schema or a form value; show
  `field.default.literal` as a placeholder and omit untouched fields, so the migration stays the
  only place a default lives.
- **Prefer CHECKs the recognizer translates.** Length bounds, numeric ranges, `IN` lists,
  `IS NOT NULL`, and simple regular expressions are enforced exactly in the client with no code.
  When a CHECK cannot be translated, write a validator with fixtures on both sides of every
  boundary, including empty and astral strings, and let `rules --check` prove it against the
  database.
- **Enforce in the database what clients must obey.** A NOT ENFORCED CHECK or foreign key
  (PostgreSQL 18) documents data the database never checks, so the API skips it: no schema check, no
  validator, no code. Enforce it to hold clients to it: `ALTER CONSTRAINT ... ENFORCED` for a
  foreign key, drop and add again for a CHECK; then extract the catalog again.
- **Pick the narrowest access.** `immutable` for values fixed at creation, `read` for computed or
  server-set columns, `write` only for values clients send but never read back.
- **Keep foreign keys as relationships**, named `<thing>_id`, so the relationship name derives
  without `as`.
- **Scope tenant data twice.** Declare `scope` and add a row security policy that reads the scope's
  session parameter; the runtime sets the parameter and adds the predicate, so a policy mistake
  still cannot leak rows.
- **Review the surface with the migration.** Commit the surface snapshot `pg-catalog surface`
  writes, in the pull request that changes it; a column rename shows up as a breaking change, and
  `as` with the old name keeps the contract.
- **Localize with your i18n library, by kind first.** One message per issue kind and per constraint
  kind covers every resource; override a single code only where the generic sentence is not good
  enough. Reference Paraglide's messages directly, never as `m[key]`, write plurals as variants, and
  run `inlang check` in CI. Run `paraglideMiddleware` around the error handler, set
  `Content-Language` from `getLocale()`, and vary on what the locale strategy read.
- **Keep declarations browser-safe.** Declarations, codecs, validators, and messages go in modules a
  browser can import; policies, scopes, and quotas go in modules that import
  `@nizam-os/resource-core/server`.
- **Run the gates in CI.** `pg-catalog extract --check` keeps the catalog current, `rules --check`
  runs the oracle, and `surface --check` blocks breaking changes the snapshot does not record.

## Documentation

- [`DESIGN.md`](DESIGN.md): what the family is for, the workflow by example, and the architecture
- [`SPEC.md`](SPEC.md): the normative contract
- [`adr/`](adr): the decisions and their reasons
- [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`AGENTS.md`](AGENTS.md): working on the family

## Why

Every API over a database restates the database, and every restatement drifts. Deriving the API from
the catalog removes the copies; keeping the database as the judge of codecs and validators removes
the guesswork that is left.

## License

MIT
