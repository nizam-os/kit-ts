# resource: design

- Status: accepted for the 0.x line of `@nizam-os/resource-core`

Architecture decisions referenced as ADR-NNNN live in `docs/resource/adr/`. The normative contract
is [`SPEC.md`](SPEC.md); this document explains what the packages are for and why they are shaped
the way they are.

## 1. Purpose

An API over PostgreSQL usually restates the database four or five times: Zod schemas repeat column
types and lengths, OpenAPI repeats them again, forms hard-code the enum labels, an error mapper
translates constraint names by hand, and the routes, filters, and sort keys pick their own names.
Every copy drifts on its own schedule, and the drift reaches users as a confusing 422, a form that
accepts what the database rejects, or a 500.

`@nizam-os/resource-core` replaces the copies with one declaration per resource, keyed by database
names, from which the public API follows:

1. **Extract.** `@nizam-os/pg-catalog` writes the public catalog: every exposed table with its column
   types, nullability, defaults, constraints, and the CHECK rules it could translate exactly
   (catalog ADR 0005, 0006).
2. **Declare.** A declaration states only what the catalog cannot know: the operations, which
   columns are exposed and how, filters, sorting, search, codecs for types the API cannot represent
   by itself, and validators for CHECKs the recognizer could not translate (ADR-0002).
3. **Derive.** Public names (ADR-0003), Zod schemas for reads, creates, and updates (ADR-0004,
   0005), field metadata for forms, the error catalog (ADR-0007), the `@nizam-os/jsonapi-core`
   resource definition, the `@nizam-os/keyset-core` definition, and the OpenAPI document all come
   from the declaration and the catalog. Nothing is restated.
4. **Prove.** Codecs and validators carry fixtures that the oracle runs through Zod and through
   PostgreSQL (ADR-0006); the default wire forms and rule translations are proven the same way; the
   derived surface is snapshotted and diffed in CI.
5. **Serve.** The `server` subpath adds policies, scopes, quotas, rules, and effects;
   `@nizam-os/kysely-resource` runs the operations and `@nizam-os/hono-resource` serves them, while
   `@nizam-os/jsonapi-client`, `@nizam-os/resource-ui`, and `@nizam-os/tanstack-form-resource` consume
   the same declarations in clients (ADR-0008).

### Who it is for

Teams that write PostgreSQL migrations by hand, serve JSON:API (or want a typed CRUD API without
writing one handler per route), and use TypeScript from the database to the form. A declaration is
plain data plus Zod schemas: anything can read it.

### Non-goals

- Generating migrations from declarations. The migrations are the source of truth; declarations
  follow them.
- Databases other than PostgreSQL, and API styles other than JSON:API.
- Business logic. Validators restate CHECKs with fixtures; rules that need outside state are server
  code (`reject`), and the library only gives them a typed place to live.
- Hiding SQL. Storage is Kysely through `@nizam-os/kysely-resource`; a custom query is still a Kysely
  query.
- UI components. `@nizam-os/resource-ui` provides a model and `@nizam-os/tanstack-form-resource` its
  TanStack Form binding, not widgets: an application keeps its own field components, table markup,
  and router (ADR-0015, ADR-0018).

## 2. Principles

1. **The database decides, the declaration adds intent.** Types, nullability, requiredness, limits,
   enum labels, and the key are read from the public catalog; a declaration never restates them
   (ADR-0002).
2. **Database names in, derived names out.** Every name in a declaration is a database name, and
   every public name is derived by one rule, with `as` and `code` as the only overrides (ADR-0003).
3. **Never invent a value.** Omitted means untouched, `null` means null, and the database supplies
   defaults; no schema carries a default (ADR-0004).
4. **Exact or rejected.** The wire forms reject what PostgreSQL would reject or silently alter, so a
   stored value is the value sent (ADR-0005). A CHECK the recognizer could not translate needs a
   validator, and a validator needs fixtures the database judges (ADR-0006).
5. **Every failure has a code and a place.** Schema issues are named by JSON Schema keywords,
   database rejections by their constraint, and both point at the member; localization replaces the
   words, never the codes (ADR-0007).
6. **Compile errors first.** What TypeScript can check fails `tsc`; what it cannot fails at startup
   with a `TypeError` naming the path; nothing waits for a request.
7. **Browsers get the public part.** The root entry runs anywhere; policies, scopes, and the storage
   contract live behind `server` (ADR-0008).

## 3. The workflow by example

### 3.1 The catalog

The contacts application of the catalog's end-to-end fixture has this table, among others:

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references organizations (id) on delete cascade,
  kind contact_kind not null default 'person',            -- enum ('person', 'company')
  name text not null check (char_length(name) between 1 and 200),
  nickname text check (nickname <> ''),
  email email,                                             -- domain over citext with a pattern
  website text check (website is null or website ~ '^https://'),
  status text not null default 'active' check (status in ('active', 'archived')),
  priority smallint check (priority between 1 and 5),
  discount percentage default 0,                           -- domain numeric(5, 2), 0 to 100
  tags text[] not null default '{}',
  search tsvector generated always as (to_tsvector('simple', ...)) stored,
  created_at timestamptz not null default now(),
  constraint contacts_email_unique unique (organization_id, email)
);
```

`pg-catalog extract` writes it into the public catalog with every fact a declaration needs: `name`
has the rule `{ kind: 'length', min: 1, max: 200 }`, `status` the rule
`{ kind: 'enum', values: ['active', 'archived'] }`, `website` a pattern, `search` the configuration
`simple`, and so on.

### 3.2 The definer

```ts
// src/resources/declare.ts
import { createDeclareResource } from '@nizam-os/resource-core';

import { publicCatalog } from '../generated/public-catalog';

export const SCOPES = { organization: { column: 'organization_id' } } as const;

export const declareResource = createDeclareResource({
  catalog: publicCatalog,
  scopes: SCOPES,
  links: { base: '/api/v1' },
  page: { default: 20, max: 100 },
});
```

### 3.3 A declaration

```ts
// src/resources/contacts.ts
export const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'organization',
  fields: {
    kind: { access: 'immutable', filter: ['eq', 'in'] },
    name: { access: 'readWrite', filter: ['eq', 'containsi'], sort: true },
    nickname: { access: 'readWrite' },
    email: { access: 'readWrite', filter: ['eq'] },
    website: { access: 'readWrite' },
    status: { access: 'readWrite', filter: ['eq', 'in'] },
    priority: { access: 'readWrite', filter: ['gte', 'lte'], sort: true },
    discount: { access: 'readWrite' },
    tags: { access: 'readWrite', filter: ['contains', 'overlaps'] },
    created_at: { access: 'read', filter: ['gte', 'lte'], sort: true },
  },
  relationships: { organization_id: { target: () => Organizations, access: 'read' } },
  search: { column: 'search' },
  sort: { default: ['-created_at'] },
  rules: { contacts_email_unique: { code: 'CONTACT_EMAIL_TAKEN' } },
});
```

A typo in a column, `filter: ['gt']` on `tags`, the `tsvector` column `search` under `fields`, or
the foreign key `organization_id` under `fields` fails `tsc` at the line that says it.

### 3.4 What follows from it

- **Names.** The type is `contacts`; the fields are `kind`, `name`, ..., `createdAt`; the
  relationship is `organization`; the id is the `uuid` primary key; the codes are
  `CONTACT_EMAIL_TAKEN`, `CONTACTS_NAME_CHECK`, `CONTACTS_STATUS_CHECK`, and so on.
- **Schemas.** `Contacts.schema.create` requires only `name`: every other writable column is
  nullable or has a default, `organization_id` comes from the scope, and `id` from its default.
  `Contacts.schema.update` makes everything writable on update optional and drops `kind`. The types
  follow: `Infer<typeof Contacts>['create']['status']` is `'active' | 'archived' | undefined`.
- **Exactness.** `name` rejects 201 code points and accepts 200 emoji; `discount` rejects `'1.005'`
  instead of letting PostgreSQL round it; `priority` rejects 6; `website` rejects `http://`.
- **Metadata.** `Contacts.fields` gives a form each member's public name, which keys its label in
  the messages, its wire type and format, limits (`maxLength: 200`), options
  (`['active', 'archived']`), requiredness, and the default literal to show as a placeholder.
- **Errors.** A duplicate email in the organization is a 409 `CONTACT_EMAIL_TAKEN` pointing at
  `/data/attributes/email`; a too-long name sent anyway is a 422 `VALIDATION_FAILED` item with
  `meta.code` `"maxLength"` and `meta.expected` `"200"`.
- **Definitions.** `Contacts.resource` is the JSON:API definition (attributes, the relationship,
  sort, filters, `filter[q]`, page bounds, validators), and `Contacts.keyset` the keyset definition
  (columns, keyset types, operators, the `search` vector with `simple`, the default sort).

### 3.5 Messages

```ts
import { m } from './paraglide/messages.js'; // compiled by Paraglide JS from messages/{locale}.json

export const messages = defineMessages([Contacts, Organizations], APP_ERRORS, {
  errors: { NOT_FOUND: { title: m.not_found_title, detail: m.not_found_detail } /* every code */ },
  constraints: { unique: { title: m.conflict, detail: m.unique_detail } /* every kind used */ },
  validation: { maxLength: m.max_length, enum: m.one_of /* every issue kind */ },
  fields: { contacts: { name: m.contact_name, createdAt: m.created_at /* every member */ } },
  options: { contacts: { kind: { person: m.kind_person, company: m.kind_company } } },
});
```

```json
{ "max_length": "{field} darf höchstens {limit} Zeichen lang sein." }
```

Every message is a function, so Paraglide's compiled ones fit as they are (ADR-0009). A missing
code, kind, label, or option fails `tsc`, and so does a translation that uses a variable its kind
does not receive. `localizeErrors(messages, { resource })` is the `transform` of the ban handler: it
picks each object's message and inputs and rewrites titles and details, never codes or pointers, in
the locale `paraglideMiddleware` resolved for the request.

### 3.6 The server

```ts
const { definePolicy, defineResource } = createDomainDefiners<AppDomain>();

export const contacts = defineResource(Contacts, {
  policy: definePolicy(Contacts, {
    list: ({ actor }) => actor.can('contacts:read'),
    get: ({ actor }) => actor.can('contacts:read'),
    create: ({ actor }) => actor.can('contacts:write'),
    update: ({ actor }) => actor.can('contacts:write'),
    remove: ({ actor }) => actor.can('contacts:delete'),
  }),
  operations: {
    create: { quota: 'contacts', effects: [({ row }) => [ContactCreated.of({ id: row.id })]] },
  },
});
```

`@nizam-os/kysely-resource` runs them on PostgreSQL:

```ts
const storage = createKyselyStorage({
  db,
  catalog: publicCatalog,
  codecs,
  defineKeyset,
  outbox: { table: 'outbox' },
});
const runtime = await createResourceRuntime({
  storage,
  catalog, // the full catalog: row security policies, indexes, the outbox table
  resources: { contacts, organizations },
  unscoped: ['organizations'],
  scopes: SCOPE_BINDINGS,
  quotas: QUOTAS,
  services,
  errors: APP_ERRORS,
});

const created = await runtime.as(actor).contacts.create({ attributes: { name: 'Ada' } });
```

Boot refuses a database where row security would not hold: a scoped table without it, a policy that
does not read `app.organization_id`, a superuser connection, or a table the role owns without
`FORCE`. Each operation is one transaction that sets the parameter for that transaction only, adds
the scope predicate to every statement, locks the row an update or a remove decides on, writes only
the members a request carried, records its events in an outbox table, and maps every PostgreSQL
rejection to its declared code. Workers call the same domain HTTP does.

`@nizam-os/hono-resource` serves the runtime on Hono, every declared operation at the path its links
name, with an operations endpoint that runs a request in one transaction and the OpenAPI document:

```ts
app.use(
  jsonApi({ extensions: [ATOMIC_OPERATIONS_EXTENSION], profiles: [CURSOR_PAGINATION_PROFILE] }),
);
app.onError(ban.onError({ transform: localizeErrors(messages, { resource: resourceTypeOf }) }));
app.route('/', jsonApiRoutes({ runtime, actor: (c) => sessionActor(c), openapi: { info } }));
```

### 3.7 A migration

A migration that makes `nickname` NOT NULL without a default makes `nickname` required on create
after `extract`; the snapshot diff in the pull request marks it breaking. A migration that drops
`priority` fails `tsc` at `priority: { ... }` in the declaration. A migration that adds a `phone`
column whose CHECK uses a lookahead, which the recognizer cannot translate, fails `tsc` as soon as
`phone` is declared writable, until the declaration names a validator for it; the validator's
fixtures then run against the new CHECK in CI.

## 4. Architecture

### 4.1 The family

| Package                           | Role                                                                                                   | Epic     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| `@nizam-os/resource-core`          | declarations, derivations, messages, the `server` contracts, OpenAPI, the storage contract suite       | E1       |
| `@nizam-os/kysely-resource`        | the runtime: the storage adapter over Kysely, boot checks against the full catalog, quotas, the outbox | E3       |
| `@nizam-os/hono-resource`          | routes for every declared operation on Hono, localized errors, the OpenAPI route                       | E4       |
| `@nizam-os/resource-ui`            | a framework-free model of forms and lists, with TanStack Table v9's state as plain values              | E6, #174 |
| `@nizam-os/tanstack-form-resource` | the form model bound to TanStack Form's core, for every adapter                                        | E6, #174 |

Companions in other families: `@nizam-os/pg-catalog` extracts the catalog and runs the oracle
(`rules --check`); `@nizam-os/jsonapi-client` is the typed fetch client over the JSON:API
definitions, and `@nizam-os/tanstack-query-jsonapi` keys TanStack Query by its requests;
`@nizam-os/jsonapi-core`, `@nizam-os/keyset-core`, and `@nizam-os/ban-core` provide the definitions and
the error model this family derives.

### 4.2 Modules

`declare/` checks a declaration against the catalog and assembles the declared resource from
`names/` (public names and reverse maps), `wire/` and `schema/` (wire forms, value schemas, object
schemas, issues), `codecs/` (codecs and validators), `meta/` (field metadata), `errors/` (codes),
and `jsonapi/` (the two derived definitions, the JSON:API one with the members each write accepts).
`registry/` checks a list of declared resources as one registry, and `errorCatalog` and `messages/`
work on such lists. `server/`, `openapi/`, and `testing/` are separate entry points.

### 4.3 Data flow

```
migrations ──pg-catalog──▶ public catalog (as const) ──┐
                                                      ├──▶ declareResource ──▶ DeclaredResource
codecs, validators, scopes ──createDeclareResource──────┘        │
                                                                 ├─ names, schema, linkage, validate, write, fields, errors
                                                                 ├─ resource (jsonapi-core), keyset (keyset-core)
                                                                 └─ registry: errorCatalog, defineMessages, openapi, surfaceOf
                                                                                │
server: createDomainDefiners, scopes, quotas ──▶ kysely-resource ──▶ hono-resource ──▶ clients
```

### 4.4 The runtime

`@nizam-os/kysely-resource` is two layers. `createKyselyStorage` is the storage adapter of the
contract: values cross the driver as text both ways, in a session whose printing settings it fixes,
so no driver parser or client serialization changes a value, and the contract suite proves it on
PGlite and on servers. `createResourceRuntime` runs the lifecycle over it and is where the tenant
boundary is enforced three times: the session parameter row security reads, the predicate on every
statement, and the boot checks, static ones that CI runs from the catalog through
`checkResourceRuntime` and connected ones at startup that ask the server whether row security
applies to the role. `transaction(actor, work)` runs several operations in one transaction, as an
operations request needs: the first failure rolls everything back and is mapped as the operation
alone would map it. Effects write events to an outbox table in the operation's transaction;
`relayOutbox` delivers them after commit, at least once. Cursors are bound to the scope values, so a
cursor from one tenant is refused in another. ADR 0012 records why.

### 4.5 Forms and lists

`@nizam-os/resource-ui` is a model of a declared resource, and `@nizam-os/tanstack-form-resource`
binds it to TanStack Form. The model knows no framework: field descriptors whose labels are the
application's message functions, a form model whose values are what inputs edit and whose write
carries only what the person changed, validation by the declaration's own write validators with the
server's words for each refusal, a refused write's error objects placed by pointer, and a list model
whose state is the JSON:API query, read back leniently from a URL. `@nizam-os/tanstack-form-resource`
turns the form model into TanStack Form options and binds a refusal onto the fields, through
TanStack Form's framework-free core, so every adapter's form takes them;
`@nizam-os/tanstack-query-jsonapi`, of the jsonapi family, keys TanStack Query by the request and
invalidates a type after a write; TanStack Table v9 reads and writes the list's sorting and filters
as state, with paging by cursor outside it. An application keeps its framework, its field
components, its table markup, and its router. ADRs 0014, 0015, 0016, 0017, and 0018 record why.

## 5. Decisions

| ADR  | Decision                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------- |
| 0001 | Record architecture decisions                                                                                  |
| 0002 | The public catalog is the type source; a declaration is keyed by database names                                |
| 0003 | Public names are derived; `as` and `code` are the only overrides                                               |
| 0004 | Writes omit what they do not change; the database supplies defaults                                            |
| 0005 | Values cross the wire in canonical forms; a write PostgreSQL would alter is rejected                           |
| 0006 | Fixtures are mandatory on codecs and validators; the database is the oracle                                    |
| 0007 | Schema issues are named by JSON Schema keywords; constraint violations carry the constraint's code             |
| 0008 | A host-free core with a server subpath and a storage contract                                                  |
| 0009 | Messages are functions; the i18n library owns the locale                                                       |
| 0010 | The database resolves the violations a partition raises                                                        |
| 0011 | An id takes what its key's write form takes and is sent in the spelling the server reads back                  |
| 0012 | The runtime runs declared resources over the storage contract, in text, inside row security                    |
| 0013 | Hosts take the runtime contract, mount where the links point, and run an operations request in one transaction |
| 0014 | The React bindings render the application's one messages object                                                |
| 0015 | The React bindings are a framework-free model under TanStack Query, Form, and Table                            |
| 0016 | A form sends a cleared input as `null`, nullable or not                                                        |
| 0017 | A refusal of several fields binds where a change to any of them clears it                                      |
| 0018 | Forms and lists are a framework-free model and a TanStack Form binding, in two packages                        |
| 0019 | Record and bulk actions are a model over the declaration, and a selection writes in one request                |
| 0020 | A selection's writes fan out over the per-id endpoints; rows that commit together belong to one aggregate     |

## 6. Later

Each of these is left out of 0.x on purpose and would enter with an ADR: to-many relationships
(reverse foreign keys and join tables), composite primary keys, include paths deeper than one level,
sorting by a related field, and wire forms for `time`, `interval`, and the range types, which need a
codec today.
