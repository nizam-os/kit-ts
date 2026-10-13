# @nizam-os/resource-core

One declaration per PostgreSQL table, keyed by its database names and typed by the public catalog
[`@nizam-os/pg-catalog`](https://www.npmjs.com/package/@nizam-os/pg-catalog) extracts from your
migrations. A wrong table, column, foreign key, constraint, codec, validator, or scope name fails
`tsc` at the option that holds it, with the reason; the same mistake made from JavaScript throws a
`TypeError` naming its path. Every rule is specified in
[`docs/resource/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/resource/SPEC.md).

Status: in development and unreleased. This line implements the definer, the declaration, the public
names and codes derived from it, the wire forms and Zod schemas, `defineCodec` and
`defineValidator`, the boundary fixtures of the `testing` entry (SPEC sections 2 to 7), and the
derived error codes with `errorCatalog` (SPEC 9.1 and 9.2), field metadata (SPEC 8), messages with
their localization (SPEC 10), the JSON:API resource, with the members each write accepts, and the
keyset definition a declaration derives (SPEC 9.4 and 11), the `server` subpath with
`constraintError`, `relationshipTargets`, and the storage adapter contract and its suite, `list`
included (SPEC 9.5 and 12), and the `openapi` entry: the OpenAPI document, the surface, and its diff
(SPEC 13);
[`docs/resource/README.md`](https://github.com/nizam-os/kit/blob/main/docs/resource/README.md) shows
where the family is going.

## Install

```bash
pnpm add @nizam-os/resource-core zod
pnpm add -D @nizam-os/pg-catalog @electric-sql/pglite
```

`zod` 4.5 or later is a peer dependency: the first 4.x release whose `.max()` counts code points, as
PostgreSQL's `char_length` does. Schemas from `zod` and `zod/mini` both work.

Node 22.12+, Bun, Deno, Cloudflare Workers, and browsers are supported. Nothing in the package
imports a framework, a query builder, a driver, or a Node.js module, and declarations reach browsers
safely because they only ever see the public catalog.

## Quick start

List the tables your API serves in the extraction configuration, and run `pg-catalog extract`:

```ts
// pg-catalog.config.mjs
import { defineExtraction } from '@nizam-os/pg-catalog';

export default defineExtraction({
  migrations: 'migrations',
  out: {
    catalog: 'catalog.ts',
    public: {
      file: 'public-catalog.ts',
      tables: ['contacts', 'meetings', 'organizations'],
    },
  },
});
```

Configure the definer once, in the module the declarations import, with the codecs and validators of
[Codecs and validators](#codecs-and-validators):

```ts
// resources/declare-resource.ts
import { createDeclareResource } from '@nizam-os/resource-core';

import { publicCatalog } from '../public-catalog';
import { codecs } from './codecs';
import { validators } from './validators';

export const declareResource = createDeclareResource({
  catalog: publicCatalog,
  codecs,
  validators,
  scopes: { organization: { column: 'organization_id' } },
  domains: { email: { email_check: { validator: 'email' } } },
  links: { base: '/api' },
  page: { max: 50 },
  // The most operations one Atomic Operations request takes, 10 by default.
  atomic: { max: 50 },
});
```

`links`, `page`, and `atomic` are defaults for every declaration: `links` and `page` merge under a
declaration's own, and `atomic` is every definition's, since one endpoint serves every resource of a
runtime and a declaration has no `atomic` of its own.

Then declare each resource by its table:

```ts
// resources/contacts.ts
import { declareResource } from './declare-resource';
import { Organizations } from './organizations';

export const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'organization',
  fields: {
    kind: { access: 'immutable', filter: ['eq', 'in'] },
    name: { access: 'readWrite', filter: ['eq', 'startsWithi'], sort: true },
    email: { access: 'readWrite', filter: ['eq'] },
    created_at: { access: 'read', filter: ['gte', 'lt'], sort: true },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read', include: true },
  },
  search: { column: 'search', config: 'simple', mode: 'websearch' },
  sort: { default: ['name', { field: 'created_at', direction: 'desc' }] },
  rules: { contacts_email_unique: { code: 'CONTACT_EMAIL_TAKEN' } },
});

Contacts.table; // 'contacts'
Contacts.declaration.fields.name.sort; // true, frozen as given
Contacts.names.fields.get('createdAt'); // 'created_at'
```

## What `tsc` checks

| Option                 | Rule                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `catalog`              | the public catalog (`toPublicCatalog`), never the full one                                                                                                                     |
| `table`                | a table of the public catalog, with a single-column primary key whose type can carry a resource id (not `json` or `jsonb`) and orders pages (not an enum without values)       |
| `fields`               | columns of the table, other than the primary key, a foreign-key column, the scope column, and a `tsvector`                                                                     |
| `access`               | what the column allows (a generated column and an identity `ALWAYS` column are `read`, an identity `BY DEFAULT` column is `read` or `immutable`) and what the operations write |
| `codec`                | a codec of the definer that accepts the column's type; a column without a wire form, such as `tstzrange` or `bytea`, needs one                                                 |
| `relationships`        | single-column foreign keys to the primary key of a public table, of a type that can carry a resource id; the scope column is `read` only                                       |
| `operations`           | non-empty, without repeats; `update` needs a member writable on update                                                                                                         |
| `scope`                | a scope of the definer whose column the table has                                                                                                                              |
| `clientIds`            | a primary key that accepts a client value: not a generated column and not an identity `ALWAYS` column                                                                          |
| `search`               | a `tsvector` column; `config` equals the one the column is generated with, or is given, and is an unqualified name (`english`, not `pg_catalog.english`)                       |
| `filter`, `sort`       | operators `@nizam-os/keyset-core` runs for the member's type, each once, at least one; `isNull` only on a nullable column; none on `json`, `jsonb`, a codec; no sort on arrays |
| `as`                   | on a member that filters or sorts, ASCII letters, digits, `_`, and `-`, starting with a letter or a digit; on a filtered member, not `or`, nor `q` with `search`               |
| `sort.default`         | fields declared with `sort: true`, each once                                                                                                                                   |
| `rules`                | constraint names and NOT NULL keys (`contacts_name_not_null`); a validator only on an enforced CHECK without a rule, and required on every such CHECK over a written column    |
| `domains`              | a validator for each domain CHECK without a rule that a written field reaches, once, in the definer; on a CHECK with a rule, `code` alone                                      |
| `codecs`, `validators` | values `defineCodec` and `defineValidator` made, never objects written by hand; each fixture typed by its schema's input                                                       |

A member the grammar does not have is an error anywhere: `fields: { name: { sortable: true } }`
fails with `"sortable" is not a member of a field declaration`.

## Reading a compile error

The error sits at the offending option and states the reason, in one of two forms. A requirement is
a property no value has, whose name is the message:

```
Property '"access: immutable needs the create operation"' is missing in type '{ access: "immutable"; }'
```

A key that cannot be declared at all is checked against a message instead of a declaration:

```
Type '{ access: "read"; }' is not assignable to type '"\"fax\" is not a column of contacts"'
```

## JavaScript callers

The definer checks its configuration, and each declaration checks itself, when the module loads.
Every mistake throws a `TypeError` whose message starts with the path, in database names:

```
contacts.fields.nick: "nick" is not a column of contacts
meetings.fields.during: type tstzrange has no wire form; name a codec
people.relationships.team_slug: the foreign key references teams.slug, which is not its primary key
createDeclareResource.catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers
```

Optional members follow JavaScript defaults: `undefined` means absent, and `null` is refused.

## Relationship targets

`target` is a function that returns the declared resource of the referenced table. It is read
lazily, never while modules load, so declarations may reference each other in either order and
across modules, as `Meetings` and `Contacts` do here:

```ts
export const Meetings = declareResource('meetings', {
  operations: ['get'],
  fields: { room: { access: 'read' } },
  relationships: { contact_id: { target: () => Contacts, access: 'read' } },
});
```

Its declared return type is `void` on purpose: TypeScript then infers each declaration without first
inferring its targets, which is what keeps mutual references free of TS7022 (SPEC 3.8).

## Codecs and validators

A column whose type has no wire form, such as `tstzrange`, `bytea`, or pgvector's `vector`, names a
codec: the public schema of its values. A CHECK the catalog cannot translate into a rule names a
validator: its twin in Zod. Both carry fixtures, examples their schema must accept (and, for a
validator, reject), checked when the module loads; without them the call does not compile (SPEC 7,
ADR 0006).

```ts
// resources/codecs.ts

import { z } from 'zod';

import { defineCodec } from '@nizam-os/resource-core';

const instant = z.iso.datetime({ offset: true });

export const codecs = {
  timeRange: defineCodec({
    types: ['tstzrange'],
    schema: z
      .object({ start: instant, end: instant })
      .refine(({ start, end }) => Date.parse(start) < Date.parse(end)),
    fixtures: [{ start: '2026-03-02T09:00:00Z', end: '2026-03-02T10:30:00Z' }],
  }),
};
```

```ts
// resources/validators.ts: twins of CHECK (room = lower(room))
// and CHECK (contact_id IS NOT NULL OR notes IS NOT NULL)

import { z } from 'zod';

import { defineValidator } from '@nizam-os/resource-core';

export const validators = {
  lowercase: defineValidator({
    schema: z
      .string()
      .refine((value) => value === value.toLowerCase())
      .nullable(),
    fixtures: { accept: ['lobby-2', null], reject: ['Lobby-2'] },
  }),
  contactOrNotes: defineValidator({
    schema: z
      .object({ contact: z.uuid().nullable(), notes: z.string().nullable() })
      .refine(({ contact, notes }) => contact !== null || notes !== null),
    fixtures: {
      accept: [{ contact: null, notes: 'Bring the signed contract.' }],
      reject: [{ contact: null, notes: null }],
    },
  }),
};
```

A validator's input is what its CHECK sees: the field's value, `null` included when the column is
nullable, or for a CHECK over several columns an object of them by public name, each relationship as
its id. `tsc` checks it where a rule names the validator; had `contactOrNotes` taken the contact as
a linkage, `{ type, id }`, the rule would fail with
`validator: "contactOrNotes" does not accept every object of contact, notes`.

The storage adapter implements the other facet of each codec, typed by
`StorageCodecs<typeof codecs>`: `read` and `write` between the parsed wire value and what the driver
handles.

`pg-catalog rules --check` holds the fixtures, and every member's boundary values, to the database
your migrations build: an `accept` fixture must be stored, a `reject` fixture refused by its CHECK,
and a codec's fixture stored and read back as itself through a storage codec over text (see
[`@nizam-os/pg-catalog`](https://github.com/nizam-os/kit/tree/main/packages/pg-catalog#checking-declarations-against-the-database)).
A codec's fixtures are round-trip values, so write them as the server gives them back: the period
above is in UTC, since `tstzrange` keeps instants, not offsets.

## Public names

Declarations take database names, and the API speaks public names derived from them (SPEC 4):

| Public name  | Derived from                              | Override                 | Example                                            |
| ------------ | ----------------------------------------- | ------------------------ | -------------------------------------------------- |
| type         | the table's name                          | `as` on the declaration  | `contact_phones`                                   |
| field        | camelCase of the column                   | `as` on the field        | `created_at` is `createdAt`                        |
| relationship | camelCase of the column without its `_id` | `as` on the relationship | `organization_id` is `organization`                |
| error code   | the rule key, upper-cased                 | `code` on the rule       | `contacts_email_unique` is `CONTACTS_EMAIL_UNIQUE` |

camelCase is the conversion of Kysely's `CamelCasePlugin` with its default options, so a field's
public name is the key a camelCase Kysely row already has. Each declared resource holds both
directions in `names`, as `ReadonlyMap`s, so a name from a request never reaches `Object.prototype`:

```ts
Notes.names.fields.get('kind'); // 'type': public name to column
Notes.names.columns.get('contact_id'); // 'contact': column to public name
Notes.names.codes.get('NOTE_PRIORITY_OUT_OF_RANGE'); // 'notes_priorität_check'
```

A derived name JSON:API refuses or two members share needs `as`, and a derived code outside A-Z,
0-9, and `_` needs `code`:

```ts
export const Notes = declareResource('notes', {
  operations: ['list', 'get', 'create', 'update'],
  scope: 'organization',
  fields: {
    type: { access: 'immutable', as: 'kind' }, // every resource object has a type
    contact: { access: 'readWrite', as: 'contactName' }, // contact_id derives contact
    body: { access: 'readWrite' },
    priorität: { access: 'readWrite' },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
    author: { target: () => Contacts, access: 'immutable', as: 'author' }, // no _id to drop
    contact_id: { target: () => Contacts, access: 'readWrite' },
  },
  rules: { notes_priorität_check: { code: 'NOTE_PRIORITY_OUT_OF_RANGE' } }, // Ä is not A-Z
});
```

A member that filters or sorts also names a query parameter, `filter[createdAt]` or
`sort=-createdAt`, so its public name must be a field name `@nizam-os/keyset-core` accepts: ASCII
letters, digits, `_`, and `-`, starting with a letter or a digit. A filtered member cannot be named
`or`, which `filter` reserves for the disjunction, nor `q` when the resource has `search`, whose
parameter is `filter[q]`. `priorität` above keeps its name because nothing filters or sorts by it;
to filter by it, give it `as: 'priority'`.

`tsc` checks the type, every member that gives `as` or whose column could derive a refused or shared
name, and every given code. The other cases cost more to check in types than they catch, so only the
declaration's runtime check, which runs when the module loads, reports them: a derived code outside
the pattern or repeated, a column only a quoted identifier can name (`"suite-"`), and two columns a
Unicode case mapping gives one name (`a_ß` and `a_s_s` both give `aSS`), and the derived name of a
filtered or sortable column with a letter outside ASCII (`größe`). SPEC 4.2 and 11.2 list both
sides.

## Schemas

Every declared resource carries Zod schemas built from the catalog and the declaration, keyed by
public names (SPEC 5 and 6). A field's schema is its column's wire form, narrowed by its domain, the
CHECKs the catalog translates, its nullability, and its validators:

| Member                                             | Validates                                                                                 | Issues                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------- |
| `schema.read`, `schema.create`, `schema.update`    | the attributes of a response, a create, or an update                                      | Zod's                   |
| `schema.id`, `validate.id`                         | a resource id its key's form takes, output as the server sends it: a URL's or a client id | Zod's, `ResourceIssue`s |
| `linkage.read`, `linkage.create`, `linkage.update` | the relationships, each `{ type, id }`, or `null` where the foreign key is nullable       | Zod's                   |
| `validate.create`, `validate.update`               | the attributes, as Standard Schema validators                                             | `ResourceIssue`s        |
| `write.create`, `write.update`                     | a resource object as `@nizam-os/jsonapi-core` parses it, `{ attributes, relationships }`  | `ResourceIssue`s        |

`create` requires exactly the columns PostgreSQL requires on insert, `update` requires none, and
both reject unknown keys; over JSON:API a declared member the operation does not write never reaches
them, since the parser refuses it with 403 (SPEC 9.4). `read` strips unknown keys, so a client that
validates responses keeps working when the server adds a field. No schema fills in a default:
defaults stay in the database.

The wire forms refuse what PostgreSQL would refuse or store differently from what was sent: a
decimal with more fraction digits than `numeric(p, s)` keeps, trailing spaces past `varchar(n)`, a
date-time with nonzero digits past its column's precision, U+0000, and an unpaired surrogate. `int8`
and `numeric` values travel as decimal strings, since they exceed JavaScript's exact integers (SPEC
5.2).

Only `write` sees attributes and relationships together, so a CHECK over a field and a foreign key
runs there. With the validators of [Codecs and validators](#codecs-and-validators):

```ts
export const Meetings = declareResource('meetings', {
  operations: ['get', 'create', 'update'],
  scope: 'organization',
  clientIds: true,
  fields: {
    room: { access: 'readWrite' },
    during: { access: 'readWrite', codec: 'timeRange' },
    notes: { access: 'readWrite' },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
    contact_id: { target: () => Contacts, access: 'readWrite' },
  },
  rules: {
    meetings_room_lowercase: {
      validator: 'lowercase',
      code: 'MEETING_ROOM_NOT_LOWERCASE',
    },
    meetings_contact_or_notes: {
      validator: 'contactOrNotes',
      code: 'MEETING_NEEDS_CONTACT_OR_NOTES',
    },
  },
});

const result = await Meetings.write.create['~standard'].validate({
  attributes: { room: 'Lobby-2', notes: null },
  relationships: { contact: null },
});
// result.issues, each with message 'The value violates a constraint.' or
// 'A value is required.':
// { path: ['attributes', 'room'], code: 'MEETING_ROOM_NOT_LOWERCASE' }
// { path: ['attributes', 'during'], code: 'required' }
// { path: ['relationships', 'contact'], code: 'MEETING_NEEDS_CONTACT_OR_NOTES' }
// { path: ['attributes', 'notes'], code: 'MEETING_NEEDS_CONTACT_OR_NOTES' }
```

A `ResourceIssue` names a JSON Schema keyword (`required`, `maxLength`, `enum`, ...) or a
constraint's code, carries the limit in `expected`, and has a constant English message that never
repeats request data (SPEC 6.4). `Infer` gives the types of all six schemas:

```ts
import type { Infer } from '@nizam-os/resource-core';

type NewContact = Infer<typeof Contacts>['create'];
// kind?: 'person' | 'company', the enum's labels; name: string, required on insert

type MeetingLinks = Infer<typeof Meetings>['linkage']['create'];
// { contact?: { type: 'contacts'; id: string } | null }
```

## Field metadata

`fields` describes each public field and relationship for forms, documentation, and clients (SPEC
8). It is keyed by public name, the fields and then the relationships, frozen, and read from the
specs the schemas are built from, so what it states is what the schemas enforce:

```ts
const { name, kind, createdAt, organization } = Contacts.fields;

name.required; // true: NOT NULL without a default, so a create carries it
name.limits; // { minLength: 1, maxLength: 200, minimum: null, ..., patterns: [] }
name.filter; // ['eq', 'startsWithi'], typed as that tuple
kind.options; // ['person', 'company'], typed ReadonlyArray<'person' | 'company'>
kind.default; // { literal: 'person', value: 'person' }: a create may leave it out
createdAt.format; // 'date-time', with fractionDigits 6 and access 'read'
organization.wire; // 'string': a relationship describes its id, here an int8 key's
organization.limits.maximum; // '9223372036854775807', a decimal string
```

An array states its elements in `items`; a `json` column or a codec's value is `wire: 'any'`,
described by the JSON value or by the codec's schema; a relationship to a `bool` key lists the ids
`['true', 'false']` as its options. A validator states nothing here, and neither does a CHECK over
several columns, a unique constraint, or a foreign key: a value the metadata admits can still be
refused, so the server stays the authority. Over the oracle's columns and two real schemas, a client
that follows `fields` alone sent only what PostgreSQL stores as sent, and every value one step past
a stated limit was refused or changed (SPEC 15.4, 15.5).

## Testing at the limits

`boundaryFixtures(resource)`, from `@nizam-os/resource-core/testing`, lists for each field and
relationship the wire values at and next to each of its limits, each with a label: the empty string,
`maxLength 200, plus one`, `upper bound 5`, an unpaired surrogate, a seventh fraction digit. They
are what this package's oracle writes into PostgreSQL 14 and 18, whose verdicts the schemas match
(SPEC 15.3). Snapshot the verdicts, so a migration that changes a limit shows up in review as the
verdicts it flips:

```ts
import { expect, it } from 'vitest';

import { boundaryFixtures } from '@nizam-os/resource-core/testing';

import { Contacts } from './contacts';

it('keeps the limits of contacts', () => {
  const updatable = Contacts.schema.update.shape;
  const limits = Object.entries(boundaryFixtures(Contacts).fields)
    .filter(([field]) => Object.hasOwn(updatable, field))
    .flatMap(([field, fixtures]) =>
      fixtures.map(({ value, label }) => {
        const { success } = Contacts.schema.update.safeParse({ [field]: value });
        return `${field}: ${success ? 'accepts' : 'refuses'} ${label}`;
      }),
    );
  expect(limits).toMatchSnapshot(); // 'name: refuses maxLength 200, plus one', ...
});
```

In an integration test, write the accepted values through your storage adapter and read them back:
each must come back as the same value, compared per type as SPEC 15.3 does, so a driver that changes
a value fails at the fixture that shows it, such as a `timestamptz` parsed into a `Date`, which
keeps only milliseconds.

`oracleCases(resources, { storage })`, from the same entry, lists what `pg-catalog rules --check`
runs: each member's boundary fixtures, each validator's fixtures, and each codec's, with the text
written into a copy of their columns and the judge of PostgreSQL's verdict (SPEC 7.3). Run the check
through the CLI; the function is for a runner of your own.

## Errors

Each declared resource carries the error codes clients can cause, derived from its constraints (SPEC
9.1): one per constraint over a member, per NOT NULL member an operation writes, per CHECK of a
domain a member passes, and for the primary key with `clientIds`. An entry holds the status and
title the error renders with, the constraint's kind, and the public members it points at:

```ts
Contacts.errors.CONTACT_EMAIL_TAKEN;
// { status: 409, title: 'Conflict', kind: 'unique', fields: ['email'] }
Contacts.errors.CONTACTS_NAME_NOT_NULL;
// { status: 422, title: 'Invalid Attribute', kind: 'notNull', fields: ['name'] }
Contacts.errors.EMAIL_CHECK; // the email domain's CHECK
// { status: 422, title: 'Invalid Attribute', kind: 'check', fields: ['email'] }
```

A domain CHECK takes `code` in the definer's `domains`, next to its validator. A CHECK that has a
rule takes an entry for its code alone: its rule enforces it already, so a validator there fails
`tsc`.

```ts
// create domain short_text as varchar(120) check (char_length(value) between 1 and 120);
domains: {
  email: { email_check: { validator: 'email' } },
  short_text: { short_text_check: { code: 'NAME_LENGTH' } },
},

Organizations.errors.NAME_LENGTH; // in place of SHORT_TEXT_CHECK
// { status: 422, title: 'Invalid Attribute', kind: 'check', fields: ['name'] }
```

The scope column is never a member. `contacts_email_unique` covers `(organization_id, email)` and
the server writes `organization_id`, so the code points at `email`, and the scope's foreign key has
no code at all.

A unique index counts as a constraint. PostgreSQL reports its violation under the index's name, and
the public catalog lists each unique index that no constraint backs among the constraints, partial
or not, so its code follows the same rules and takes `code` like any rule key:

```ts
// create unique index contacts_active_name_unique on contacts (organization_id, name)
//   where status = 'active';
rules: { contacts_active_name_unique: { code: 'CONTACT_NAME_TAKEN' } },

Contacts.errors.CONTACT_NAME_TAKEN;
// { status: 409, title: 'Conflict', kind: 'unique', fields: ['name'] }
```

An index over an expression, such as `lower(email)`, is not in the public catalog and has no code.
Neither has a NOT ENFORCED CHECK or foreign key, which PostgreSQL never raises; `code` on its key
fails `tsc`, and the foreign key still declares a relationship.

`errorCatalog` assembles the codes of the resources the application serves, resource-core's
`QUOTA_EXCEEDED`, and the application's own codes into one `@nizam-os/ban-core` catalog fragment. It
checks the list as a registry (SPEC 4.2): each type once, each code from one constraint and taken by
neither `@nizam-os/ban-core`, `@nizam-os/jsonapi-core`, nor the application, and each relationship's
target in the list.

```ts
// errors.ts
import { createBan } from '@nizam-os/ban-core';
import { ERROR_CATALOG } from '@nizam-os/jsonapi-core';
import { errorCatalog } from '@nizam-os/resource-core';

import { Contacts } from './resources/contacts';
import { Meetings } from './resources/meetings';
import { Organizations } from './resources/organizations';

const catalog = errorCatalog([Organizations, Contacts, Meetings], {
  SEAT_LIMIT: { status: 402, title: 'Seat Limit' },
});
export const ban = createBan({ errors: { ...ERROR_CATALOG, ...catalog } });

ban.error('CONTACT_EMAIL_TAKEN'); // every derived code is a key
```

A conflict throws one `TypeError` that lists them all. A duplicate code names each constraint behind
it, so the message says where `code` goes:

```
errorCatalog: code SHORT_TEXT_CHECK is derived by organizations from domain short_text.short_text_check and by contacts from contacts.contacts_name_check, so all but one need a code
```

`tsc` reports a relationship whose target the list leaves out at that resource in the list, with the
same message as the runtime.

## Messages and localization

resource-core decides which message an error object needs and with which inputs; your i18n library
holds the texts and picks the locale (ADR 0009). Every message is a function: a title or a label
takes no inputs, a detail takes its kind's inputs. [Paraglide JS](https://paraglidejs.com) message
functions fit as the compiler emits them:

```ts
// messages.ts
import { defineMessages } from '@nizam-os/resource-core';

import { APP_ERRORS } from './errors';
import { m } from './paraglide/messages.js';
import { Contacts } from './resources/contacts';
import { Organizations } from './resources/organizations';

export const messages = defineMessages([Organizations, Contacts], APP_ERRORS, {
  errors: {
    NOT_FOUND: { title: m.not_found_title, detail: m.not_found_detail },
    // every code of @nizam-os/jsonapi-core, QUOTA_EXCEEDED, and every code of APP_ERRORS
  },
  constraints: {
    unique: { title: m.conflict, detail: m.unique_detail }, // ({ field, fields })
    // every constraint kind the resources have
  },
  validation: {
    maxLength: m.max_length, // ({ field, limit })
    enum: m.one_of, // ({ field, values })
    // all thirteen issue kinds
  },
  fields: { contacts: { name: m.contact_name, createdAt: m.created_at /* every member */ } },
  options: { contacts: { kind: { person: m.kind_person, company: m.kind_company } } },
});
```

A missing code, constraint kind, issue kind, member label, or option label fails `tsc`, and so does
an unknown key. Paraglide types each message with its variables across all locales, so a translation
that uses a variable its kind does not receive fails the build too, in any locale. A derived code
needs no entry, since its constraint kind's texts cover it; add one to `errors` only to override
them. A `@nizam-os/ban-core` built-in needs none either, but give one to each your host throws
itself, such as the `UNAUTHORIZED` of its actor resolver: without an entry, that error keeps its
English title and the detail your host wrote, in every language. A detail receives:

| Detail                                                                                               | Inputs                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| every detail                                                                                         | `field`: the label of the member the item points at, `id`, or empty |
| a constraint kind's, a derived code's                                                                | `fields`: the labels of the constraint's members, joined with `, `  |
| `minLength`, `maxLength`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` | `limit`: the limit                                                  |
| `enum`                                                                                               | `values`: the labels of the allowed options, joined with `, `       |
| `format`, `type`                                                                                     | `format`, `type`: the expected format or type                       |

`field` never holds a member name the request invented: a member the type does not have has no
label. `localizeErrors` turns the messages into the `transform` of the ban handler. With Paraglide,
run `paraglideMiddleware` around `next()`, so the error handler renders in the locale it resolved,
and name that locale in the response:

```ts
// app.ts
import type { Context } from 'hono';

import { Hono } from 'hono';

import { localizeErrors } from '@nizam-os/resource-core';

import { ban } from './errors'; // createBan from @nizam-os/hono-ban
import { messages } from './messages';
import { getLocale } from './paraglide/runtime.js';
import { paraglideMiddleware } from './paraglide/server.js';

export const app = new Hono();

app.use('*', async (c, next) =>
  paraglideMiddleware(c.req.raw, async () => {
    await next();
    return c.res;
  }),
);

const handle = ban.onError({
  // The type whose labels name the members; annotate `c` when written inline.
  transform: localizeErrors(messages, {
    resource: (c: Context) => c.req.path.split('/')[1],
  }),
});

app.onError(async (error, c) => {
  const response = await handle(error, c);
  response.headers.set('Content-Language', getLocale());
  response.headers.append('Vary', 'Accept-Language');
  return response;
});
```

```jsonc
// POST /contacts with Accept-Language: de and "kind": "robot": one object of the 422 response,
// which carries Content-Language: de
{
  "status": "422",
  "code": "VALIDATION_FAILED",
  "title": "Validierung fehlgeschlagen",
  "detail": "Art muss einer dieser Werte sein: Person, Firma.",
  "source": { "pointer": "/data/attributes/kind" },
  "meta": { "code": "enum", "expected": "[\"person\",\"company\"]" },
}
```

`localizeErrors` replaces titles and details only; codes, statuses, pointers, and `meta` stay, so
clients keep matching on codes. An object whose code has no texts passes through, and a message that
throws makes the handler answer 500 and report it. Without an i18n library,
`defaultMessages(resources, appErrors)` gives complete English messages, whose issue messages are
the ones the schemas already produce.

## The JSON:API resource and the keyset

A declared resource derives the two definitions a collection endpoint needs, from the same members
and under the same public names (SPEC 11):

- `Contacts.resource` is a `@nizam-os/jsonapi-core` resource: the attributes, the relationships,
  `serialize` for public rows, the create and update validators of the served operations, the id's
  validator, which checks a create's client id with `clientIds` and matches an update's id to its
  URL's, the members each write accepts (`writable`), the definer's cap on one Atomic Operations
  request (`atomic.max`), and the capabilities `parseQuery` holds a request to: the declared sorts,
  the filters with their operators, the includes, `filter[q]` when the declaration has `search`, and
  the page bounds. It is built on first read, since it names each relationship target's type.
- `Contacts.keyset` is a `@nizam-os/keyset-core` definition without the cursor: the same filters and
  sorts with each column's keyset type, the search column and its configuration, the key `id`, the
  default sort, and the same page bounds.

The cursor secret is server configuration, so the server defines the keyset with its own definer:

```ts
import { parseQuery } from '@nizam-os/jsonapi-core';
import { createDefineKeyset } from '@nizam-os/keyset-core';

const defineKeyset = createDefineKeyset({ cursor: { secret: env.CURSOR_SECRET } });
const contacts = defineKeyset(Contacts.keyset);

parseQuery(Contacts.resource, 'filter[kind][in]=person&sort=-createdAt'); // a 400 for anything undeclared
await contacts.plan({ sort: ['-createdAt'], page: { size: 10 } });
// @ts-expect-error: kind does not sort
await contacts.plan({ sort: ['kind'] });
```

`writable` follows the accesses (SPEC 9.4): a create writes the `readWrite`, `immutable`, and
`write` members, an update the `readWrite` and `write` ones. A request that carries any other
member, `createdAt` on a create or `kind` on an update, is refused where the route parses it
(`bodyValidator`, `parseCreateDocument`, `parseUpdateDocument`) with 403 `FORBIDDEN` at the member's
pointer, before any validator, policy, or statement runs; the relationship route and atomic
operations refuse it the same way, so no route repeats the check.

`Contacts.resource` also carries, in types only, what a client reads and writes (jsonapi SPEC 5.3),
so [`@nizam-os/jsonapi-client`](../jsonapi-client#readme) types its calls from the declaration with
nothing generated:

```ts
import type { TypesOf } from '@nizam-os/jsonapi-core';

type Contact = TypesOf<typeof Contacts.resource>;
// Contact['attributes']: { readonly kind: 'person' | 'company'; readonly name: string; ... }
// Contact['create']: the create validator's input; never when the declaration serves no create
// Contact['filter']: { readonly kind: 'eq' | 'in'; ... }, Contact['include']: 'organization'
```

The attributes are the read types as JSON, so a `write` field never appears, and each write is its
validator's input under public names. Keep declaration modules free of database code, as a client
imports them for their types.

What `parseQuery` accepts, the keyset plans under the same names, and what it refuses the keyset
refuses too, except a sort by `id`. The page bounds are resolved once for both, so a page size one
accepts, the other accepts.

A list route hands the keyset what `parseQuery` returned through `keysetRequest` from
`@nizam-os/resource-core/server`. Only the shapes of values differ: `parseQuery` yields text, or a
list for a repeated parameter, while keyset-core takes `isNull` as a boolean and `in`, `nin`,
`between`, and an array field's operators as lists. `keysetRequest` converts those, joins the
conditions and the `filter[or][n]` groups, passes `search` and the page as they are, and leaves
`sort` out of a query without one, so the declared default applies (SPEC 11.2):

```ts
import { respond } from '@nizam-os/hono-jsonapi';
import { paginatedDocument, parseQuery } from '@nizam-os/jsonapi-core';
import { keysetRequest } from '@nizam-os/resource-core/server';

app.get('/contacts', async (c) => {
  // ?filter[kind][in]=person&filter[or][0][name][startsWithi]=ada&filter[or][0][email]=ada@example.com
  const query = parseQuery(Contacts.resource, c.req.queries()); // a 400 for anything undeclared
  const page = await adapter.transaction(scopes, (tx) =>
    adapter.list(tx, Contacts, keysetRequest(Contacts, query)),
  );
  return respond(c, paginatedDocument(Contacts.resource, page, { url: c.req.url }));
});
```

Its result is typed by the declaration, so it is what `contacts.plan` takes. Every other value goes
to keyset-core unchanged, which accepts each type's text form: `filter[createdAt][gte]=yesterday` is
keyset-core's `InvalidFilterValueError`, a client error like the parser's. That error lists every
refused value, each with its condition's `path`; `filterParameters(Contacts, query)` gives the
parameter each path came in, as the request spelled it (`filter[createdAt][gte]`,
`filter[or][0][email]`). A runtime's `list` takes them as its `parameters` option and names each
refused value's parameter with them.

## Server

`@nizam-os/resource-core/server` holds what only a server composes, typed by your application's own
registries (SPEC 12): who acts and what they may do, each operation's behavior, tenant scopes,
quotas, events, and the errors of rules and of the database. It touches no database: a storage
adapter does, and a runtime runs each operation over one. `@nizam-os/kysely-resource` ships both.

### The domain

`createDomainDefiners` binds the definers to your domain's types, so a misspelled permission, quota,
code, or member fails `tsc`:

```ts
// server/domain.ts
import type { Actor } from '@nizam-os/resource-core/server';

import type { Services } from './services';

import { createDomainDefiners } from '@nizam-os/resource-core/server';

import { Contacts } from '../resources/contacts';
import { ContactCreated } from './registries';

type Permission = 'contacts:read' | 'contacts:write';

export interface AppActor extends Actor<Permission> {
  readonly organization: number;
}

export const APP_ERRORS = {
  PLAN_UPGRADE_REQUIRED: { status: 402, title: 'Plan Upgrade Required' },
} as const;

export interface AppDomain {
  readonly actor: AppActor;
  readonly permissions: Permission;
  readonly quotas: 'contacts';
  readonly services: Services; // what your runtime hands to policies, rules, values, and effects
  readonly errors: typeof APP_ERRORS;
}

const { definePolicy, defineResource } = createDomainDefiners<AppDomain>();

export const ContactsBehavior = defineResource(Contacts, {
  policy: definePolicy(Contacts, {
    list: ({ actor }) => actor.can('contacts:read'),
    get: ({ actor }) => actor.can('contacts:read'),
    create: ({ actor }) => actor.can('contacts:write'),
    update: ({ actor }) => actor.can('contacts:write'),
    remove: ({ actor }) => actor.can('contacts:write'),
  }),
  operations: {
    create: {
      quota: 'contacts',
      rules: [
        async ({ actor, services, input, reject }) => {
          const plan = await services.plans.of(actor.organization);
          if (input.attributes.kind === 'company' && !plan.companies) {
            reject('PLAN_UPGRADE_REQUIRED', { fields: ['kind'] });
          }
        },
      ],
      effects: [({ row }) => [ContactCreated.of({ id: row.id, name: row.name })]],
    },
  },
});
```

A predicate allows only by answering exactly `true`, and an operation without one is denied. A
denied `list` or `create` is `FORBIDDEN` (403); a denied `get`, `update`, or `remove` is `NOT_FOUND`
(404), the same response as a missing row, so a client cannot probe for rows it may not see
([RFC 9110](https://www.rfc-editor.org/rfc/rfc9110#section-15.5.4)). `operations.create.values`
supplies the server values, the columns an insert requires that no client member, scope, or client
id covers, such as `created_by`; `tsc` requires it exactly when the table has such columns.

`defineResource` freezes and records what it returns: `isResourceBehavior(value)` is `true` for
exactly those objects and never for a copy, so a runtime refuses a behavior put together by hand,
whose policy and operations nothing checked. `@nizam-os/kysely-resource` checks it at boot.

### Scopes, quotas, and events

Export the definer's `scopes` `as const` and bind each scope to the actor, so `tsc` checks the
bindings against them:

```ts
// server/registries.ts
import type { QuotaContext, ScopeBindings } from '@nizam-os/resource-core/server';

import type { scopes } from '../resources/declare-resource';
import type { AppActor } from './domain';
import type { Services } from './services';

import { z } from 'zod';

import { defineEvent, defineQuota, defineScope } from '@nizam-os/resource-core/server';

export const SCOPES = {
  organization: defineScope({
    column: 'organization_id',
    value: (actor: AppActor) => actor.organization,
    session: 'app.organization_id',
  }),
} satisfies ScopeBindings<typeof scopes, AppActor>;

export const QUOTAS = {
  contacts: defineQuota({
    limit: async ({ actor, services }: QuotaContext<AppActor, Services>) =>
      (await services.plans.of(actor.organization)).contacts,
  }),
};

export const ContactCreated = defineEvent(
  'contact.created',
  1,
  z.object({ id: z.uuid(), name: z.string() }),
);
```

`scopeValues(SCOPES, actor)` is what `StorageAdapter.transaction` sets; it throws for an actor
without a tenant, so nothing runs unscoped. The adapter sets each `session` parameter for the
transaction only, which your row security policies read with `current_setting`, and adds
`column = value` to every statement. `quotaExceeded(count, limit)` is `QUOTA_EXCEEDED` (403) once
the count reaches the limit, and for a limit that is not a safe integer of at least zero.
`ContactCreated.of(payload)` validates the payload; a changed payload is a new version.

`scopeColumnOf(Contacts)` is the column the declaration scopes its table by, `'organization_id'`,
and `undefined` for a resource without a scope. The adapter filters and writes the binding's
`column`, so a runtime compares the two at boot: a binding that names another column would scope the
table by the wrong one.

### Errors of rules and of the database

The runtime turns what an operation threw into the client's error, once the operation's transaction
has ended:

```ts
import type { ResourceBehavior } from '@nizam-os/resource-core/server';

import {
  constraintError,
  partitionViolation,
  Rejection,
  rejectionError,
} from '@nizam-os/resource-core/server';

type Behavior = ResourceBehavior<AppDomain>;

const failure = async (
  error: unknown,
  behavior: Behavior,
  operation: 'create' | 'update' | 'remove',
) => {
  const { resource } = behavior;
  if (error instanceof Rejection) return rejectionError(error, { resource, errors: APP_ERRORS });
  const raised = partitionViolation(error, { resource, operation });
  const partition = raised === undefined ? undefined : await adapter.partitionRoot(raised);
  return constraintError(error, { resource, operation, partition }) ?? error;
};
```

`rejectionError` builds the code a rule rejected with, with an item per member it named.
`constraintError` finds the declared code of a PostgreSQL integrity violation from the error's own
fields, whichever driver threw it (node-postgres, PGlite, postgres.js, Neon, or Bun):
`CONTACT_EMAIL_TAKEN` (409) with an item at `/data/attributes/email` and the driver error as
`cause`. It returns `undefined` for an error it does not own, which your ban's `map`, typically
`postgresMapper()` from `@nizam-os/ban-core/postgresql`, then answers by SQLSTATE. Every integrity
violation of a remove is `CONFLICT` (409), since it belongs to a row that references the removed
one: a foreign key that blocks the delete, or an `ON DELETE` action whose result breaks a constraint
of the referencing row.

A row written through a partitioned table is stored in a partition, and PostgreSQL's error names
that partition, and for a primary key or a unique constraint the partition's own index.
`partitionViolation` says when a violation names a table other than the resource's, and the
adapter's `partitionRoot` asks the database for the partitioned table's names, which
`constraintError` then reads as `partition`. Partitions can be created at any time, so the catalog
does not list them (ADR 0010).

### Storage adapters

An adapter implements `StorageAdapter<TTransaction>` over its own driver or query builder. It reads
each resource's columns, codecs, and scope from the declared resource and the public catalog:

```ts
interface StorageAdapter<TTransaction> {
  transaction(scopes, run): Promise<TResult>; // sets each scope's parameter for this transaction only
  list(tx, resource, request): Promise<StoragePage>;
  get(tx, resource, id): Promise<PublicRow | undefined>;
  lock(tx, resource, id, write: 'update' | 'remove'): Promise<PublicRow | undefined>;
  create(tx, resource, input): Promise<PublicRow>;
  update(tx, resource, id, input): Promise<PublicRow | undefined>;
  remove(tx, resource, id): Promise<boolean>;
  count(tx, resource, quota): Promise<number>; // under the quota's lock
  record(tx, events): Promise<void>; // to the outbox, in the transaction
  partitionRoot(names): Promise<ViolationNames | undefined>; // outside any operation: PARTITION_ROOT_SQL
}
```

Its eleven obligations are in SPEC 12.8; the [best practices](#best-practices) below cover the ones
that are easy to get wrong.

`list` pages with the resource's `keyset`. Define it once per resource with the server's
`createDefineKeyset({ cursor })`, plan the request, which names members by their public names, and
render the plan as `@nizam-os/kysely-keyset` does for Kysely:

```ts
const keysets = new WeakMap<DeclaredResource, Keyset>();

async function list(tx, resource, request: StorageListRequest): Promise<StoragePage> {
  let keyset = keysets.get(resource);
  if (keyset === undefined) keysets.set(resource, (keyset = defineKeyset(resource.keyset)));
  const plan = await keyset.plan(request);
  // One statement on the schema-qualified table: where the scope's predicate, plan.filter, and
  // plan.seek's branch; each of plan.keys selected as text under its alias, ordered by its
  // direction and nulls; limit plan.limit. Two or more branches: one such select each, also
  // selecting each key's value under its valueAlias, under union all, ordered by those values.
  const { rows, keyValues } = await select(tx, resource, plan);
  return keyset.page(plan, rows, (row) => keyValues.get(row) ?? []);
}
```

The reference adapter's
[`reference-list.ts`](https://github.com/nizam-os/kit/blob/main/e2e/resource/support/reference-list.ts)
renders every part of a declared resource's plan in plain SQL.

### The contract suite

`storageContract` from `@nizam-os/resource-core/testing` checks an adapter against those obligations
on its own fixture, under your test runner. Create a database from `contractFixture.migrations` plus
your outbox, then:

```ts
import { contractFixture, storageContract } from '@nizam-os/resource-core/testing';

const harness = {
  adapter: createAdapter({
    pool,
    catalog: contractFixture.catalog,
    codecs: { point: pointCodec },
    defineKeyset: createDefineKeyset({ cursor: { secret: process.env.CURSOR_SECRET } }),
  }),
  reset: async () => {
    await pool.query(contractFixture.seed);
    await pool.query('truncate table outbox restart identity');
  },
  events: async () => readOutbox(pool),
};

for (const contractCase of storageContract(harness)) {
  it(contractCase.name, contractCase.run);
}
```

Each case names the obligation it checks and fails with the expected and the actual value; the list
cases follow `next` and `prev`, so the adapter signs cursors as it does in production. Run it
against PostgreSQL with a pool of at least two connections: the cases of the quota lock and the row
lock run two transactions at once. PGlite serializes transactions, so those cases pass there without
proving the locks.

### A runtime

A runtime runs every operation in one transaction scoped to the actor: policy, rules, relationship
targets, quota, write, and effects, so any failure rolls back everything, events included.
[`@nizam-os/kysely-resource`](../kysely-resource/README.md) is the runtime for PostgreSQL through
Kysely: `createResourceRuntime` checks the composition at boot and runs this lifecycle for
`runtime.as(actor)`. A runtime over another storage composes it the same way. An update, condensed:

```ts
const update = async (
  actor: AppActor,
  behavior: Behavior,
  requested: string,
  request: ResourceInput,
) => {
  const known = behavior.resource.schema.id.safeParse(requested);
  if (!known.success) throw notFound(); // no row has it
  const id = known.data; // the key as the server sends it: a uuid in lower case
  const input = parsed(behavior, 'update', request); // behavior.resource.write.update
  try {
    return await adapter.transaction(scopeValues(SCOPES, actor), async (tx) => {
      const previous = await adapter.lock(tx, behavior.resource, id, 'update');
      if (previous === undefined) throw notFound();
      const context = { actor, services, input, row: previous };
      await behavior.policy.authorize('update', context);
      for (const rule of behavior.operations.update?.rules ?? [])
        await rule({ ...context, reject });
      for (const target of relationshipTargets(behavior.resource, input))
        if ((await adapter.get(tx, target.resource, target.id)) === undefined) throw target.error;
      const row = await adapter.update(tx, behavior.resource, id, input);
      if (row === undefined) throw notFound();
      await recordEffects(tx, behavior.operations.update?.effects, { ...context, row, previous });
      return row;
    });
  } catch (error) {
    throw await failure(error, behavior, 'update');
  }
};
```

PostgreSQL checks a foreign key without row security, so a write that names another tenant's row
passes it while a missing row fails it, and the difference would tell the actor which ids another
tenant holds. `relationshipTargets(resource, input)` lists each target the write names, with the
error its foreign key's code makes for a missing row, the same status, detail, and item at
`/data/relationships/<name>`; look each up in the actor's transaction and throw that error for one
the actor does not see, so both answer alike. It leaves out a relationship the write clears, a
foreign key PostgreSQL does not enforce, and a create's reference to its own client id. Look the
targets up after the policy and the rules, so an actor they refuse learns nothing of the targets.

Take every resource's behavior as `ResourceBehavior<AppDomain>`. Every operation's complete
lifecycle is in
[`packages/kysely-resource/src/runtime/`](https://github.com/nizam-os/kit/tree/main/packages/kysely-resource/src/runtime).

A host or a worker takes a runtime by the contract this subpath types (SPEC 12.10), so it needs no
query builder or driver to type the one it is given: `warnings`, `resources`, each behavior's
declared resource in their order, `as(actor)`, and `transaction(actor, work)`, whose `work` receives
the same domain with its operations sharing one transaction, which commits when `work` resolves and
rolls back at the first failure. Typed by the behaviors, each resource holds exactly the operations
it declares; typed wide, as a host that mounts any application takes it, every operation is
optional:

```ts
// server/people.ts
import type { ResourceRuntime } from '@nizam-os/resource-core/server';

import type { AppActor, AppDomain, ContactsBehavior } from './domain';

type Resources = { readonly contacts: typeof ContactsBehavior };

// a worker, typed by the behaviors it runs
export async function peopleOf(runtime: ResourceRuntime<AppDomain, Resources>, actor: AppActor) {
  const page = await runtime.as(actor).contacts.list({
    filter: { field: 'kind', op: 'eq', value: 'person' },
    sort: ['name'],
  });
  return page.rows; // public rows: id, kind, name, email, createdAt, organization
}

// two creates that commit together, or not at all
export async function importPair(runtime: ResourceRuntime<AppDomain, Resources>, actor: AppActor) {
  return runtime.transaction(actor, async (domain) => [
    await domain.contacts.create({ attributes: { name: 'Ada', kind: 'person' } }),
    await domain.contacts.create({ attributes: { name: 'Grace', kind: 'person' } }),
  ]);
}

// a host, typed wide
export function typesOf(runtime: ResourceRuntime<AppDomain>): ReadonlyArray<string> {
  return runtime.resources.map((resource) => resource.names.type);
}
```

## OpenAPI and the API diff

`@nizam-os/resource-core/openapi` documents the resources you serve as an OpenAPI 3.1.2 document,
and records what clients depend on as a surface you commit and diff (SPEC 13):

```ts
import { openapi } from '@nizam-os/resource-core/openapi';

export const document = openapi([Organizations, Contacts, Meetings], {
  info: { title: 'Contacts', version: '1.0.0' },
  appErrors: APP_ERRORS, // the catalog errorCatalog and the error handler take
  codes: {
    all: ['UNAUTHORIZED'], // what middleware answers on every route
    resources: { contacts: { create: ['PLAN_UPGRADE_REQUIRED', 'QUOTA_EXCEEDED'] } },
  },
  examples: {
    contacts: {
      create: { person: { summary: 'A person', attributes: { name: 'Ada', kind: 'person' } } },
    },
  },
});

app.get('/openapi.json', (c) => c.json(document));
```

A host on [`@nizam-os/hono-resource`](../hono-resource#the-openapi-document) passes the same options
as `jsonApiRoutes({ runtime, actor, openapi })`, and the routes serve the document of the runtime's
resources at `<base>/openapi.json`.

Every operation the declarations serve has its path, parameters, request and response documents, and
an error response for each status it can answer with, listing its codes; each code's error object is
a component, written once and referenced, and so is the response of a status that carries one code,
`components.responses['_error.<code>']`. Paths come from each resource's links, and an absolute base
becomes the document's server. `@nizam-os/jsonapi-core`'s `resourcePaths(Contacts.resource)` returns
the same paths, the collection, the resource with its `{id}`, each relationship's, the Atomic
Operations endpoint's, and the origin, for a host that mounts its routes where the document says
they are and a client that calls them. The schemas admit every request the server accepts, and may
admit more: what JSON Schema cannot state compactly, such as a validator or a date-time's range,
stays with the server, whose refusals the error responses document. An example that the server would
refuse, or a code in `codes` the catalog lacks, throws `TypeError`, so the build fails instead of
the document lying.

When a resource declares `create`, `update`, or `remove`, the document also lists the
[Atomic Operations](https://jsonapi.org/ext/atomic/) endpoint a host serves,
`POST <base>/operations` (operation id `atomic:operations`), under the extension's media type,
`application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"`. Its request schema holds each
operation a resource takes: an `add` of `contacts.atomic-add`, which may carry a `lid` that a later
operation names in a `ref` or in linkage (`contacts.local`); an `update` of `contacts.atomic-update`
by `ref`, `href`, or its data; a `remove`; and an `update` of each `readWrite` relationship. At most
`atomic.max` operations fit in a request, the cap the definitions share and the processor enforces:
10 by default, or what the definer's `atomic` says. The 200 answers `atomic:results`, and the 204 a
request whose operations have no result; the error responses list every code of each write. The
links must give one operations path, the definitions one cap, and no collection may sit at
`<base>/operations`, or `openapi` throws `TypeError`, as the routes would.

The surface is the part of the document a client can break on, as sorted JSON: its `format`, then
per type the operations, each member's access, form, limits, options, nullability, requiredness,
operators, and sortability, the codes with their statuses, and the page bounds. Commit it next to
the catalog and diff it in CI. `pg-catalog surface` writes it from the registry your
`pg-catalog.config.ts` names, and `pg-catalog surface --check` prints each change and exits 1 on a
breaking one (see `@nizam-os/pg-catalog`'s README). From code, `parseSurface` reads a committed
surface back, refusing a file of another `format` or with a member out of place, and `diffSurfaces`
compares it:

```ts
import { readFile } from 'node:fs/promises';

import { diffSurfaces, parseSurface, surfaceOf } from '@nizam-os/resource-core/openapi';

const committed = parseSurface(JSON.parse(await readFile('api-surface.json', 'utf8')));
const breaking = diffSurfaces(committed, surfaceOf(resources)).filter((change) => change.breaking);
// [{ path: ['contacts', 'fields', 'email', 'access'], change: 'changed', breaking: true,
//    before: 'readWrite', after: 'read' }]
```

A change breaks a client when the server stops taking what the client sent, or starts sending a JSON
type it did not expect: a member removed or renamed, an access that loses a capability, a member
that becomes required on create, a writable member that becomes non-nullable or a readable one
nullable, a changed wire form, a tightened limit, a removed option, operator, or code. A new member,
option, operator, or code, a loosened limit, and a new default page size break nobody.

## Best practices

- **One definer per application.** Create it in one module and export `declareResource` from there.
  The registries live in that call, never in module-level state, so two applications in one process
  cannot collide.
- **Keep the catalog current.** Run `pg-catalog extract --check` in CI: a migration that renames a
  column then fails the build at the declaration that names it, instead of at the first request.
- **Declare inline.** Write the declaration in the `declareResource` call, so each error lands on
  its option. A declaration held in a variable needs `as const`, since `'get'` otherwise widens to
  `string` and the call fails; its errors are then reported at the call.
- **Return targets from arrow functions.** `target: () => Organizations`, never `Organizations`
  itself, which throws `TypeError` at runtime and fails `tsc`.
- **Filter with what the planner runs.** Declare the operators of the member's keyset type
  (`@nizam-os/keyset-core` SPEC 4.2): ordered comparisons for numbers and dates, patterns for text,
  `contains`, `containedBy`, and `overlaps` for arrays, `eq` and `in` for uuids and enums. A text
  column with a CHECK `IN (...)` is an enum, so `gt` and `contains` are refused there. Offer
  `isNull` only where the column can be null, and sort by scalars: an array, a `jsonb` column, and a
  codec field do not sort. Declare only the operators clients need, since each one is a query the
  database must answer quickly.
- **Keep query names URL-safe.** A filtered or sortable member's public name goes into request URLs,
  so keep it to ASCII letters, digits, `_`, and `-`: give `as: 'priority'` to a `priorität` column
  before filtering by it, and leave `or`, and `q` on a resource with `search`, to the query syntax.
  List each operator once, and each `sort.default` field once.
- **Define the keyset on the server.** Declarations reach browsers, so `keyset` carries no cursor:
  pass it to the server's `createDefineKeyset({ cursor })`, which holds the secret and, during a
  rotation, `previousSecrets`. Plan with the names `parseQuery` returned, never with columns.
- **Build the keyset request with `keysetRequest`.** A translation by hand is easy to get subtly
  wrong: passing `isNull=true` as the text `'true'` refuses a valid query, a single `in` value as a
  string refuses it too, and passing the parsed empty `sort` lists by the key alone instead of the
  declared default. A list is a repeated parameter, never a comma-separated value, since a comma
  belongs to text.
- **Page with the plan, not around it.** Pass every value of the plan as a parameter of its column's
  type, a cursor's values too: they are the text each key was selected as. Read back through a
  driver's `Date` or `number`, a `timestamptz` loses its microseconds and an `int8` past 2^53 its
  last digits, and the next page repeats or skips a row. Order with each key's `nulls` where it is
  set, since PostgreSQL's default puts nulls first when descending, and with no placement where it
  is `null`, so a plain index serves the order; never page with `offset`.
- **Pick the narrowest access.** `immutable` for values fixed at creation, `read` for columns the
  database or the server sets, `write` only for values clients send but never read back. The access
  is what a write may carry: a client that sends a `read` member, or an `immutable` one on update,
  gets a 403 that names it, never a success that dropped it.
- **Key resources by a scalar.** A `uuid`, `int8`, or `text` primary key carries an id; `json` and
  `jsonb` cannot, even though PostgreSQL accepts them as keys. Use `clientIds: true` with a key that
  accepts a client value, such as `uuid default gen_random_uuid()` or an identity `BY DEFAULT`.
- **Check a URL's id before querying, and query with its output.** Answer `NOT_FOUND` when
  `schema.id` refuses it, as the runtime above does: PostgreSQL would refuse the text with a 500, or
  read `042` or a `uuid` without hyphens as an existing key and serve a resource whose id differs
  from the URL's. Otherwise look the row up with what `schema.id` outputs, the key as the server
  sends it: a client may spell a `uuid` key in upper case (RFC 9562), a `numeric(5,2)` key as `1.5`,
  or a `timestamptz` key with an offset, and the server sends them in lower case, as `1.50`, and in
  UTC. A create's client id needs nothing: the JSON:API resource validates it, a 422 at `/data/id`,
  and hands the handler its output.
- **Compare coarse keys in the database.** A `citext` key, a `numeric` without a scale, and a
  `bpchar` without a length compare more coarsely than any spelling (`ADA` and `ada`, `1` and `1.0`,
  `ab` and `ab `), so their ids keep the text sent and two of them can name one row. Compare such
  ids with a query, never as text, or give the key a type with one spelling per value.
- **Name foreign keys `<thing>_id`.** The relationship is then `<thing>` without `as`. Keep `type`,
  `id`, and `lid` for the members JSON:API gives them, and rename such a column with `as` (`kind`).
- **Give codes to the errors clients handle.** A derived code follows the constraint's name, which
  PostgreSQL generates from the columns unless the migration names it; `code: 'CONTACT_EMAIL_TAKEN'`
  stays put when a migration renames the constraint. Name constraints in ASCII, or give `code`: a
  CHECK on `größe` is named `notes_größe_check`, whose code is not A-Z. A domain CHECK's code goes
  in the definer's `domains`, whether or not the CHECK has a rule.
- **Express uniqueness over columns.** A unique index derives its code from its name, as a
  constraint does, so name it like one. An index over an expression has no code: prefer a `citext`
  column with a plain UNIQUE to a unique index on `lower(email)`, or map the index by name with
  `postgresMapper`'s `constraints`.
- **Pass `errorCatalog` the registry you serve.** Give it the same list of resources the server and
  the OpenAPI document take, so its checks cover every code and relationship a client can reach.
- **Document what the handler renders.** Give `openapi` the `appErrors` of your error catalog and
  the error handler's `docsBaseUrl` and JSON:API format options under `errors`, so the documented
  error objects are the ones clients receive. List in `codes` what the declarations cannot see:
  `all` for what middleware answers everywhere (`UNAUTHORIZED`), and per type and operation the
  codes of each rule and quota.
- **Build the document once.** It depends only on the declarations and the options, so build it at
  startup or at build time and serve the same object; on a hundred tables it is a few megabytes.
- **Test exchanges against the document.** Validate the status, the media type, the body, and the
  codes of every response your API tests receive against the document's operation, with a JSON
  Schema 2020-12 validator that knows the OpenAPI formats (`int16`, `decimal`, `date-time-local`). A
  status of one code is a `$ref` into `components.responses`: read the response where it points. A
  response outside the document is a bug in one of them.
- **Answer the planner's refusals as the parser's.** Map keyset-core's `InvalidCursorError` to
  `INVALID_QUERY_PARAMETER` at `page[after]` or `page[before]`, and each of
  `InvalidFilterValueError`'s `values` to its own `INVALID_QUERY_PARAMETER` at the parameter its
  `path` leads to among `filterParameters`, as the document's 400 lists them. A client then hears of
  every bad value at once, at the parameter it sent, such as `filter[status]` rather than
  `filter[status][eq]`. Left unmapped, they answer 500. A runtime's `list` does this when given
  `{ parameters: filterParameters(resource, query) }`.
- **Commit the surface and review its diff.** Write it with `pg-catalog surface` next to the
  catalog, run `pg-catalog surface --check` in CI, and record a breaking change only with the API
  major version that announces it. A migration that renames a column, tightens a CHECK, or widens an
  `integer` to a `bigint` shows up there as the public change it is.
- **Read responses tolerantly.** Handle error codes, options, and members your client does not know,
  and validate responses with schemas that allow them, as `read` and the document's response schemas
  do: the diff counts adding them as safe.
- **Keep derived codes unique.** A code is the constraint's name upper-cased, without its table, so
  two tables that share a CHECK name, as tables copied from one another do, derive one code twice,
  and so do two domains whose CHECKs share a name. The error names both constraints; give `code` on
  one, or name constraints after their table or domain.
- **Review names as API changes.** Snapshot `names` in a test, so a migration that renames a column
  shows up in review as the public name it changes.
- **Write fixtures at the edges.** A fixture is an example and a test: give the boundary values, the
  empty string, and `null` where the column allows it. A CHECK passes `NULL`, so the validator of a
  nullable column must accept `null`. `pg-catalog rules --check` runs every fixture through the
  database, so a regular expression or a case rule that disagrees with PostgreSQL shows up there.
  Give only values the member can hold: the check reports a fixture with no text form, such as a
  symbol, instead of sending it, and a `reject` fixture the column's type refuses, such as `'x'` for
  an `integer`, since it never reaches the CHECK.
- **Keep validators to what PostgreSQL agrees on.** `lower()` beyond ASCII follows the database's
  `LC_CTYPE`, and a regular expression's dialect differs in places; choose fixtures inside the
  shared ground, and prefer a CHECK the catalog translates.
- **Type a validator's input as what its CHECK sees.** The field's value, with `null` when the
  column is nullable; for a CHECK over several columns, an object of them by public name, each
  relationship as its id. One CHECK over different columns needs its own validator.
- **Keep schemas synchronous.** A check that needs the database or another service belongs in server
  code, not in a validator.
- **Validate a whole write with `write`.** On the server, pass the resource object
  `@nizam-os/jsonapi-core` parsed to `write.create` or `write.update`: only they run the CHECKs over
  a field and a relationship, and their issue paths start at `attributes` or `relationships`.
- **Build forms from `fields`, validate with the schemas.** Mark a member required by `required`,
  never by `nullable`: a NOT NULL column with a default may be left out. Render `options` as a
  choice, cap input at `maxLength`, and offer date-times at `fractionDigits`. Then validate the
  whole write with `write.create` or `write.update`, which also run the validators and the CHECKs
  over several members that `fields` does not describe.
- **Compare numeric bounds as decimals.** `minimum`, `maximum`, and `multipleOf` are decimal strings
  for every number type, since an `int8` or `numeric` bound exceeds JavaScript's numbers. Compare
  with `BigInt` or a decimal library, not `Number(...)`.
- **Test every pattern in script.** A value must contain a match of each entry of `patterns`, read
  as `new RegExp(source, 'su')`. Do not copy one into an HTML `pattern` attribute, which the browser
  anchors to the whole value and compiles with the `v` flag and without `s`, so it can accept or
  refuse otherwise
  ([HTML](https://html.spec.whatwg.org/multipage/input.html#the-pattern-attribute)).
- **Show `default`, never send it.** It is the value PostgreSQL applies when a create leaves the
  member out: start the input from `value`, the constant as a read gives it, or show `literal` as a
  placeholder, and leave the member out to get it. An expression default such as `now()` has
  `literal: null` and no `value`, and so does a codec's field.
- **Validate responses with `read`.** It strips members it does not know, so a deployed client keeps
  working when the server adds one. For a sparse fieldset, validate with `schema.read.pick(...)` of
  the requested members.
- **Send date-times at the column's precision.** A `timestamp(3)` column refuses a fourth nonzero
  fraction digit rather than let PostgreSQL round it, possibly into the next day; zeros past the
  precision are accepted. `toISOString()` writes milliseconds, so clear them for a `timestamptz(0)`
  column.
- **Keep `int8` and `numeric` values as strings.** Parse them with `BigInt` or a decimal library
  only to compute, and send the canonical spelling: `0.5`, not `.5`, `+0.5`, or `5e-1`.
- **Cover every CHECK without a rule.** Name the validator in the declaration's `rules`, and a
  domain's once in the definer's `domains`; prefer CHECKs `@nizam-os/pg-catalog` translates (length,
  range, `IN`, `IS NOT NULL`, simple patterns), which need no code at all.
- **Localize with your i18n library, by kind first.** One message per issue kind and per constraint
  kind covers every resource; override a derived code in `errors` only where the generic sentence is
  not good enough. Reference each Paraglide message directly (`maxLength: m.max_length`), never as
  `m[key]`, so unused ones are tree-shaken and `inlang check` sees which are used; write plurals as
  variants on `limit`, never as two messages. Run `inlang check` in CI next to `tsc`.
- **Name the locale and what chose it.** Set `Content-Language` from `getLocale()` on every error
  response and add `Vary` for the request fields Paraglide's strategies read (`Accept-Language` for
  `preferredLanguage`, `Cookie` for `cookie`), so caches keep one response per language.
- **Pass `resource` to `localizeErrors`.** Member labels belong to a type, so without it no detail
  can name the member. Return the type the request addresses; a type the messages do not label, such
  as a path segment no resource has, names nothing.
- **Enforce in the database what the API enforces.** A NOT ENFORCED CHECK or foreign key
  (PostgreSQL 18) is one the database records but never checks, so the schemas skip it, it takes no
  validator, and it has no error code; rows that break it can be read and saved again unchanged. To
  have clients held to it, enforce it: `ALTER TABLE ... ALTER CONSTRAINT ... ENFORCED` for a foreign
  key, which first checks the existing rows, and for a CHECK, drop it and add it again without
  `NOT ENFORCED`. A rule too costly for the database belongs in server code, with an error of your
  own.
- **Fail closed on the server.** Return `true` from a predicate only for what is allowed: any other
  answer denies, and so does an operation without a predicate. Give a resource without a policy
  `denyAll`, which `defineResource` uses when `policy` is absent.
- **Answer a denied row with 404.** A runtime builds the `NOT_FOUND` of a denied `get`, `update`, or
  `remove` exactly as for a missing row, so clients cannot tell rows they may not see from rows that
  do not exist.
- **Set scope parameters for the transaction.** Use `set_config(name, value, true)`, never `SET` or
  `set_config(name, value, false)`: a pooled connection keeps a session setting for the next
  request, which may be another tenant's.
- **Write row security policies that deny when the parameter is unset.** Once a transaction-local
  setting ended, the parameter reads as the empty string on that connection, not as missing:
  `current_setting('app.organization_id')::bigint` then fails with 22P02 instead of 42704, and
  `current_setting('app.organization_id', true)` returns `''`, not `NULL`. Both still deny; to deny
  without an error, compare with `nullif(current_setting('app.organization_id', true), '')::bigint`,
  which is `NULL` when unset and matches no row.
- **Look relationship targets up as the actor.** A foreign key accepts another tenant's row, since
  PostgreSQL checks it without row security. Run `relationshipTargets` before a create or an update
  writes, and answer a target the actor does not see with its `error`, exactly as a missing one.
- **Lock the row an update or a remove decides on.** Read it with `lock`, never `get`: under READ
  COMMITTED a plain read takes no lock, so another transaction could change or remove the row
  between the policy's decision and the write. Before a remove, lock `FOR UPDATE`, which also stops
  another transaction from adding a reference to the row.
- **Rethrow database errors unchanged.** An adapter lets the driver's error reach the runtime, as
  thrown or as `cause`, so `constraintError` reads its fields. A wrapper without `cause` turns every
  `CONTACT_EMAIL_TAKEN` into a 500.
- **Fail the transaction when a statement failed.** PostgreSQL turns the COMMIT of an aborted
  transaction into a rollback that reports no error, so when a statement failed and the run caught
  it and went on, reject with that statement's error instead of reporting success.
- **Read values as text.** Select each column as `text` and parse it with its read form, and send
  parameters as text cast to the column's type. Drivers' default parsers differ, and some turn an
  `int8` past 2^53 or a `numeric` into a number that loses digits, or a `timestamptz` into a `Date`
  that drops its microseconds.
- **Serialize the quota count with the insert.** Take a transaction-scoped advisory lock keyed by
  the resource, the quota, and the scope value before counting, so two concurrent creates cannot
  both take the last slot.
- **Record events in the operation's transaction.** Effects return events and the adapter writes
  them to an outbox with the write; deliver them after commit, so no consumer hears of a write that
  rolled back.
- **Resolve a partition's violation before mapping it.** Run `partitionViolation`, the adapter's
  `partitionRoot`, and `constraintError` with `partition` after the transaction ended, since the
  aborted transaction runs no further query. Implement `partitionRoot` with `PARTITION_ROOT_SQL` as
  it stands, and leave a SQL `NULL` constraint out of the answer rather than passing `null` on.

## Performance

Measured with TypeScript 7.0.2 on declarations generated for every declarable table of two real
schemas, each exposing every column it can, against the packed package (SPEC 15.5). Times and peak
memory are medians of at least five runs:

| Catalog            | Declarations | Fields | Relationships | Check time | Peak memory, 1 checker | Peak memory, 4 checkers |
| ------------------ | ------------ | ------ | ------------- | ---------- | ---------------------- | ----------------------- |
| stern              | 111          | 1,183  | 184           | 0.19 s     | 135 MB                 | 219 MB                  |
| GitLab 17.11 slice | 60           | 1,461  | 26            | 0.28 s     | 163 MB                 | 278 MB                  |

The names checks account for about 15 percent of the stern check time and 11 percent of the GitLab
one. The filter and sort check, with 1,019 of stern's fields and 1,290 of the GitLab slice's
declaring both, adds 15 percent instantiations and 4 and 6 percent check time (0.18 to 0.19 s, 0.27
to 0.28 s). The checks of the definitions a declaration derives (public names, `filter` lists, the
default sort, the search configuration, the primary key) add 4 and 2 percent instantiations and 2
and 4 percent check time. Codecs, validators, and schemas add 1.4 and 4.8 percent instantiations and
about 10 MB of peak memory, most of it to parse Zod's own declarations. A resource's codes are typed
only where code reads them: `errorCatalog` over all of stern's declarations, spread into
`createBan`, took the check from 0.17 s and 129 MB to 0.36 s and 143 MB. `fields` is typed the same
way: reading every declaration's `fields` took stern's check from 0.18 s to 0.35 s, about what
reading each one's `schema.create` output costs. A full `defineMessages` mapping, one function per
code, kind, member, and option, took stern's check from 0.19 s and 124 MB to 0.35 s and 161 MB, and
the GitLab slice's, with 1,302 derived codes, from 0.28 s and 157 MB to 0.67 s and 198 MB. A policy
and a behavior for every declaration, with rules and effects, collected in one
`ReadonlyArray<ResourceBehavior<TDomain>>` as a runtime takes them, took stern's check from 0.18 s
and 129 MB to 0.52 s and 202 MB, and the GitLab slice's from 0.27 s and 151 MB to 0.68 s and 211 MB.

- **Checkers.** TypeScript 7 runs 4 checkers by default, each with its own view of the program, and
  every checker recomputes the declarations its files reach, since a relationship's target pulls in
  the target's declaration. On these projects one checker was as fast as four and used about 40
  percent less memory, so a memory-constrained CI runner can pass `--checkers 1`. Pin the same count
  locally and in CI, as the TypeScript team advises, since a different count can in rare cases
  surface order-dependent results. Measure your own project with `tsc --extendedDiagnostics`.
- **Type helpers.** Constrain a type parameter that takes a resource by `AnyDeclaredResource`, as
  `Infer` and `ErrorCatalog` do, never by the wide `DeclaredResource`. TypeScript checks a type
  argument's constraint with error reporting on, and against the wide type it recomputes a failed
  check of the definer context on every reference: 20 `Infer<typeof X>` aliases cost 1.05 s and 577
  MB on stern that way, against 0.19 s and 130 MB. Type a function's parameter that takes any
  resource, or a list of them, by `AnyDeclaredResource` too, as `openapi` and `surfaceOf` do: called
  over stern's declarations with the wide type, the two tripled the check's instantiations and time;
  with `AnyDeclaredResource` they add 440 instantiations. Annotating a value with `DeclaredResource`
  stays cheap.
- **For contributors.** Keep the valid path free of error types. A mapped type over unknown members
  is built only when a member is unknown (`KnownMembers`): built for every field, it made the stern
  check take 1.55 s and 874 MB. Messages for keys that cannot be declared come from a separate
  mapped type built only when there is one (`FieldsCheck`): an error branch inside the per-key
  template costs types for every key even when no key takes it, and splitting it out cut the types
  created by about three quarters. Compute what depends on the catalog alone per table, so
  TypeScript caches it: the names check examines only the members a table's name risk holds, which
  took its first version from 3 and 6.5 times the cost of the other checks to 15 and 9.5 percent
  more instantiations. Key an alias by what repeats across fields, since TypeScript caches it by its
  arguments: the filter check computes a keyset type per resolved column type and checks the
  operators per keyset type and declared list, so a column costs a lookup; its first version, keyed
  by the column, added 37 and 57 percent instantiations instead of 15. Do not read a string one
  character at a time in a check every member takes: template literal recursion costs about ten
  instantiations a character, and the first version of the public-name check, which read every name,
  added 26 and 56 percent instantiations; checking only the members the names check already examines
  added 4 and 2. Name every union of template literal types with an alias: TypeScript 7 instantiates
  an inline union in a conditional's `extends` clause again on every evaluation, at 4 to 7 times the
  cost. Re-run the real-catalog measurement when a check changes shape.

@ref https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/

## Documentation

- [`docs/resource/DESIGN.md`](https://github.com/nizam-os/kit/blob/main/docs/resource/DESIGN.md):
  what the family is, the principles, and the API by example
- [`docs/resource/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/resource/SPEC.md): the
  normative contract, section by section, with the tests that prove it
- [`docs/resource/adr/`](https://github.com/nizam-os/kit/tree/main/docs/resource/adr): the decisions

## License

MIT
