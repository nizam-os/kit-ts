# @nizam-os/resource-core

## 0.1.0

### Minor Changes

- [#191](https://github.com/nizam-os/kit-ts/pull/191) [`f6568c1`](https://github.com/nizam-os/kit-ts/commit/f6568c1b4448a9e092f9f7132601c6f48b404c69) Thanks [@ali-issa](https://github.com/ali-issa)! - Hold the Atomic Operations endpoint and its cap in the definitions. `defineResource` takes
  `atomic: { max }`, the most operations one request takes: 10 by default, and a positive safe integer
  or a `TypeError` naming `atomic.max`. `createDefineResource` and `createDeclareResource` take it as
  a default, and `ResourceDefaults` gains `atomic`. `resourcePaths` returns `operations`, the
  collection's base followed by `/operations`, where `@nizam-os/hono-resource` mounts the endpoint and
  the OpenAPI document lists it. `operationsProcessor` and `atomicOperations` read the cap from their
  resources' definitions and throw `TypeError` at setup when the caps differ; `maxOperations` is no
  longer an option. The OpenAPI document's `maxItems` is the cap, and its refusal of links under
  different bases now names their operations paths.

- [#158](https://github.com/nizam-os/kit-ts/pull/158) [`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45) Thanks [@ali-issa](https://github.com/ali-issa)! - A refused filter value's error names the query parameter the client sent, as the parser's own
  refusals do. `parseQuery`'s filter conditions keep the `parameter` they came in, as the request
  spelled it, and a condition built by hand names one too. Each entry of keyset-core's
  `InvalidFilterValueError` carries its condition's `path` in the filter tree.
  `@nizam-os/resource-core`'s `filterParameters(resource, query)` lists each condition's path and
  parameter, which a runtime's `list` takes as its `parameters` option. `@nizam-os/kysely-resource`
  then answers a refused value at that parameter, in a transaction too: `filter[status]` or
  `filter[or][0][status]`, where it answered `filter[status][eq]`. `@nizam-os/hono-resource`'s list
  route passes the parameters.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`3165675`](https://github.com/nizam-os/kit-ts/commit/31656752fb3e252b61d20c9eeed8f2a484264a83) Thanks [@ali-issa](https://github.com/ali-issa)! - The storage contract checks obligation 12: a cursor `list` issued in one scope is refused in another
  with keyset-core's `INVALID_CURSOR`, reason `context`, though both scopes send the same request.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`f8e652c`](https://github.com/nizam-os/kit-ts/commit/f8e652cde529ec1c0fdcfdd83c64bd0e471d0210) Thanks [@ali-issa](https://github.com/ali-issa)! - `Infer`, `ErrorCatalog`, and `errorCatalog` constrain their resources by the new
  `AnyDeclaredResource` type, the members every declared resource records, instead of the wide
  `DeclaredResource`. TypeScript checks a type argument's constraint with error reporting on, and
  against the wide type it recomputed a failed check of the definer context on every reference. On a
  111-table schema, 20 `Infer<typeof X>` aliases took 1.05 s and 577 MB instead of 0.19 s and 130 MB,
  and an exported `ErrorCatalog<...>` annotation took 5.4 s and 2.4 GB instead of 0.32 s. Constrain
  your own type helpers by `AnyDeclaredResource` too.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`d6c2a48`](https://github.com/nizam-os/kit-ts/commit/d6c2a489b7edb43972c35f99a817235df7615592) Thanks [@ali-issa](https://github.com/ali-issa)! - List the Atomic Operations endpoint in the OpenAPI document. When a listed resource declares
  `create`, `update`, or `remove`, `openapi()` lists `POST <base>/operations` (operation id
  `atomic:operations`) under the extension's media type: a request schema of each operation the
  processor runs for each resource, with the new `<type>.local`, `<type>.atomic-add`, and
  `<type>.atomic-update` components; a 200 of `atomic:results` and a 204 where an operation can answer
  them; and the error responses of the processor and of every write. Collections under different
  bases, or one at the endpoint's path, throw `TypeError`, as the routes do. `DEFAULT_MAX_OPERATIONS`,
  the processor's default limit, is exported from `@nizam-os/jsonapi-core/atomic` and
  `@nizam-os/hono-jsonapi/atomic`.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`8b5e206`](https://github.com/nizam-os/kit-ts/commit/8b5e206bab7c144acf9fe0d5bc992707b1700f54) Thanks [@ali-issa](https://github.com/ali-issa)! - Add `isResourceBehavior`, true for exactly what `defineResource` returned and never for a copy, and
  `scopeColumnOf`, the column a declaration scopes its table by, so a runtime can check both at boot.

- [#123](https://github.com/nizam-os/kit-ts/pull/123) [`82eca45`](https://github.com/nizam-os/kit-ts/commit/82eca45cade231500a5d75f2ba3d0d0cf72ee812) Thanks [@ali-issa](https://github.com/ali-issa)! - A declared resource's `resource` now carries its client types, so
  `TypesOf<typeof Contacts.resource>` from `@nizam-os/jsonapi-core` holds the read types as JSON
  attributes, each relationship's target type, the filter operators and includes by public name, that
  it takes sparse fieldsets, whether the declaration has `search`, the create and update validators'
  inputs (`never` for an operation it does not serve), the members each write holds, and `clientIds`.
  Types only: nothing changes at runtime.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`f4a53b4`](https://github.com/nizam-os/kit-ts/commit/f4a53b407ab4cdcb3245755ca03bb2c436a61a9d) Thanks [@ali-issa](https://github.com/ali-issa)! - `defineCodec` and `defineValidator` declare the values a definer's `codecs` and `validators` hold.
  
  - `defineCodec({ types, schema, fixtures, description })` is the public facet of a column type that
    has no wire form, such as `tstzrange`, `bytea`, or pgvector's `vector`.
    `defineValidator({ schema, fixtures: { accept, reject }, description })` is the twin of a CHECK
    the catalog cannot translate; for a CHECK over several columns its input is an object of the
    members by public name, each relationship as its id.
  - Fixtures are mandatory: without them, with an empty list, or with a value of another type the call
    does not compile. When the module loads, the schema must accept every fixture, and a validator's
    schema must reject every `reject` fixture; a disagreement throws a `TypeError` naming the fixture.
  - Schemas come from `zod` or `zod/mini`, 4.5 or later, a new peer dependency, and must parse
    synchronously.
  - The definer takes only values these functions returned: a codec or validator written by hand fails
    `tsc` and throws at startup.
  - `StorageCodecs<typeof codecs, TStored>` types the storage facet an adapter implements, one `read`
    and `write` per codec.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`e8f8ade`](https://github.com/nizam-os/kit-ts/commit/e8f8adebe8870015d0127b52593f574ebddcb916) Thanks [@ali-issa](https://github.com/ali-issa)! - First release of `@nizam-os/resource-core`, starting with the definer and the declaration.
  
  - `createDeclareResource({ catalog, codecs, validators, scopes, domains, links, page })` binds a
    `declareResource(table, declaration)` to the public catalog `@nizam-os/pg-catalog` extracts and to
    the application's registries. It refuses the full catalog, since declarations reach browsers, and
    a catalog of another format.
  - A declaration names its table, fields, relationships, constraints, codecs, validators, and scope
    by their database and registry names, and `tsc` checks each one at the option that holds it: an
    unknown name, an access the column or the operations do not allow, a column without a wire form
    and no codec, a foreign key that does not reference a public table's primary key, an id column
    that cannot carry a resource id, `clientIds` on a key that takes no client value, and a CHECK
    without a rule that a written column reaches and no validator covers.
  - The same rules run when the module loads, so JavaScript callers get a `TypeError` whose message
    starts with the option's path.
  - `declareResource` returns a frozen resource holding the table and a frozen copy of the
    declaration. Relationship targets are functions read lazily, so declarations may reference each
    other in either order and across modules.

- [#136](https://github.com/nizam-os/kit-ts/pull/136) [`e11a6cc`](https://github.com/nizam-os/kit-ts/commit/e11a6cc1ff9f68dd56a3997acfdf6acec782e283) Thanks [@ali-issa](https://github.com/ali-issa)! - Field metadata states a default's value: `default` is a `FieldDefault`, `{ literal, value }`, where
  `value` is the constant as a read gives it (a `boolean[]` column's `{t,f}` is `[true, false]`), a
  relationship's as its id's text, and `undefined` for an expression such as `now()`, a codec's field,
  or a constant outside the read form. A form starts a member from it without reading PostgreSQL's
  text itself.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`cec37c1`](https://github.com/nizam-os/kit-ts/commit/cec37c138fabaf2e37703e39b2b605368b95015e) Thanks [@ali-issa](https://github.com/ali-issa)! - `declareResource` refuses a declaration whose derived keyset or JSON:API definition
  `@nizam-os/keyset-core` or `@nizam-os/jsonapi-core` would refuse, in types and at runtime. A
  `filter` lists at least one operator, each once. The public name of a member that filters or sorts
  is a keyset-core field name (ASCII letters, digits, `_`, and `-`), and a filtered member is not
  named `or`, nor `q` when the resource has `search`. `sort.default` names each field once. A search
  configuration is an unqualified name keyset-core accepts, such as `english`. The primary key has a
  type keyset-core can order pages by. Each mistake fails `tsc` at the option and throws `TypeError`
  naming it, such as
  `notes.fields.size.filter: public name "größe" is outside @nizam-os/keyset-core's field names (^[A-Za-z0-9][A-Za-z0-9_-]*$)`.
  Declarations that filter or sort by a member named with a letter outside ASCII, or that list
  `filter: []`, no longer compile; give the member `as` or drop the empty list.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`0a5fe97`](https://github.com/nizam-os/kit-ts/commit/0a5fe9772396d7514147806453153cf1f3ac3547) Thanks [@ali-issa](https://github.com/ali-issa)! - Every declared resource carries the two definitions a collection endpoint needs. `resource` is the
  `@nizam-os/jsonapi-core` resource: the attributes, the relationships, `serialize` for public rows,
  the create and update validators of the served operations, and the declared sorts, filters with
  their operators, includes, `filter[q]` search, and page bounds; it is built on first read, since it
  names each relationship target's type. `keyset` is the `@nizam-os/keyset-core` definition without
  the cursor: the same filters and sorts with each column's keyset type, the search column and
  configuration, the key `id`, and the default sort, which a server passes to its own
  `createDefineKeyset({ cursor })`. Both use the same public names and the same resolved page bounds,
  so what `parseQuery` accepts the keyset plans, and both are typed from the declaration: the keyset's
  request names exactly the declared sorts and filters, and the resource carries the type, member
  names, row, and create and update attribute types.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`2a56a8e`](https://github.com/nizam-os/kit-ts/commit/2a56a8ea4a88b0fa88650d5be15fb7e8277dc43f) Thanks [@ali-issa](https://github.com/ali-issa)! - The definer's `domains` can rename the code of any domain CHECK, including one whose rule the
  schemas enforce: `domains: { short_text: { short_text_check: { code: 'NAME_LENGTH' } } }`.
  
  - A CHECK with a rule takes an entry of `code` alone; a validator there still fails `tsc` and throws
    `validator: the CHECK has a rule, which enforces it already`.
  - A CHECK without a rule still needs its validator, and an entry without one now reads
    `validator: a CHECK without a rule needs a validator`.
  - The given code reaches the declared resource's `errors`, `errorCatalog`, and `constraintError`,
    which maps PostgreSQL's refusal by that CHECK to it.
  - When a domain CHECK's derived code is not A-Z, 0-9, and `_`, or repeats another code of the
    resource, the message now points at `code` in the definer's `domains` instead of a migration.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`ad320bf`](https://github.com/nizam-os/kit-ts/commit/ad320bfe3cce31a4d4e0d0f670f8fac51797ed1e) Thanks [@ali-issa](https://github.com/ali-issa)! - Declared resources carry the error codes clients can cause, and `errorCatalog` assembles them into
  one `@nizam-os/ban-core` catalog.
  
  - `errors` on each resource maps every derived code to a frozen `{ status, title, kind, fields }`
    with literal types: one code per constraint over a member, per NOT NULL member an operation
    writes, per CHECK of a domain a member passes, and for the primary key with `clientIds`. CHECK and
    NOT NULL give 422 Invalid Attribute, UNIQUE, PRIMARY KEY, and EXCLUDE 409 Conflict, and FOREIGN
    KEY 404 Related Resource Not Found. `fields` lists the public members the error points at.
  - The scope column makes no code and is never pointed at, since the server writes it: a UNIQUE over
    `(organization_id, email)` points at `email`, the scope's foreign key has no code, and `code` on
    it is refused.
  - A domain CHECK's code is the definer's domain rule `code`, or its constraint name upper-cased.
    `declareResource` refuses a resource whose codes repeat or fall outside A-Z, 0-9, and `_`, naming
    the constraints behind them.
  - `errorCatalog(resources, appErrors?)` returns the listed resources' codes, then `QUOTA_EXCEEDED`
    (403), then the application's codes, frozen, to spread into `createBan({ errors })` next to
    `ERROR_CATALOG`. It refuses, in one `TypeError`, a resource listed twice, two resources of one
    type, a code two constraints derive or that `@nizam-os/ban-core`, `@nizam-os/jsonapi-core`,
    resource-core, or the application already has, and a relationship whose target is not listed;
    `tsc` reports the last at the listed resource. The `ErrorCatalog`, `ErrorEntry`, and
    `ConstraintKind` types describe the results.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`cd69e52`](https://github.com/nizam-os/kit-ts/commit/cd69e525896f7261d34de2710c585d0b7b65c7d9) Thanks [@ali-issa](https://github.com/ali-issa)! - Declared resources gain `fields`, the metadata of each public field and relationship for forms,
  documentation, and clients: wire type, format, fraction digits, nullability, whether a create must
  carry it, the default PostgreSQL applies, the folded limits (numeric bounds as decimal strings,
  `patterns` read with the flags `su`), options, an array's elements, the target, filter operators,
  sortability, and codec. It is read from the specs the schemas are built from, so a value the
  metadata admits is one the schemas accept; validators are not described. A relationship describes
  its id, and a `bool` key's ids are `true` and `false`. Over a typed catalog each entry is typed,
  with literal names, requiredness, and option labels, and declaring a resource computes none of it.
  The new types are `FieldFacts`, `FieldLimits`, `ItemMeta`, and `WireType`.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`eed8b0b`](https://github.com/nizam-os/kit-ts/commit/eed8b0b4c5ee78eb39f13655d79d631d77eeb9df) Thanks [@ali-issa](https://github.com/ali-issa)! - `declareResource` checks each member's `filter` and `sort` against `@nizam-os/keyset-core`'s
  operator table, in types and at runtime: the operators must be ones the member's keyset type takes,
  `isNull` needs a column that can be null, `json`, `jsonb`, and codec fields neither filter nor sort,
  and an array does not sort. A text column with a CHECK `IN (...)` filters as an enum. Each mistake
  fails `tsc` at the member and throws `TypeError` naming it, such as
  `contacts.fields.tags.filter: operator "gt" is not available for array fields`, so a filter a
  declaration allows is one the list planner can run. Declarations that filter a type with an operator
  it lacks no longer compile.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34) Thanks [@ali-issa](https://github.com/ali-issa)! - Every declared resource now exposes the form of its ids: `schema.id`, a Zod schema, and
  `validate.id`, its Standard Schema validator, which take an id in its key's form. The JSON:API
  resource of a declaration with `clientIds` validates a create's client id with it, so an id outside
  the form is a 422 at `/data/id` instead of a 500 or a key stored under another spelling. Check a
  URL's id with `schema.id` before querying and answer `NOT_FOUND` when it refuses: no row has that
  id.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4) Thanks [@ali-issa](https://github.com/ali-issa)! - A resource id now takes every spelling its key's write form takes and is output in the spelling the
  server sends: `schema.id` and `validate.id` give a `uuid` in lower case, a `timestamp` with `T` and
  its shortest fraction, a `timestamptz` in UTC with `Z`, a `numeric(p, s)` with s fraction digits, a
  `bpchar(n)` padded to n characters, and a `real` as PostgreSQL prints it, so the ids a server sends
  compare as text. Look a URL's id up with `schema.id`'s output. A `citext` key, a `numeric` key
  without a scale, and a `bpchar` key without a length keep the text sent, since their values compare
  more coarsely than any spelling. The JSON:API resource carries `validate.id` for every declaration,
  so an update whose document spells the URL's key another way is no conflict.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`e7949ba`](https://github.com/nizam-os/kit-ts/commit/e7949ba2ff768c3950259b061463488e4d7c09de) Thanks [@ali-issa](https://github.com/ali-issa)! - `keysetRequest(resource, query)` on `@nizam-os/resource-core/server` builds the keyset request of a
  query `parseQuery` parsed with a declared resource's JSON:API definition, typed by its keyset
  definition, so a list route hands keyset-core what it takes. It gives `isNull` its boolean and a
  single `in`, `nin`, `between`, or array value its list, joins the conditions and the `filter[or][n]`
  groups, passes `search` and the page as they are, and leaves `sort` out of a query without one, so
  the declared default applies. Every other value goes to keyset-core unchanged, which refuses a value
  of the wrong type with its own `InvalidFilterValueError`.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`659c973`](https://github.com/nizam-os/kit-ts/commit/659c973dbed17e51e863e21e0c6886ae3fd01a13) Thanks [@ali-issa](https://github.com/ali-issa)! - The storage contract suite checks `list` (obligation 5). Five tasks are paged two at a time, each
  request walked with `next` and back with `prev`: the declared default sort; every sortable field in
  both directions, nulls last, ties broken by the key; every declared operator on a value of its
  keyset type, among them an `int8` past 2^53, `timestamptz` values a microsecond apart, an enum that
  sorts in the order of its labels, and array elements that need quoting; search in websearch mode; a
  cursor that resumes after its row though the row was removed since; the page bounds; and a
  partitioned table ordered by its `int8` key. The fixture gains a migration with an enum, an `int4`,
  and a generated `tsvector`, and its declarations filter, sort, and search. `StorageListRequest` is
  keyset-core's request without relation filters, what a declared resource's keyset definition plans,
  so an adapter hands it to `defineKeyset(resource.keyset).plan` as it is.

- [#136](https://github.com/nizam-os/kit-ts/pull/136) [`f62c925`](https://github.com/nizam-os/kit-ts/commit/f62c925720dbfa3b0f69f306be7feb8aaf201e1e) Thanks [@ali-issa](https://github.com/ali-issa)! - `localizeIssues(messages)` returns the text of an issue of `write.create` or `write.update` on a
  resource type: the detail `localizeErrors` gives the error object the server makes of the same
  issue, so a form that validates before it sends shows the words the server would answer with, in the
  locale the message functions read when it renders. Each text is computed when it is asked for.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`4e920da`](https://github.com/nizam-os/kit-ts/commit/4e920da161a11c6b27360232d14756aa36718b8d) Thanks [@ali-issa](https://github.com/ali-issa)! - Error responses can be localized with the application's i18n library.
  `defineMessages(resources, appErrors, messages)` takes one object of message functions, so Paraglide
  JS's compiled messages fit as they are: a title and a detail for every code no resource derives and
  for every constraint kind the resources have, a message for each of the thirteen issue kinds, a
  label for every public member, and a label for every option. A missing or unknown key fails `tsc`,
  and so does a message whose variables, in any locale, are not the inputs its kind receives (`field`,
  `fields`, `limit`, `values`, `format`, `type`). `localizeErrors(messages, { resource })` is a
  `transform` for the ban handler that rewrites each JSON:API error object's `title` and `detail` from
  its code, its item's issue kind, the member its pointer names, and the labels of a constraint's
  members and of the allowed options, never echoing a member name the request invented; codes,
  statuses, pointers, and `meta` stay. The locale is the message functions' own, so with Paraglide it
  is the one `paraglideMiddleware` resolved. `defaultMessages(resources, appErrors?)` gives complete
  English messages. The new types are `MessagesFor`, `Messages`, `Message`, `Label`, `ErrorText`,
  `CodeInputs`, `ConstraintInputs`, `IssueInputs`, `LocalizeErrorsOptions`, and `ErrorTransform`.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`a9ba280`](https://github.com/nizam-os/kit-ts/commit/a9ba280088ac37123393530c449bd765542bc206) Thanks [@ali-issa](https://github.com/ali-issa)! - Declared resources carry their public names, derived from the database names as JSON:API clients
  expect them.
  
  - `names` on each resource holds the type, the primary key column, and both directions of every
    mapping as `ReadonlyMap`s: field and relationship names to columns and back, and error codes to
    constraint names and NOT NULL keys and back. The `ResourceNames` type describes it.
  - A field is named by camelCase of its column, the conversion of Kysely's `CamelCasePlugin`, and a
    relationship by camelCase of its column without `_id`. The type is the table's name, and a code is
    the rule key upper-cased. `as` overrides a name, and `code` overrides a code.
  - `tsc` reports a name JSON:API refuses, a member named `type`, `id`, `lid`, `constructor`, or
    `prototype`, two members under one name, a relationship column without `_id` and no `as`, and a
    given code that is not A-Z, 0-9, and `_`, repeats another code, or sits on a key clients cannot
    violate. Each message names the option to set.
  - The runtime check of each declaration reports the same mistakes, and also those TypeScript leaves
    to it because checking them in types costs more than they catch on real catalogs: a derived code
    outside the pattern or repeated, a column only a quoted identifier can name, and two columns a
    Unicode case mapping gives one name.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`f662dc3`](https://github.com/nizam-os/kit-ts/commit/f662dc308235224e2f1d91fb2c70fed568be9e24) Thanks [@ali-issa](https://github.com/ali-issa)! - A NOT ENFORCED CHECK or foreign key (PostgreSQL 18) no longer reaches clients: the schemas apply no
  rule of it, so they accept every value the database stores; it needs no validator and refuses one;
  and it derives no error code, so `code` on its key is refused. An unenforced foreign key still
  declares a relationship. The definer takes public catalogs of format 3, which carry `enforced`.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`8a87a9f`](https://github.com/nizam-os/kit-ts/commit/8a87a9fa2feada78b4a7a5a490a36c19fdd7eb85) Thanks [@ali-issa](https://github.com/ali-issa)! - New `@nizam-os/resource-core/openapi` entry. `openapi(resources, options)` builds the OpenAPI 3.1.2
  document of the resources you serve: every declared operation and relationship endpoint, its query
  parameters from the declared filters, sorts, includes, and page bounds, its JSON:API documents, and
  an error response for each status it can answer with, listing its codes, whose error objects, and
  the response of each status that carries one code, are shared components. The schemas admit every
  request the server accepts. Name the codes of your rules, quotas, and middleware in `codes`, and
  give business examples in `examples`, which must pass the schemas the server applies, or the call
  throws. `surfaceOf(resources)` records what clients depend on as sorted JSON to commit next to the
  catalog, and `diffSurfaces(before, after)` lists every change between two surfaces, each marked
  breaking or safe.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`332bb8d`](https://github.com/nizam-os/kit-ts/commit/332bb8da391d968083a224102c04f6ad25da662a) Thanks [@ali-issa](https://github.com/ali-issa)! - `oracleCases(resources, { storage })`, from the `testing` entry, lists what
  `pg-catalog rules --check` writes into the database for a registry, and how it judges each write.
  
  - Each member a client writes or reads tries its boundary fixtures in a copy of its column holding
    its NOT NULL and the CHECKs its schema enforces; the write schema and the database must agree, and
    every stored value must pass the read schema.
  - Each validator tries its fixtures against the CHECK it stands for, once per CHECK: an `accept`
    fixture must be stored, and a `reject` fixture refused by that CHECK, not by the column's type.
  - Each codec writes its fixtures through a storage codec over text and must read them back as
    themselves.
  - A fixture is written as itself or not at all: one with no text form, one JSON would write as
    another value, or one its storage codec throws on is reported with the reason, never sent.
  - The registry checks run first, so a registry mistake reads `oracleCases: ...`, and a codec without
    a storage codec throws a `TypeError` naming it.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`f475362`](https://github.com/nizam-os/kit-ts/commit/f475362adca6a54d11a4ebaf5610b079a3fab9d6) Thanks [@ali-issa](https://github.com/ali-issa)! - Violations raised through a partitioned table now map to the declared codes of that table.
  PostgreSQL names the partition that stores the row, and for a primary key, UNIQUE, or EXCLUDE
  violation the partition's own index, so these violations used to fall through to the generic
  mapping. Partitions are often created after the migrations ran, so the database resolves them
  instead of the catalog:
  
  - `partitionViolation(thrown, { resource, operation })` returns the names an integrity violation
    carries when they are not the resource's table.
  - `StorageAdapter.partitionRoot(names)` is a new adapter method: it answers with the partitioned
    table at the top of the partition's tree and that table's name for the constraint, and `undefined`
    for a table that is not a partition. `PARTITION_ROOT_SQL` is the query that answers it, and the
    storage contract checks it as obligation 11 on a two-level partition in another schema.
  - `constraintError` takes the answer as the `partition` option. The new `ViolationNames` type
    describes both.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`a9a23d3`](https://github.com/nizam-os/kit-ts/commit/a9a23d3eb014c958361ec7c714cd5c212020cef9) Thanks [@ali-issa](https://github.com/ali-issa)! - `relationshipTargets(resource, write, { pointer })` from `@nizam-os/resource-core/server` lists the
  rows a create or an update references, each with the error its foreign key's code makes for a
  missing row. PostgreSQL checks foreign keys without row security, so a runtime looks each target up
  in the actor's scope and answers one the actor cannot see exactly as a missing one, which keeps a
  write from referencing another tenant's row or learning which ids it holds.
  `contractFixture.catalog` from `@nizam-os/resource-core/testing` is now typed as the extracted
  catalog, so a test can declare its own resources over it.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`227c2ac`](https://github.com/nizam-os/kit-ts/commit/227c2ac67b1c81e94c848bf29093f05d5c535251) Thanks [@ali-issa](https://github.com/ali-issa)! - The runtime contract gains `transaction(actor, work)`: `work` receives the domain `as(actor)` gives,
  its operations share one transaction, one at a time, and `transaction` resolves to what `work`
  resolved to once it committed. A runtime that implements the contract now provides it.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`829408d`](https://github.com/nizam-os/kit-ts/commit/829408dfca7d6b27b43e688ebc6fe829e0e8c44d) Thanks [@ali-issa](https://github.com/ali-issa)! - Declared resources carry Zod schemas derived from the catalog and the declaration, so clients and
  servers refuse what PostgreSQL would refuse or store differently.
  
  - `schema.read`, `schema.create`, and `schema.update` validate attributes by public name, and
    `linkage` holds the same three for relationships, each `{ type, id }`. `create` requires exactly
    the columns PostgreSQL requires on insert, `update` requires none, and `read` strips unknown keys,
    so clients keep working when a field is added. No schema fills in a default.
  - A field's schema is its column's wire form, then its domain's rules, the CHECKs the catalog
    translates, its nullability, and its validators. The wire forms refuse excess fraction digits for
    `numeric(p, s)` and for `timestamp(p)` and `timestamptz(p)`, trailing spaces past `varchar(n)`,
    U+0000, unpaired surrogates, and other spellings of `int8` and `numeric` values, which travel as
    decimal strings.
  - `validate.create` and `validate.update` are Standard Schema validators of the attributes, and
    `write.create` and `write.update` of a resource object as `@nizam-os/jsonapi-core` parses it,
    where the CHECKs over a field and a relationship run. Their issues are `ResourceIssue`s, named by
    a JSON Schema keyword from `ISSUE_KINDS` or by a constraint's code, with constant messages that
    never repeat request data.
  - `tsc` checks that each validator accepts what its rule hands it: the field's value, `null`
    included for a nullable column, a relationship's id, or an object of them by public name; and that
    a domain's validator accepts every value of the domain. A domain rule may give `code`.
  - `defineCodec` refuses a schema that accepts `undefined` or `null`: a member a client leaves out
    stays out, and the column's nullability decides `null`.
  - `Infer<typeof Resource>` gives the output types of all six schemas, with enum columns and `enum`
    rules narrowed to their values.
  - The new `@nizam-os/resource-core/testing` entry exports `boundaryFixtures(resource)`: labeled wire
    values at and next to every limit of each field and relationship, which the package's own tests
    run through PostgreSQL 14 and 18.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`a2ded61`](https://github.com/nizam-os/kit-ts/commit/a2ded61e43cefd3157c1a1f0e0ffd26237d501cf) Thanks [@ali-issa](https://github.com/ali-issa)! - A new `@nizam-os/resource-core/server` entry holds what a server composes over the declarations,
  typed by the application's own permissions, quotas, services, and error codes.
  
  - `createDomainDefiners<TDomain>()` returns `definePolicy` and `defineResource`. A policy holds one
    predicate per operation and per includable relationship and allows only on exactly `true`; a
    missing predicate denies, and `denyAll` is the policy of a resource without one. A denied `list`
    or `create` is `FORBIDDEN`, a denied `get`, `update`, or `remove` `NOT_FOUND`, as for a missing
    row. A behavior gives each writing operation its rules, effects, quota on create, and `values`,
    the server values `tsc` requires exactly when the table has columns no client member covers.
  - `reject(code, { fields, detail })` refuses from a rule with one of the application's codes, and
    `rejectionError` builds its error. `defineScope` and `scopeValues` bind tenant scopes to the actor
    and to the session parameters row security reads; `defineQuota` and `quotaExceeded` give
    `QUOTA_EXCEEDED`, failing closed; `defineEvent` declares versioned events whose payloads any
    Standard Schema validates.
  - `constraintError(thrown, { resource, operation, pointer })` gives the declared code of a
    PostgreSQL integrity violation from any supported driver, with an item per member and the driver
    error as `cause`, or `undefined` for what the ban's own mapping should answer. Every integrity
    violation of a remove is `CONFLICT`.
  - `StorageAdapter<TTransaction>` is the contract a storage adapter implements, `lock` included,
    which holds the row an update or a remove decides on until the transaction ends.
    `@nizam-os/resource-core/testing` adds `storageContract(harness)`, cases named after each of the
    ten obligations, concurrent ones among them, and `contractFixture`, the schema, seed, catalog, and
    declarations they run on.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`c052bd8`](https://github.com/nizam-os/kit-ts/commit/c052bd8a528012779deea2c20026f653a0afe7f0) Thanks [@ali-issa](https://github.com/ali-issa)! - `defineScope` takes a session parameter of two or more parts, such as `app.user.organization_id`, as
  PostgreSQL does, so a scope binds to row security policies that read such a name.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`3449a4a`](https://github.com/nizam-os/kit-ts/commit/3449a4abef916ab3cb2fbf32ea3a086a7fb00794) Thanks [@ali-issa](https://github.com/ali-issa)! - A committed surface can be read back safely.
  
  - `surfaceOf` writes the surface's `format` (`SURFACE_FORMAT`, 1) first, raised whenever the surface
    changes shape.
  - `parseSurface(value)` reads a surface back from JSON and throws a `TypeError` naming the first
    member that is wrong, or a format it does not read, so a hand edit or an old snapshot fails
    clearly instead of misleading `diffSurfaces`.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`248e80b`](https://github.com/nizam-os/kit-ts/commit/248e80bfaa669dc9ebbe1453a5402e37327faa94) Thanks [@ali-issa](https://github.com/ali-issa)! - A unique index that no constraint backs derives an error code like a UNIQUE constraint, partial or
  not, and takes `code` in `rules`: `contacts_active_name_unique` on `(organization_id, name)` where
  `status = 'active'` gives a 409 `unique` entry that points at `name`. The definer takes public
  catalogs of format 2, which `@nizam-os/pg-catalog` extracts with the unique indexes in them; a full
  catalog still fails `tsc` with the message that asks for the public catalog.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152) Thanks [@ali-issa](https://github.com/ali-issa)! - The JSON:API resource a declaration derives now lists the members each write accepts by their
  access: a create takes `readWrite`, `immutable`, and `write` members, an update `readWrite` and
  `write` ones. A request that carries a `read` member, or an `immutable` member on update, is now a
  403 `FORBIDDEN` at the member instead of a 422, as JSON:API requires for an unsupported update, on
  the resource routes, the relationship routes, and in atomic operations alike.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`6d8a03e`](https://github.com/nizam-os/kit-ts/commit/6d8a03ef03534c724778d40068450b7bc63425e1) Thanks [@ali-issa](https://github.com/ali-issa)! - `@nizam-os/resource-core/server` now holds the runtime contract hosts and workers take:
  `ResourceRuntime`, `RuntimeResources`, `Domain`, `ResourceOperations`, `ResourceInput`, and
  `ListOptions`, so code given a runtime types it without Kysely or a driver.
  `@nizam-os/kysely-resource` re-exports them, so its imports keep working, and its runtime now lists
  the declared resource of each behavior as `runtime.resources`, in the order of `options.resources`.

### Patch Changes

- [#136](https://github.com/nizam-os/kit-ts/pull/136) [`b417552`](https://github.com/nizam-os/kit-ts/commit/b4175527fa26aa1f36ca68fddc4e0d49a74a7d09) Thanks [@ali-issa](https://github.com/ali-issa)! - The Kysely storage adapter reads a `char(n)` member, key, or relationship padded to n, as PostgreSQL
  prints it and as its read form and `schema.id` spell it. A cast to text had stripped the padding, so
  a stored `'ab  '` read as `ab`, while an array of `char(n)` kept it. The storage contract's fixture
  gains `labels`, keyed by a `char(4)` client id, and gives `tasks` a `char(4)` code and a
  relationship to a label, so the contract suite fails an adapter that strips the padding or reads a
  null one as the empty string.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`48677cf`](https://github.com/nizam-os/kit-ts/commit/48677cf9f997eb934d9b895ebfe26e38b3b43989) Thanks [@ali-issa](https://github.com/ali-issa)! - `list` orders a key that is not nullable without a null placement, so an index of the scope column,
  the sort columns in their directions, and the key starts each page at its cursor however deep it is.
  The READMEs give the index advice with measurements on PostgreSQL 14.

- [#103](https://github.com/nizam-os/kit-ts/pull/103) [`0cb082d`](https://github.com/nizam-os/kit-ts/commit/0cb082d3939b6142d2daa2a1ebc5cc89db3591ec) Thanks [@ali-issa](https://github.com/ali-issa)! - The oracle behind `pg-catalog rules --check` reads the elements of a `boolean[]` column as
  PostgreSQL prints them, `t` and `f`, instead of reading every element as `false` and reporting a
  disagreement the database never had; a text that is no boolean is now unrepresentable. The storage
  contract's `tasks` gains a `boolean[]` column, so the contract suite fails an adapter that misreads
  one.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`4fe1af3`](https://github.com/nizam-os/kit-ts/commit/4fe1af3df37ed4411e64378ba87150321f20da18) Thanks [@ali-issa](https://github.com/ali-issa)! - `boundaryFixtures` takes `AnyDeclaredResource`. Against the wide `DeclaredResource`, TypeScript
  compared every typed resource with the definer's context member by member, so taking the fixtures of
  each resource of a 111-table schema tripled its instantiations and check time; it now costs a few
  hundred instantiations.

- [#123](https://github.com/nizam-os/kit-ts/pull/123) [`97f3c1c`](https://github.com/nizam-os/kit-ts/commit/97f3c1cf930b9ad71afef5637739faef100d2b60) Thanks [@ali-issa](https://github.com/ali-issa)! - `ClientTypesOf` is exported, so a module that exports a declared resource's `resource` compiles with
  `declaration: true`.

- [#136](https://github.com/nizam-os/kit-ts/pull/136) [`c7efc14`](https://github.com/nizam-os/kit-ts/commit/c7efc1494831b0b206dffbb78630a3f403fb67c7) Thanks [@ali-issa](https://github.com/ali-issa)! - `declareResource` refuses a relationship whose foreign key spells ids unlike the key it references,
  at compile time and with a `TypeError`: a `char(n)` of another length, a `numeric` of another scale,
  a `float8` to a `real`, or a string type to a `char(n)`. PostgreSQL takes such a foreign key, but
  the relationship reads as its column's text, so its linkage would not name the target's id as the
  target spells it, and an include would return targets the document's linkage does not identify. The
  integers spell alike, as do `text` and `varchar`.
- Updated dependencies [[`f6568c1`](https://github.com/nizam-os/kit-ts/commit/f6568c1b4448a9e092f9f7132601c6f48b404c69), [`890844a`](https://github.com/nizam-os/kit-ts/commit/890844ae14747d4b64a38061cd31fd03484c108d), [`2ff6270`](https://github.com/nizam-os/kit-ts/commit/2ff6270ed3751cc04cafc4aeaf4d31cf6e0291b2), [`50b1e6a`](https://github.com/nizam-os/kit-ts/commit/50b1e6a32cb2c1bf6f95c1df4f9304da114f27dd), [`eeff0dd`](https://github.com/nizam-os/kit-ts/commit/eeff0dd61a32580458e85d5c22501e77210e079d), [`a2ded61`](https://github.com/nizam-os/kit-ts/commit/a2ded61e43cefd3157c1a1f0e0ffd26237d501cf), [`3ad2c60`](https://github.com/nizam-os/kit-ts/commit/3ad2c60449ed8d0d974cf036cf292cd47e7efc51), [`a9ba280`](https://github.com/nizam-os/kit-ts/commit/a9ba280088ac37123393530c449bd765542bc206), [`5102bf1`](https://github.com/nizam-os/kit-ts/commit/5102bf1b9dbe393be599c491c937aef98387ebee), [`f662dc3`](https://github.com/nizam-os/kit-ts/commit/f662dc308235224e2f1d91fb2c70fed568be9e24), [`248e80b`](https://github.com/nizam-os/kit-ts/commit/248e80bfaa669dc9ebbe1453a5402e37327faa94), [`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45), [`ebbd31f`](https://github.com/nizam-os/kit-ts/commit/ebbd31fddc3a17e259958e2397ec93bf4f6fd154), [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34), [`6084c4b`](https://github.com/nizam-os/kit-ts/commit/6084c4b681ab940900ef71f049bf07a1548f82f4), [`a3286fe`](https://github.com/nizam-os/kit-ts/commit/a3286fef943a3de401c452584c496b59ab184b70), [`231501b`](https://github.com/nizam-os/kit-ts/commit/231501b7a6a1afe8eac359b50b7a2d99a7cf59b3), [`6d2b017`](https://github.com/nizam-os/kit-ts/commit/6d2b017fb9e8c62ce9fbb2883a3beee74a989075), [`13c1aa9`](https://github.com/nizam-os/kit-ts/commit/13c1aa9cec464c68c0bfcfe82fb05b82429a8b85), [`33f9060`](https://github.com/nizam-os/kit-ts/commit/33f9060871baf54ebd5a09b66194a7b7098f9c19), [`d08e7ee`](https://github.com/nizam-os/kit-ts/commit/d08e7ee00764affee59a646a1e1ffcaf1ef1c554), [`97f3c1c`](https://github.com/nizam-os/kit-ts/commit/97f3c1cf930b9ad71afef5637739faef100d2b60), [`6ce0fba`](https://github.com/nizam-os/kit-ts/commit/6ce0fba5eb97a32c5a884c7c0f450adaba9104b2), [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4), [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152), [`cec37c1`](https://github.com/nizam-os/kit-ts/commit/cec37c138fabaf2e37703e39b2b605368b95015e), [`eed8b0b`](https://github.com/nizam-os/kit-ts/commit/eed8b0b4c5ee78eb39f13655d79d631d77eeb9df), [`e5a4317`](https://github.com/nizam-os/kit-ts/commit/e5a43172be2e8ed4c35168b26ebfecff4efece60), [`2485317`](https://github.com/nizam-os/kit-ts/commit/2485317ff47933f84f7c41557700dd4b9d358461), [`931eb37`](https://github.com/nizam-os/kit-ts/commit/931eb37c4b14b5edac7307b9c8e880fb2f12e6f6), [`fee2388`](https://github.com/nizam-os/kit-ts/commit/fee2388e2800091b3a91265a16d91371b65e10ec), [`48677cf`](https://github.com/nizam-os/kit-ts/commit/48677cf9f997eb934d9b895ebfe26e38b3b43989), [`6ff2097`](https://github.com/nizam-os/kit-ts/commit/6ff2097fead30c359ed8be7e521828d7a5cc8424), [`d6c2a48`](https://github.com/nizam-os/kit-ts/commit/d6c2a489b7edb43972c35f99a817235df7615592)]:
  - @nizam-os/jsonapi-core@0.1.0
  - @nizam-os/ban-core@1.0.0
  - @nizam-os/catalog-core@0.1.0
  - @nizam-os/keyset-core@0.1.0
