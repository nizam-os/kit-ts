# @nizam-os/jsonapi-core: implementation specification

- Status: normative for the 0.x line of `@nizam-os/jsonapi-core`, `@nizam-os/hono-jsonapi`,
  `@nizam-os/jsonapi-client`, and `@nizam-os/tanstack-query-jsonapi`; `docs/jsonapi/DESIGN.md`
  explains the why

The key words MUST, MUST NOT, SHOULD, and MAY are used as in RFC 2119. Every section names the
source file that implements it and the tests that prove it. When this document and the code
disagree, fix one of them in the same pull request. Clause references are to
[JSON:API 1.1](https://jsonapi.org/format/1.1/) unless a profile, extension, or RFC is named.

Contents

1. Public surface and module map
2. Documents
3. Media types and negotiation
4. Errors
5. Resource definitions
6. Query parsing
7. Document building
8. Cursor pagination
9. Request documents
10. Hono integration (`@nizam-os/hono-jsonapi`)
11. Atomic operations
12. Packaging
13. Constants
14. Test plan
15. The client (`@nizam-os/jsonapi-client`)
16. TanStack Query (`@nizam-os/tanstack-query-jsonapi`)
17. Atomic Operations from the client

---

## 1. Public surface and module map

Two packages, one repository (ADR 0013). `@nizam-os/jsonapi-core` is the framework-free core: every
module is a function over plain values (strings, parsed JSON, `URL`s) and none imports a web
framework or a runtime API beyond web standards. `@nizam-os/hono-jsonapi` is the Hono adapter: it
depends on `@nizam-os/jsonapi-core`, re-exports all of it (one import for a Hono application), and
adds the middleware, validators, response helpers, error handlers, and the operations endpoint
(sections 10 and 11.1). Errors are [@nizam-os/ban-core](https://github.com/nizam-os/kit-ts) errors
(ADR 0014): `@nizam-os/jsonapi-core` depends on `@nizam-os/ban-core` and on nothing else;
`@nizam-os/hono-jsonapi` has two peer dependencies, `hono` and `@nizam-os/hono-ban`,
@nizam-os/ban-core's Hono adapter, through which its error handler renders (ADR 0002). Validators
are consumed through Standard Schema V1, whose interfaces are vendored in
`packages/jsonapi-core/src/internal/standard-schema-types.ts`, so installing either package never
pulls in Zod, Valibot, ArkType, or Ajv. The declarations name no type only the DOM library declares:
an error's `headers` are `BanErrorOptions['headers']`, the Fetch Standard's `HeadersInit` as
@nizam-os/ban-core vendors it, so a Node consumer compiles them with Node's types alone (14.1).

| Subpath                            | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nizam-os/jsonapi-core`           | Values: `defineResource`, `createDefineResource`, `relatedResource`, `resourcePaths`, `serializeResource`, `applyFields`, `identify`, `resourceDocument`, `collectionDocument`, `toOneRelationshipDocument`, `toManyRelationshipDocument`, `include`, `jsonApiObject`, `assertFullLinkage`, `isMemberName`, `isMemberPath`, `isAtMember`, `isExtensionMemberName`, `assertMemberName`, `BanError`, `isBanError`, `jsonApiBan`, `jsonApiError`, `errorItem`, `errorObjects`, `errorDocument`, `ERROR_CATALOG`, `ERROR_CODES`, `parseMediaType`, `parseAccept`, `isJsonApiMediaType`, `jsonApiParameters`, `formatJsonApiMediaType`, `negotiate`, `parseQuery`, `paginatedDocument`, `paginationLinks`, `pageMeta`, `itemCursorMeta`, `maxPageSizeExceededError`, `unsupportedSortError`, `unsupportedSort`, `rangePaginationNotSupportedError`, `invalidCursorError`, `invalidCursor`, `UNSUPPORTED_SORT_TYPE`, `MAX_SIZE_EXCEEDED_TYPE`, `RANGE_PAGINATION_NOT_SUPPORTED_TYPE`, `parseIdentifier`, `parseLinkage`, `parseResourceObject`, `parseCreateDocument`, `parseUpdateDocument`, `primaryData`, `parseToOneRelationshipDocument`, `parseToManyRelationshipDocument`, `toOneLinkage`, `toManyLinkage`, `JSON_API_MEDIA_TYPE`, `JSON_API_VERSION`, `ATOMIC_OPERATIONS_EXTENSION`, `CURSOR_PAGINATION_PROFILE`; and every type in sections 2, 3, 4, 5 (`ResourceTypes`, `TypesOf`, `JsonOf`, `InferredTypes`, `DefinitionOf`, `ResourcePaths`, and `ResourcePathsOptions` included, so a module that exports a definition emits declarations that name only exported types), 6.1, 7.2, 8, 9, with `Ban`, `BanError`, `ErrorItem`, and `ErrorStatusCode` re-exported from `@nizam-os/ban-core` |
| `@nizam-os/jsonapi-core/atomic`    | `operationsProcessor`, `assertOperationsContentType`, `errorAtOperation`, `parseOperationsDocument`, `DEFAULT_MAX_OPERATIONS`, and the types `AtomicOptions`, `ResourceHandlers`, `AnyResourceHandlers`, `RelationshipHandlers`, `OperationContext`, `OperationTarget`, `OperationCode`, `OperationResult`, `OperationsOutcome`, `OperationsProcessor`, `OperationsResultDocument`, `ResolvedResourceObject`, `RawOperation`, `MaybePromise`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@nizam-os/hono-jsonapi`           | Everything of `@nizam-os/jsonapi-core` (the same bindings), plus `jsonApi`, `respond`, `respondError`, `isJsonApiResponse`, `varyAccept`, `readDocument`, `queryValidator`, `bodyValidator`, `relationshipValidator`, `errorHandler`, `notFoundHandler`; and every type in section 10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@nizam-os/hono-jsonapi/atomic`    | Everything of `@nizam-os/jsonapi-core/atomic`, plus `atomicOperations`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@nizam-os/jsonapi-client`         | Section 15.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@nizam-os/tanstack-query-jsonapi` | Section 16.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

`e2e/jsonapi/package-surface.e2e.test.ts` asserts the exact value export list of all six subpaths
against the built packages, and that the adapter's re-exports are the core's own bindings.

Source layout. Every module with behavior has a sibling `*.test.ts`; contract types have
`*.test-d.ts`. Type-only modules (`types.ts` files, `standard-schema-types.ts`) and modules reached
only through their consumers (`input.ts`, `registry.ts`, `identifiers.ts`, `resource-members.ts`,
`format.ts`, `linkage.ts`, `query-capabilities.ts`, the atomic executors) are covered through those
consumers; coverage thresholds apply to all of `packages/*/src/`. Imports form a DAG
(`import/no-cycle` is enforced, type-only imports included); nothing under `packages/jsonapi-core`
imports `hono`, and `packages/hono-jsonapi` imports the core only through its package name.

```
packages/jsonapi-core/src/
  index.ts                       root entry
  internal/
    constants.ts                 section 13
    object.ts                    isRecord(), ownMember(), hasOwnMember(), ownEntry(), ownKeys(), compact(): prototype-safe reads
    pointer.ts                   pointer(), escapePointerToken(), pathFromPointer(): RFC 6901
    quotable.ts                  quotable(): the request text a detail may quote (4.4)
    standard-schema-types.ts     vendored Standard Schema V1 interfaces
  media-type/
    parse.ts                     parseMediaType(), parseAccept() (3.1)
    format.ts                    formatMediaType(), quoteParameterValue() (3.1)
    json-api.ts                  isJsonApiMediaType(), jsonApiParameters(), formatJsonApiMediaType() (3.2)
  negotiate/negotiate.ts         negotiate() (3.3)
  errors/
    catalog.ts                   ERROR_CATALOG, ERROR_CODES (4.1)
    json-api-error.ts            jsonApiBan, jsonApiError(), errorItem(), errorObjects(), errorDocument() (4.2)
  document/
    types.ts                     section 2
    member-name.ts               2.1
    serialize.ts                 serializeResource(), applyFields(), identify() (7.1)
    build.ts                     resourceDocument(), collectionDocument(), relationship documents, include(), jsonApiObject() (7.2)
    linkage.ts                   assertFullLinkage() (7.3)
  resource/
    types.ts                     section 5
    write-types.ts               ResourceValidators, WritableFieldsInit, WritableFields (5)
    define-resource.ts           defineResource(), relatedResource() (5.1)
    links.ts                     resolveLinks(): the links convention and its types (5.1)
    client-types.ts              ResourceTypes, TypesOf, JsonOf: what a client reads and writes (5.3)
    paths.ts                     resourcePaths(): the paths a definition's links name (5.4)
    create-define-resource.ts    createDefineResource() (5.1)
    query-capabilities.ts        query capability resolution (5.2)
  query/
    types.ts                     ParsedQuery and friends (6.1)
    input.ts                     toPairs(), groupByName() (6.1)
    parameter-name.ts            parseParameterName() (6.2)
    registry.ts                  registryOf(), resolveIncludePath() (6.3)
    parse-families.ts            include, fields, sort, page (6.4 to 6.7)
    parse-filter.ts              filter (6.8)
    parse-query.ts               parseQuery() (6)
  pagination/
    paginated.ts                 paginatedDocument() (8.1)
    links.ts                     paginationLinks(), pageMeta(), itemCursorMeta() (8.2, 8.3)
    errors.ts                    the profile's error objects (8.4)
  request/
    types.ts                     RequestDocument, RequestResourceObject, ParseResourceOptions (9.2)
    identifiers.ts               parseIdentifier(), parseLinkage() (9.1)
    resource-members.ts          identity, attribute names, relationships of a request resource object (9.2)
    resource-document.ts         parseResourceObject(), parseCreateDocument(), parseUpdateDocument(), primaryData() (9.2)
    relationship-document.ts     parseToOneRelationshipDocument(), parseToManyRelationshipDocument() (9.3)
    cardinality.ts               toOneLinkage(), toManyLinkage() (9.4)
  atomic/
    index.ts                     subpath entry
    types.ts                     section 11
    process.ts                   operationsProcessor() (11.1)
    content-type.ts              assertOperationsContentType() (11.1)
    operation-error.ts           errorAtOperation() (11.1)
    parse-document.ts            parseOperationsDocument() (11.2)
    parse-target.ts              ref and href (11.2)
    parse-support.ts             ParseDocumentOptions, unknownMembers()
    lids.ts                      Lids (11.3)
    execute.ts                   executeOperation() (11.4)
    execute-resource.ts          create(), update(), remove() (11.4)
    execute-relationship.ts      relationship() (11.4)
    execute-support.ts           shared lookups and checks (11.4)
    test-fixtures.ts             the store and handlers the atomic tests share; not published
    test-run.ts                  the outcome runner the atomic tests share; not published
  test-support/
    jsonapi-schema-1-0.ts        the official JSON:API 1.0 JSON Schema, vendored; not published
    conformance.ts               schemaErrors(): Ajv over the schema with the 1.1 deltas; not published
packages/hono-jsonapi/src/
  index.ts                       root entry: re-exports @nizam-os/jsonapi-core, adds section 10
  internal/object.ts             isRecord(), ownMember(): the two prototype-safe reads respond() needs
  types.ts                       JsonApiEnv, JsonApiContext (10.1)
  middleware.ts                  jsonApi() (10.1)
  respond.ts                     respond(), respondError(), isJsonApiResponse(), varyAccept() (10.2)
  body.ts                        readDocument() (10.3)
  validators.ts                  queryValidator(), bodyValidator(), relationshipValidator() (10.4)
  handlers.ts                    errorHandler(), notFoundHandler() (10.5)
  atomic/
    index.ts                     subpath entry: re-exports @nizam-os/jsonapi-core/atomic, adds atomicOperations
    handler.ts                   atomicOperations() (11.1)
```

---

## 2. Documents (`document/types.ts`)

Types mirror the specification's document structure (`#document-structure`). All members are
`readonly`; optional members are `?: T | undefined` so a builder can pass `undefined` and
`compact()` removes it before serialization.

- `Meta = Readonly<Record<string, unknown>>`; `Link = string | LinkObject | null`;
  `LinkObject { href; rel?; describedby?; title?; type?; hreflang?: string | ReadonlyArray<string>; meta? }`;
  `Links = Readonly<Record<string, Link>>` (`#document-links`).
- `ResourceIdentifier { type; id; meta? }`; `LocalResourceIdentifier { type; lid; meta? }`;
  `AnyResourceIdentifier` is their union (`#document-resource-identifier-objects`).
- `ResourceLinkage = null | ResourceIdentifier | ReadonlyArray<ResourceIdentifier>`;
  `ToOneLinkage = ResourceIdentifier | null`; `ToManyLinkage = ReadonlyArray<ResourceIdentifier>`
  (`#document-resource-object-linkage`).
- `Relationship { links?; data?; meta? }`; `Relationships`; `Attributes`;
  `ResourceObject { type; id; attributes?; relationships?; links?; meta? }` with `id: string` always
  present: the package builds server-side resource objects only (`#document-resource-objects`).
- `JsonApiObject { version?; ext?; profile?; meta? }` (`#document-jsonapi-object`).
- `ErrorSource { pointer?; parameter?; header? }`, `ErrorLinks { about?; type? }`,
  `ErrorObject { id?; links?; status?: string; code?; title?; detail?; source?; meta? }`
  (`#error-objects`). `status` is a string on the wire.
- `DocumentBase { jsonapi?; links?; meta? }`;
  `DataDocument<TData> extends DocumentBase { data: TData; included? }`; `ErrorDocument { errors }`;
  `MetaDocument { meta }`; `ExtensionDocument { [member: \`${string}:${string}\`]: unknown
  }` for documents whose primary member is an extension member (`atomic:results`); `Document =
  DataDocument | ErrorDocument | MetaDocument |
  ExtensionDocument`; `PrimaryData`, `ResourceDocument`, `CollectionDocument`, `ToOneRelationshipDocument`, `ToManyRelationshipDocument`are the`DataDocument` instantiations (`#document-top-level`).

### 2.1 Member names (`member-name.ts`)

- `isMemberName(name)`: at least one character; first and last characters are `A-Z`, `a-z`, `0-9`,
  or U+0080 and above; inside, additionally `-`, `_`, and U+0020 SPACE
  (`#document-member-names-allowed-characters`). Prototype keys (`__proto__`, `constructor`,
  `prototype`) are excluded by `assertMemberName` and by every parser that turns a name into a key.
- `isMemberPath(path)`: one or more member names joined by `.` (`#fetching-includes`,
  `#fetching-sorting`).
- `isAtMember(name)`: starts with `@`. @-Members are ignored by every processing rule in this
  package: a request parser skips them, never reports them (`#document-member-names-at-members`).
- `isExtensionMemberName(name)`: `namespace:name` where the namespace matches `[A-Za-z0-9]+` and the
  rest is a member name (`#extension-members`).
- `assertMemberName(what, name)` throws `TypeError` naming `what` for an invalid or prototype name.

Tests: `member-name.test.ts` covers the grammar edge characters, @-Members, extension names, and
prototype keys.

---

## 3. Media types and negotiation

### 3.1 RFC 9110 parsing and serialization (`media-type/parse.ts`, `format.ts`)

- `parseMediaType(value): MediaType | undefined`: `type/subtype` then `*( OWS ";" OWS parameter )`.
  Type, subtype, and parameter names are lowercased (case-insensitive per RFC 9110 8.3.1 and 5.6.6);
  parameter values keep their case, with quoted-strings unquoted and quoted-pairs resolved (5.6.4).
  Anything that is not a valid media type returns `undefined`; nothing throws.
- `parseAccept(value): ReadonlyArray<MediaRange>`: a comma-separated list of media ranges, each with
  `weight` from `q` (12.4.2; default 1; `q` is not reported as a parameter). Malformed elements are
  skipped so one bad element cannot hide the rest.
- `formatMediaType`, `formatParameterValue` (token as is, otherwise quoted-string),
  `quoteParameterValue` (throws `TypeError` for a value no quoted-string can carry).

Tests: `parse.test.ts` (grammar, case, quoting, weights, malformed input), `json-api.test.ts`.

### 3.2 The JSON:API media type (`media-type/json-api.ts`)

- `isJsonApiMediaType(mediaType)`: `application/vnd.api+json`, parameters aside.
- `jsonApiParameters(mediaType): { ext, profile, other }`: `ext` and `profile` values are split on
  U+0020 SPACE, deduplicated, order kept; `other` lists the names of every other parameter
  (`#media-type-parameter-rules`).
- `formatJsonApiMediaType({ ext?, profile? })`: the media type followed by `ext` and `profile`
  parameters only when their lists are non-empty; values are always quoted-strings so one URI and
  several serialize the same way (`#media-type-parameter-rules`, the HTTP quoting note).

### 3.3 Negotiation (`negotiate/negotiate.ts`)

`negotiate({ contentType, accept }, { extensions?, profiles? })` applies
`#content-negotiation-servers` in order and returns `{ ok: true, request, extensions, profiles }` or
`{ ok: false, error }` where `error` is a 415 or 406 `BanError` (4.2) carrying `Vary: Accept` in its
headers.

Content-Type:

1. Absent or unparseable: the request declares no body (`request.jsonApi === false`).
2. Not JSON:API: `request.mediaType` is kept, `jsonApi` is `false`. Whether such a body is
   acceptable is the endpoint's call (`readDocument` rejects it, section 10.3).
3. JSON:API with any parameter other than `ext` and `profile`: 415 (`source.header` is
   `Content-Type`).
4. JSON:API with an `ext` URI not in `extensions`: 415, whose detail does not quote the URI (4.4).
5. Otherwise `request = { mediaType, jsonApi: true, extensions, profiles }` as sent.

Accept:

1. Absent, or no JSON:API instance with `q > 0`: no extensions or profiles are required.
2. Every JSON:API instance carries a parameter other than `ext` and `profile`: 406 (`source.header`
   is `Accept`).
3. Every remaining instance requires an extension not in `extensions`: 406.
4. Otherwise the instance with the highest weight wins; among equal weights the one with the most
   extensions, then the first in field order. `extensions` are that instance's `ext` URIs;
   `profiles` are its `profile` URIs filtered to `profiles` (unrecognized profiles MUST be ignored,
   `#profile-rules`).

`q=0` instances are "not acceptable" by RFC 9110 12.4.2 and are not JSON:API instances for rule 2.

Tests: `negotiate.test.ts` names each rule.

---

## 4. Errors

### 4.1 Catalog (`errors/catalog.ts`)

Every error the package emits is a @nizam-os/ban-core `BanError` (ADR 0014) carrying one of
`ERROR_CODES`. `ERROR_CATALOG` holds the entries @nizam-os/ban-core's built-in catalog does not
have, in @nizam-os/ban-core's `ErrorDefinition` shape
(`JsonApiCatalog = Record<JsonApiCatalogKey, ErrorDefinition>`), so an application spreads them into
its own `createBan({ errors })` next to its own entries; the other codes are @nizam-os/ban-core
built-ins with the same `status` and `title`. `ErrorCode` is the union of all sixteen, `ERROR_CODES`
lists them in status order, and each fixes `status` and `title`; `detail` and `source` vary per
occurrence (`#error-objects`: `title` SHOULD NOT change from occurrence to occurrence). The three
profile entries carry the profile's error `type` URI (8.4).

| Code                                | Status | Title                             | Defined by         |
| ----------------------------------- | ------ | --------------------------------- | ------------------ |
| `INVALID_QUERY_PARAMETER`           | 400    | Invalid Query Parameter           | this package       |
| `UNKNOWN_QUERY_PARAMETER`           | 400    | Unknown Query Parameter           | this package       |
| `INVALID_DOCUMENT`                  | 400    | Invalid Document                  | this package       |
| `MALFORMED_JSON`                    | 400    | Malformed JSON                    | @nizam-os/ban-core |
| `UNSUPPORTED_SORT`                  | 400    | Unsupported Sort                  | this package       |
| `MAX_PAGE_SIZE_EXCEEDED`            | 400    | Max Page Size Exceeded            | this package       |
| `RANGE_PAGINATION_NOT_SUPPORTED`    | 400    | Range Pagination Not Supported    | this package       |
| `FORBIDDEN`                         | 403    | Forbidden                         | @nizam-os/ban-core |
| `CLIENT_GENERATED_ID_NOT_SUPPORTED` | 403    | Client-Generated ID Not Supported | this package       |
| `NOT_FOUND`                         | 404    | Not Found                         | @nizam-os/ban-core |
| `METHOD_NOT_ALLOWED`                | 405    | Method Not Allowed                | @nizam-os/ban-core |
| `NOT_ACCEPTABLE`                    | 406    | Not Acceptable                    | @nizam-os/ban-core |
| `CONFLICT`                          | 409    | Conflict                          | @nizam-os/ban-core |
| `UNSUPPORTED_MEDIA_TYPE`            | 415    | Unsupported Media Type            | @nizam-os/ban-core |
| `VALIDATION_FAILED`                 | 422    | Validation Failed                 | @nizam-os/ban-core |
| `INTERNAL_SERVER_ERROR`             | 500    | Internal Server Error             | @nizam-os/ban-core |

### 4.2 Errors on @nizam-os/ban-core (`errors/json-api-error.ts`)

`jsonApiBan` is the @nizam-os/ban-core instance behind every error the package builds:
`createBan({ errors: ERROR_CATALOG, format: jsonApi({ mixedEntries: true }) })`. Its catalog is
`ERROR_CATALOG` over @nizam-os/ban-core's built-ins (`JsonApiErrorCode = ErrorKey<JsonApiCatalog>`),
and its format is @nizam-os/ban-core's JSON:API format with `mixedEntries` on, so one document can
combine entries (@nizam-os/ban-core SPEC 7.2.4). Any @nizam-os/ban-core instance renders any
`BanError`, so an application with entries of its own builds its own instance with `ERROR_CATALOG`
spread into `errors` and renders this package's errors the same way;
`e2e/jsonapi/custom-catalog.e2e.test.ts` drives that over HTTP.

An error object is an `ErrorItem` on `error.errors`:

- `errorItem(code, { detail, source?, meta?, reason?, expected? })`: the entry's `status`, `code`,
  `title`, and `type` (when it declares one), then the occurrence's `detail`, address, `meta`, and a
  validator's `reason` and `expected` (rendered as `meta.code` and `meta.expected`). The address is
  the `source` as @nizam-os/ban-core locates it: `pointer` is a path with no location
  (`pathFromPointer`, RFC 6901 unescaping), `parameter` is a one-segment path in `query`, `header`
  one in `header`; one item addresses one part of the request, with that precedence when several are
  given. The format renders them back as `source.pointer`, `source.parameter`, and `source.header`
  (@nizam-os/ban-core SPEC 7.2.2); a parameter or header item also carries `meta.location`.
- `jsonApiError(code, { detail?, source?, meta?, cause?, headers? })`: one error object from the
  catalog. With no `source` and no `meta` it is
  `jsonApiBan.error(code, { detail, cause, headers })`; otherwise the error carries one item, and a
  `source` or `meta` without a `detail` is a `TypeError`.
- `jsonApiError(items, { cause?, headers? })`: one error over one item or a non-empty list (empty:
  `TypeError`). When every item carries the same catalog code the error is that entry; otherwise it
  is the primary entry for the response status, `responseStatus(items)` from
  `@nizam-os/ban-core/formats/json-api` (the common status; 400 when the items differ and are all
  4xx; else 500; 500 when no item has a status) through `jsonApiBan.fromStatus`
  (`#errors-processing`: "the most generally applicable HTTP error code"). A single item's `detail`
  becomes the error's, so logs and the other formats show it.
- `headers` are the error's own (`error.headers`): `Allow` on a 405, `Vary: Accept` on a 415 or 406.
  Every handler and `respondError` send them.
- `errorObjects(error)`: the error objects the JSON:API format renders for any `BanError`, in
  document order: one per item, or one for the error itself when it has no list, each with the
  error's `id`. `errorDocument(error, base?)` is `{ jsonapi?, links?, meta?, errors }` for callers
  that build a response by hand; handlers (10.5) render through @nizam-os/ban-core instead.
- `BanError` and `isBanError` are re-exported from `@nizam-os/ban-core` so a consumer narrows a
  caught error without a second import. `error.status` is the response status, `error.getResponse()`
  a bare rendering, `error.cause` the underlying failure.

### 4.3 Status codes

`ErrorStatusCode` is @nizam-os/ban-core's union of the registered 4xx and 5xx codes, re-exported; an
unregistered status is a `TypeError` in @nizam-os/ban-core at construction (ADR 0009). The adapter
hands `error.status` to `c.json` without assertions.

### 4.4 Request text in details (`internal/quotable.ts`, ADR 0016)

A detail is shown to people and logged as it is, so a detail the package writes quotes a text from
the request only when `quotable(value)` holds: the value matches `QUOTABLE_PATTERN` (section 13),
letters, digits, `_`, `-`, `.`, and square brackets, 1 to 64 characters. A member name, a member
path, a parameter name such as `page[size]`, an integer, and a UUID pass. Otherwise the detail says
what the value was without it, and `source` locates it:
`Sort field "nme" is not supported by this endpoint` against
`A sort field is not supported by this endpoint`,
`Query parameter "fields[x]" is specified more than once` against
`This query parameter is specified more than once`.

- A detail about two request values (two ids, two `lid`s) quotes both or neither.
- A value the server declared, such as a type a lookup matched or a declared field, is the server's
  text and is quoted as it is.
- An extension URI is never quoted (3.3): a URI has a scheme and a colon.
- `source.parameter` and `source.pointer` keep the request's names, as JSON:API defines them; they
  are for programs, escaped by JSON and RFC 6901.
- A validator's issue message is the application's text and stays the detail (9.2).

Tests: `json-api-error.test.ts` (catalog closure and spreading into `createBan`, item mapping and
precedence, both call forms, status derivation for mixed lists), `error-document.test.ts` (document
order, a foreign @nizam-os/ban-core validation error, `getResponse` with the error's headers),
`quotable.test.ts` (the token's characters and bounds), and the sweeps `errors/request-text.test.ts`
and `atomic/request-text.test.ts`: quotes, markup, CR LF, C0 and C1 controls, a URL, a bidi
override, a line separator, an inner space, and 10 kB through every builder and parser that quotes,
each detail short printable ASCII without angle brackets that quotes none of it, and a plain token
reaching the same refusal quoted.

---

## 5. Resource definitions (`resource/types.ts`)

`ResourceDefinition<TType, TAttribute, TRelationship, TRow, TSort, TFilter, TCreate, TUpdate, TTypes>`:

| Member          | Meaning                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`          | The resource type; a member name                                                                                                                                                                                                           |
| `attributes`    | Declared attribute names                                                                                                                                                                                                                   |
| `relationships` | By name: `{ type, cardinality: 'one' \| 'many', resource?: () => AnyResource }`                                                                                                                                                            |
| `fields`        | `ReadonlySet` of attribute and relationship names                                                                                                                                                                                          |
| `serialize`     | `(row: TRow) => { id; attributes?; relationships?; links?; meta? }`; attributes and relationships are restricted to the declared names                                                                                                     |
| `links`         | `{ self?: (id) => string; relationship?: (id, name) => { self?; related? } }`, resolved from `ResourceLinksInit` (5.1)                                                                                                                     |
| `query`         | Resolved capabilities (5.2)                                                                                                                                                                                                                |
| `validate`      | `{ create?: StandardSchema<unknown, TCreate>; update?: StandardSchema<unknown, TUpdate>; id?: StandardSchema<unknown, string> }`: the attributes of each write, and the resource id, a create's client-generated one and an update's (9.2) |
| `clientIds`     | Whether `POST` may carry a client-generated `id`; default `false` (`#crud-creating-client-ids`)                                                                                                                                            |
| `writable`      | `WritableFields = { create; update }`: each a `ReadonlySet` of the fields that operation accepts; every field when the init lists none (9.2)                                                                                               |
| `'~types'`      | Type-only, always absent: what a client reads and writes (5.3)                                                                                                                                                                             |

`serialize` may return relationships as an id, `null`, an array of ids, an identifier object, an
array of identifier objects, or `{ data?, links?, meta? }`. `AnyResource` erases every parameter;
`RowOf`, `RelationshipNameOf`, `CreateAttributesOf`, `UpdateAttributesOf` recover them.
`CreateAttributesOf` is `Attributes` when the definition has no create validator.

`RelationshipLinks` is an object type (not an interface) so a built value is assignable to `Links`.

### 5.1 `defineResource(init)` (`define-resource.ts`, ADR 0012)

Validates once and throws `TypeError` naming the option for: a `type` that is not a member name; an
attribute or relationship name that is not a member name, is `type` or `id` (fields share a
namespace with them, `#document-resource-object-fields`), or is declared twice or in both lists; a
relationship whose `type` is not a member name or whose `cardinality` is not `one` or `many`; a
`serialize` that is not a function; a validator that is not a Standard Schema V1 object (`~standard`
read with `in`, since zod 4, Valibot, and ArkType expose it as a prototype getter; `version` 1 and a
`validate` function); a `writable.create` or `writable.update` name that is not a declared field or
is listed twice. Fills `links`, `query`, `validate`, `clientIds`, `writable` (each operation without
a list accepts every field), and `atomic` with defaults. The literal types of `type`, the field
names, and the sort and filter names are inferred (`const` type parameters) and `NoInfer` keeps
names flowing from the declarations into `serialize` and `writable`, never the other way.

Writable fields. `writable: WritableFieldsInit = { create?, update? }` lists, typed as the declared
names, the fields each operation accepts, so a read-only field (`createdAt`, a counter) or one set
once (a slug, an author) is declared, served, filterable, and sortable while a request that writes
it is refused with 403 (9.2, 10.4, 11.4). The specification makes the update's refusal a MUST and
the create's a MAY ("A server MUST return 403 Forbidden in response to an unsupported request to
update a resource or relationship"; `#crud-updating-relationship-responses-403`, the id the page
gives the update's 403 as well as the relationship update's, and `#crud-creating-responses-403`);
refusing beats a validator that strips the unknown key, which answers success for a write that never
happened.

Links (`links.ts`, ADR 0015). `links` is `ResourceLinksInit = { base?, self?, relationship? }`.
Without `base`, the resolved `links` holds the builders given and nothing else. With `base`, a
builder not given is derived by the URL design of the specification's recommendations: `self(id)` is
`<base>/<type>/<id>` and `relationship(id, name)` is
`{ self: <base>/<type>/<id>/relationships/<name>, related: <base>/<type>/<id>/<name> }`, with
`type`, `id`, and `name` percent-encoded (`encodeURIComponent`); a builder given wins over its
derived one. `base` MUST be `''`, a path starting with `/`, or an absolute URL (a scheme followed by
`//`), and MUST NOT end with `/` or contain `?` or `#`; otherwise `TypeError` naming `links.base`. A
link is a URI-reference (`#document-links-link`), so root-relative links are valid; `respond`
derives the 201 `Location` from `self` (10.2).

Atomic Operations (ADR 0023). `atomic` is `AtomicCapabilitiesInit = { max? }`, resolved to
`{ max }`: the most operations one request at the definition's base takes (11.1), a positive safe
integer, `DEFAULT_MAX_OPERATIONS` (10) by default; anything else throws `TypeError` naming
`atomic.max`. The processor reads it from the definitions it runs (11.1), and a screen reads the
same value to refuse a selection one request cannot hold (resource SPEC 21).

`createDefineResource(defaults)` (`create-define-resource.ts`) returns a function with
`defineResource`'s signature (`DefineResource`) that defines every resource with
`links: { ...defaults.links, ...init.links }` and `atomic: { ...defaults.atomic, ...init.atomic }`:
a member the definition sets, even to `undefined`, replaces the default. A default `links.base` the
convention rejects, and a default `atomic.max` that is not a positive safe integer, throw when the
definer is created.
`ResourceDefaults = { links?: ResourceLinksInit; atomic?: AtomicCapabilitiesInit }`.

`relatedResource(resource, name)` follows a relationship to its definition and throws when the
relationship is undeclared, declares no `resource`, or the definition's `type` differs from the
relationship's.

Tests: `define-resource.test.ts` (every rejection), `define-resource.test-d.ts` (inference and the
`serialize` field restriction), `links.test.ts` (derivation, encoding, precedence, rejected bases),
`create-define-resource.test.ts` and `create-define-resource.test-d.ts` (merging, the default's
validation, inference through the configured definer).

### 5.2 Query capabilities (`query-capabilities.ts`)

`query` resolves to `{ sort, filter, include, fields, page, search, custom }`:

- `sort`: declared names, each a member path; default none.
- `filter`: by field (a member path), the operators it accepts, each non-empty; `or` and the search
  member are reserved; default none.
- `include`: declared relationship paths; default none. Each path is validated against the
  definitions it traverses when the registry is first built (6.3).
- `fields`: whether `fields[type]` is accepted; default `true`.
- `page`: `false` or absent rejects every `page` parameter. Otherwise `{ default, max, range }` with
  `max` default 100, `default` default `min(20, max)`, both positive integers, `default <= max`,
  `range` default `false`. The profile has no implicit maximum; this package chooses 100 so an
  endpoint never returns an unbounded page by omission (ADR 0008).
- `search`: `filter[<member>]`, or a custom base name; default none.
- `custom`: implementation-specific base names. A custom name MUST be a member name containing at
  least one character outside `a-z` (`#query-parameters-custom`); the same rule applies to a custom
  search name.

### 5.3 Client types (`client-types.ts`, ADR 0018)

`ResourceDefinition` takes a ninth parameter, `TTypes extends ResourceTypes`, the wide
`ResourceTypes` by default, carried as `'~types'?: TTypes`: type-only and always absent at runtime,
as Standard Schema's `types` member is. It is what a client reads and writes, which the other
parameters do not record:

| Member                   | `defineResource` infers it from                                                                                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attributes`             | the attributes `serialize` returns, each as JSON (`JsonOf`): what `JSON.stringify` writes, `toJSON` applied, so a `Date` is a string; a function, a symbol, or a bigint has no JSON form; a member that may be `undefined` is optional, since 7.1 leaves it out |
| `relationships`          | by name, the declared `type` and `cardinality`                                                                                                                                                                                                                  |
| `filter`                 | by field, the union of its operators                                                                                                                                                                                                                            |
| `include`                | the union of the declared include paths                                                                                                                                                                                                                         |
| `fields`                 | `false` when `query.fields` is `false`                                                                                                                                                                                                                          |
| `search`                 | `true` when `query.search` is set                                                                                                                                                                                                                               |
| `page`                   | `true` when the definition paginates                                                                                                                                                                                                                            |
| `custom`                 | the union of the declared custom names                                                                                                                                                                                                                          |
| `create`, `update`       | the input type of `validate.create` and `validate.update` (Standard Schema `types.input`), what a client sends; without a validator, the attributes the operation writes, each `unknown`                                                                        |
| `creatable`, `updatable` | the fields `writable.create` and `writable.update` list, else every field                                                                                                                                                                                       |
| `clientIds`              | `true` when `clientIds` is `true`                                                                                                                                                                                                                               |

`AnyResource` has the wide `ResourceTypes`, to which every inferred one is assignable; `TypesOf`
reads a definition's. The member costs nothing at runtime and nothing in a type check that never
reads it: TypeScript computes a member's type when it is read.

### 5.4 Paths (`paths.ts`)

`resourcePaths(definition, { caller? })` reads the paths of a definition's operations from its
links: the resource at `links.self(id)`, built for a marker id of unreserved characters, which
`encodeURIComponent` keeps, and the marker becomes the template `{id}`; the collection at that path
without its last segment; and each relationship's `self` and `related` links. It returns
`ResourcePaths = { origin, collection, resource, relationships, operations }`, `origin` being an
absolute link's origin and `undefined` for a root-relative one, and `operations` the collection's
path without its last segment followed by `/operations`, where a host serves the Atomic Operations
of the definitions sharing that base (ADR 0023). It throws `TypeError`, starting with `caller`
(default `resourcePaths`), when `links.self` is absent, a link is neither an absolute URL nor a path
starting with `/`, a link holds the id other than once or has a query or a fragment, `links.self`
does not end with the id after the collection's path, or a relationship link has another origin than
`links.self`. `@nizam-os/resource-core`'s OpenAPI document (resource SPEC 13.1),
`@nizam-os/hono-resource`'s routes (resource SPEC 19.2, 19.4), and the client (15.4, 17.2) read
paths only through it, so the three name the same URLs.

Tests: `paths.test.ts`.

---

## 6. Query parsing (`query/parse-query.ts`)

`parseQuery(resource, input): ParsedQuery<TSort, TFilter>` parses every parameter against the
definition and throws one 400 `BanError` listing every problem, each with `source.parameter` set to
the parameter name as sent and a detail that quotes request text only as 4.4 allows. Nothing is
dropped silently: a parameter the endpoint does not know how to process is `UNKNOWN_QUERY_PARAMETER`
(`#query-parameters`: "MUST return 400 Bad Request").

Dispatch per parameter name (6.2 gives the grammar; `member` is the first bracket member):

| Name                                             | Rule                      |
| ------------------------------------------------ | ------------------------- |
| `include`                                        | 6.4                       |
| `fields[type]`                                   | 6.5                       |
| `sort`                                           | 6.6                       |
| `page[member]`                                   | 6.7                       |
| `filter[...]` naming the search member           | the search value          |
| `filter[...]`                                    | 6.8                       |
| the custom search base name, no members          | the search value          |
| a declared custom base name, any members         | `custom[name] = value`    |
| anything else, including a name 6.2 cannot parse | `UNKNOWN_QUERY_PARAMETER` |

`include`, `fields[type]`, `sort`, `page[member]`, and the search parameter MAY appear once; a
repeated occurrence is `INVALID_QUERY_PARAMETER` ("specified more than once"), since a second value
has no defined meaning. A repeated custom parameter is kept as an array of its values.

### 6.1 Input and result (`input.ts`, `types.ts`)

`QueryInput` is a query string (with or without `?`), a `URLSearchParams`, or a record of string or
string-array values (the shape of `c.req.queries()`). A string is parsed with `URLSearchParams`, the
`application/x-www-form-urlencoded` parser the specification names
(`#appendix-query-details-parsing`); the record form expands arrays to repeated pairs. Order is
preserved.

`ParsedQuery`:

| Member    | Value                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `include` | `undefined` when absent; `[]` for `include=` (which still requires `included` in the response); otherwise segment arrays, deduplicated |
| `fields`  | by type: the field names, deduplicated; an empty array means no fields; absent types get all fields                                    |
| `sort`    | `{ field, direction }` in order; `direction` is `desc` for a `-` prefix                                                                |
| `filter`  | `{ conditions, anyOf }` (6.8)                                                                                                          |
| `page`    | `undefined` when the definition does not paginate; otherwise `{ size, after, before, sizeRequested, range }` (6.7)                     |
| `search`  | the search value, or `undefined`                                                                                                       |
| `custom`  | declared custom parameters by full name, as sent                                                                                       |
| `params`  | a `URLSearchParams` of every pair as sent, for links that must reproduce them                                                          |

### 6.2 Parameter names (`parameter-name.ts`)

`parseParameterName(name)` splits `base`, `base[]`, `base[member]`, `base[a.b]`, and nested groups
into `{ base, members }`, or returns `undefined` when the base is neither a member name nor an
extension member name, brackets are unbalanced or nested inside a group, or a member is neither
empty, a member name, nor a member path (`#query-parameters-families`). Brackets arrive decoded
(`%5B`) or bare; both are the same name (`#appendix-query-details-square-brackets`).

### 6.3 Registry (`registry.ts`)

`registryOf(resource)` builds once per definition (memoized in a `WeakMap`): the trie of declared
include paths, each segment resolved through `relatedResource`, and the map of every type reachable
that way, including the primary type. Two different definitions declaring the same type throw.
`resolveIncludePath(registry, segments)` returns the definition at the end of a declared path or a
declared prefix of one.

### 6.4 `include` (`parse-families.ts`)

A comma-separated list of relationship paths (`#fetching-includes`); an empty value is an empty
list. Duplicates are dropped. A path that is not a member path, or that the registry does not
resolve, is `INVALID_QUERY_PARAMETER` on `include` ("MUST respond with 400 Bad Request").

### 6.5 `fields[type]`

Rejected as unknown when the definition sets `fields: false`. The type MUST be one the registry
knows (the primary type or one reachable through declared include paths); each name MUST be a field
of that type; otherwise `INVALID_QUERY_PARAMETER` on `fields[type]`. An empty value is an empty
fieldset (`#fetching-sparse-fieldsets`: "an empty value indicates that no fields should be
returned"). Duplicates are dropped.

### 6.6 `sort`

A comma-separated list of declared sort names, each optionally prefixed with `-` for descending
(`#fetching-sorting`). An undeclared name is the profile's `UNSUPPORTED_SORT` error (8.4), chosen
over the generic 400 because it carries a `type` link clients can key on; a repeated name is
`INVALID_QUERY_PARAMETER`.

### 6.7 `page[member]`

When the definition does not paginate, every `page` parameter is unknown. Otherwise the members are
those of the Cursor Pagination profile: `size`, `after`, `before`; any other member is unknown.

- `page[size]` MUST match `^[0-9]+$` and be positive (profile: "MUST match `^[0-9]+$`"); a value
  above `max` is `MAX_PAGE_SIZE_EXCEEDED` with `meta.page.maxSize` (8.4).
- `page[after]` and `page[before]` MUST be non-empty; their content is opaque here and decoded by
  the application's pagination engine (which throws `invalidCursor`, 8.4).
- Both cursors together is a range request; on a definition without `range` it is
  `RANGE_PAGINATION_NOT_SUPPORTED` (8.4).
- The used size is `page[size]` when sent, else `default`, or `max` on a range request (profile:
  "the max page size SHOULD be used" on range requests). `sizeRequested` says whether the client
  sent `page[size]`.

### 6.8 `filter` (`parse-filter.ts`, ADR 0007)

The grammar is the package's choice; JSON:API reserves the family and leaves the strategy open
(`#fetching-filtering`).

| Parameter                    | Meaning                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `filter[field]=v`            | condition `{ field, operator: 'eq', value }`              |
| `filter[field][op]=v`        | condition with a declared operator                        |
| `filter[or][n][field]=v`     | `eq` condition in disjunction group `n` (`n` is `[0-9]+`) |
| `filter[or][n][field][op]=v` | condition in group `n`                                    |

`conditions` all hold; within a group any condition may hold; every group holds. Groups are returned
in ascending index order. An undeclared field or operator is `INVALID_QUERY_PARAMETER` on the
parameter; `filter`, `filter[]`, more than four members, or an `or` without a numeric index and a
field is `UNKNOWN_QUERY_PARAMETER`. A repeated parameter yields an array `value`. Each condition
keeps the `parameter` it came in, as the request spelled it (`filter[status]`,
`filter[or][0][status][eq]`), so an application that refuses its value later, as keyset-core refuses
a value its field's type does not accept, names that parameter in `source.parameter`, as this parser
names its own refusals. @ref https://jsonapi.org/format/1.1/#error-objects ("which URI query
parameter caused the error")

Tests: `parse-query.test.ts` (dispatch, aggregation, single-occurrence rule, custom and search
parameters), `parse-families.test.ts`, `parse-filter.test.ts`, `parameter-name.test.ts`.

---

## 7. Document building

### 7.1 Serialization (`document/serialize.ts`)

`serializeResource(resource, row)` returns a complete resource object in member order `type`, `id`,
`attributes`, `relationships`, `links`, `meta`:

- `id` MUST be a string; anything else throws `TypeError`
  (`#document-resource-object-identification`).
- `attributes` keeps only declared names with a defined value; the member is omitted when empty.
- Each relationship becomes a relationship object: linkage from the shorthand (ids become
  identifiers of the declared type; identifier objects pass through), plus `links.self` and
  `links.related` from `links.relationship` when they are defined. The declared cardinality is
  enforced: an array for to-one or a non-array for to-many throws. An undeclared relationship name
  throws; a relationship object with none of `links`, `data`, `meta` throws
  (`#document-resource-object-relationships`). A `null` to-one and an empty to-many stay as
  `data: null` and `data: []`.
- `links.self` from `links.self(id)`; `meta` as returned.

`applyFields(resource, fields)` keeps only the named attributes and relationships; an empty list
drops both members; `type`, `id`, `links`, `meta` are not fields and stay
(`#fetching-sparse-fieldsets`). `identify(resource, row)` returns `{ type, id }`.

### 7.2 Builders (`document/build.ts`)

All take `DocumentOptions = DocumentBase & { query?, included? }`.

- `jsonApiObject(init?)`: `{ version: '1.1', ...init }`, `undefined` members removed.
- `resourceDocument(resource, row | null, options?)`,
  `collectionDocument(resource, rows, options?)`: serialize, apply `query.fields[resource.type]`,
  build `included` (below), and emit `jsonapi`, `links`, `meta`, `data`, `included` in that order.
- `toOneRelationshipDocument(resource, row | null, base?)`,
  `toManyRelationshipDocument(resource, rows, base?)`: `data` is identifiers only
  (`#fetching-relationships-responses-200`).
- `include(resource, rows)` pairs rows with their definition for `options.included`; the row type is
  checked against the definition at the call.

`included`:

1. Absent when `options.included` and `query.include` are both `undefined`.
2. Each included row is serialized completely and deduplicated by type and id, first wins; a
   resource present in the primary data is never repeated (`#document-compound-documents`: "MUST NOT
   include more than one resource object for each type and id pair").
3. Full linkage is asserted over the complete objects (7.3); a violation throws `TypeError`.
4. `query.fields[type]` is applied per included type.
5. The member is omitted when nothing remains and the client sent no `include`; it is `[]` when the
   client sent `include` (even `include=`) and nothing qualifies (`#fetching-includes`).

### 7.3 Full linkage (`document/linkage.ts`)

`assertFullLinkage(primary, included, requested?)` walks from every primary resource along
relationship `data` and throws for an included resource the walk never reaches. With `requested`
(the parsed include paths) the walk is confined to those paths, so an included resource the client
did not ask for is reported too. Linkage is checked over the complete objects, before sparse
fieldsets: the specification's one exception is linkage a fieldset removed from the output
(`#document-compound-documents`).

Tests: `serialize.test.ts`, `build.test.ts`, and `conformance.test.ts`, which validates every
builder's output against the JSON:API JSON Schema (ADR 0011).

---

## 8. Cursor pagination (`pagination/`)

The profile is `http://jsonapi.org/profiles/ethanresnick/cursor-pagination/` exactly as its page
states it, `http` and trailing slash included (ADR 0008).

### 8.1 `paginatedDocument(resource, page, options)` (`paginated.ts`)

`page = { rows, next, prev, last?, first?, total?, estimatedTotal?, rangeTruncated?, cursor? }`;
`options = DocumentOptions & { url, relative? }`. Builds `collectionDocument` with:

- `jsonapi.profile`: any profiles passed, then the cursor profile once;
- `links`: any links passed, overridden by `paginationLinks(url, page)` (8.2);
- `meta`: any meta passed, with `pageMeta(page)` merged in (8.3);
- each item's `meta.page.cursor` from `cursor(row)` when `cursor` is given, keeping other `meta` and
  `meta.page` members of the item.

### 8.2 Links (`links.ts`)

`paginationLinks(url, { next, prev, last?, first? }, { relative? })` derives every link from the
request URL so each parameter the client sent survives (`#document-top-level`: `self` is "the link
that generated the current response document"; profile: links "MUST" reproduce the query).

- The query is re-serialized once through `URLSearchParams`, so square brackets a client left bare
  come out percent-encoded, which the serialization rules prescribe
  (`#appendix-query-details-square-brackets`).
- `self`: the URL as is. `first`: without `page[after]` and `page[before]`; omitted for
  `first: false`. `prev`: `page[before]=prev` without `page[after]`, or `null`. `next`:
  `page[after]=next` without `page[before]`, or `null`. `last`: `page[before]=last` or `null`, only
  when `last` is given. `prev` and `next` are always present (profile: "MUST be present").
- `relative: true` renders path and query only.

### 8.3 Meta (`links.ts`)

`pageMeta({ total?, estimatedTotal?, rangeTruncated? })` emits only the members the profile
recognizes under `meta.page`: `total`, `estimatedTotal: { bestGuess }`, and `rangeTruncated: true`
only when true (the profile defines it as a flag to add). `itemCursorMeta(cursor)` is
`{ page: { cursor } }`.

### 8.4 Errors (`errors.ts`)

Each is a 400 `ErrorItem` (4.2) with `source.parameter` and, where the profile defines one, a `type`
link under `https://jsonapi.org/profiles/ethanresnick/cursor-pagination/`, the catalog entry's
`type` (4.1), exported as `UNSUPPORTED_SORT_TYPE`, `MAX_SIZE_EXCEEDED_TYPE`, and
`RANGE_PAGINATION_NOT_SUPPORTED_TYPE`:

| Builder                                    | Code                             | `type` link suffix               | Extra                                 |
| ------------------------------------------ | -------------------------------- | -------------------------------- | ------------------------------------- |
| `unsupportedSortError(field)`              | `UNSUPPORTED_SORT`               | `unsupported-sort`               | `source.parameter: 'sort'`            |
| `maxPageSizeExceededError(requested, max)` | `MAX_PAGE_SIZE_EXCEEDED`         | `max-size-exceeded`              | `meta.page.maxSize`                   |
| `rangePaginationNotSupportedError()`       | `RANGE_PAGINATION_NOT_SUPPORTED` | `range-pagination-not-supported` | `source.parameter: 'page[before]'`    |
| `invalidCursorError(parameter, detail?)`   | `INVALID_QUERY_PARAMETER`        | none                             | for a cursor the engine cannot decode |

`unsupportedSort(field)` and `invalidCursor(parameter, detail?)` wrap them in a `BanError` for
throwing from an engine. `unsupportedSortError` quotes `field`, the request's text, only as 4.4
allows, so an engine passes the fields it refused as they came; a `detail` given to
`invalidCursorError` is the caller's. The `type` link is a string, since the profile says "has a
`type` link of" and a link may be a string (`#document-links-link`).

Tests: `links.test.ts`, `paginated.test.ts`, `errors.test.ts`; `pagination.e2e.test.ts` walks pages
over HTTP.

---

## 9. Request documents (`request/`)

Every parser accumulates error items, each with `source.pointer` (RFC 6901, `~` and `/` escaped in
names) and a detail that quotes request text only as 4.4 allows, and throws one `BanError` whose
status follows 4.2.

### 9.1 Identifiers and linkage (`identifiers.ts`)

- `parseIdentifier(value, pointer, { lids?, type? }, errors)`: an object with a string `type` (400
  at `pointer/type` otherwise); `type` MUST equal `options.type` when given (409 `CONFLICT` at
  `pointer/type`); `meta`, when present, MUST be an object; a string `id`, or a string `lid` when
  `lids` is true; otherwise 400 (`#document-resource-identifier-objects`).
- `parseLinkage(value, pointer, cardinality, options, errors)`: to-one accepts `null` or one
  identifier; to-many accepts an array (possibly empty), each item parsed at `pointer/<index>`. The
  result type is `ResourceLinkage` without `lids` and `RequestLinkage` (identifiers that may carry
  `lid`) with it.

### 9.2 Resource documents (`resource-document.ts`, `resource-members.ts`)

`parseResourceObject(resource, value, { operation, id?, lids?, pointer? })` parses the resource
object at `pointer` (default `/data`):

1. `value` MUST be an object (400).
2. Members other than `type`, `id`, `lid`, `attributes`, `relationships`, `links`, `meta` are 400 at
   their pointer; @-Members are skipped. `links` is ignored (clients MAY send it); `meta` MUST be an
   object when present.
3. `type` MUST be a string and MUST equal the definition's type (409 `CONFLICT` at `pointer/type`,
   `#crud-creating-responses-409`, `#crud-updating-responses-409`).
4. `id`, when present, MUST be a string. On `create`, an `id` is `CLIENT_GENERATED_ID_NOT_SUPPORTED`
   (403) unless the definition sets `clientIds` (`#crud-creating-client-ids`). On `update`, `id`
   MUST be present (400) and MUST name the resource `options.id` names, when given (409,
   `#crud-updating-responses-409`): the same text, or two texts `validate.id` takes with one output,
   the server's spelling of the key, so a client that requests a key in its own spelling (a UUID in
   upper case, RFC 9562 section 4) and repeats the one the server sent is no conflict. The id is the
   URL's, which the host resolves (a missing resource is its 404), so the validator's issues are
   never reported and the parsed id is the document's text.
5. `lid` is a 400 unless `lids` is true; with `lids`, an update MAY identify the resource by `lid`
   instead of `id`.
6. `attributes`, when present, MUST be an object; each name MUST be a declared attribute (400 at
   `pointer/attributes/<name>`) that the operation writes (`writable`, 5.1; 403 `FORBIDDEN` at the
   same pointer, `#crud-creating-responses-403`, `#crud-updating-relationship-responses-403`);
   @-Members are skipped.
7. `relationships`, when present, MUST be an object; each name MUST be a declared relationship (400)
   that the operation writes (403 at `pointer/relationships/<name>`), and each value a relationship
   object with a `data` member (400); `data` is parsed with 9.1 for the declared cardinality and
   type, `lids` passed through (`#crud-updating-resource-relationships`). The 403 items join the
   others in one error: a document refused only for the fields it writes answers 403, and one with
   any other refusal answers 400 with every item (4.3).
8. With no structural errors, a create's client-generated id is validated by `validate.id`, when the
   definition has it, and the attributes (an empty object when absent) by the definition's `create`
   or `update` Standard Schema; each issue becomes a `VALIDATION_FAILED` (422) object whose pointer
   is `pointer/id` or `pointer/attributes` plus the issue path, the id's first. JSON:API asks a
   client-generated id to be "a universally unique identifier" and leaves its spelling to the
   server, whose keys decide it (`#crud-creating-client-ids`); the parsed `id` and `attributes` are
   the validators' output. The issue's `code` and `expected`, when they are strings, become the
   item's `reason` and `expected`, which `@nizam-os/ban-core`'s JSON:API format renders as
   `meta.code` and `meta.expected`; nothing else of a vendor's issue is kept. The detail is the
   issue's `message`, the application's text (4.4): @nizam-os/resource-core's and Zod 4.6's messages
   name what was expected, never the value, while Valibot 1.5's defaults quote the received value,
   so an application on Valibot gives its schemas messages of its own. Without a validator the
   attributes pass through.

Returns
`ParsedResourceObject<TAttributes, TLinkage> = { type, id, lid, attributes, relationships, meta }`
with `relationships` keyed by the names the document carried.

`parseCreateDocument(resource, body, options?)` and
`parseUpdateDocument(resource, body, id, options?)` take `primaryData(body)` (400 unless `body` is
an object with a `data` member) and type `attributes` as `CreateAttributesOf` / `UpdateAttributesOf`
and `relationships` as `ResourceLinkage`, or `RequestLinkage` when `options.lids` is `true`.

`RequestResourceObject` and `RequestDocument` type a request as a client sends it.

### 9.3 Relationship documents (`relationship-document.ts`)

`parseToOneRelationshipDocument(body, { type })` returns an identifier of `type` or `null`;
`parseToManyRelationshipDocument(body, { type })` returns an array of identifiers of `type`,
possibly empty. The body MUST have `data` (400 at `""`); a wrong shape is 400 at `/data`; a wrong
type is 409 at `/data/type` or `/data/<index>/type` (`#crud-updating-to-one-relationships`,
`#crud-updating-to-many-relationships`).

### 9.4 Cardinality helpers (`cardinality.ts`)

`toOneLinkage(linkage)` and `toManyLinkage(linkage)` narrow a `ResourceLinkage | undefined` by the
cardinality the caller knows, passing `undefined` through for a relationship the document did not
carry. A mismatch is a programming error and throws `TypeError`.

Tests: `resource-document.test.ts`, `resource-update.test.ts` (an update's id matched to the
request's by text and by `validate.id`'s output), `resource-client-id.test.ts` (a create's client
id, and an atomic update's id matched to its target's), `relationship-document.test.ts`,
`cardinality.test.ts`.

---

## 10. Hono integration (`@nizam-os/hono-jsonapi`, `packages/hono-jsonapi/src/`)

`@nizam-os/hono-jsonapi` depends on `@nizam-os/jsonapi-core`, re-exports everything of both its
subpaths (`export *`, so the bindings are the core's own), and adds the functions of this section
and 11.1. Its peer dependencies are `hono` and `@nizam-os/hono-ban` (ADR 0014).

### 10.1 `jsonApi(options?)` and types (`middleware.ts`, `types.ts`)

`jsonApi({ extensions?, profiles? })` runs 3.3 over the request headers. A failure is thrown: its
415 or 406 carries `Vary: Accept` in the error's headers, and `app.onError` renders it (10.5). On
success the result is stored as the `jsonApi` context variable
(`JsonApiContext = { request, extensions, profiles }`, typed through `JsonApiEnv`), downstream runs,
and when the response is a JSON:API response `Vary: Accept` is added without duplicating an existing
`Accept` or `*` (`#content-negotiation-servers`: servers that support `ext` or `profile` SHOULD send
`Vary: Accept`; RFC 9110 12.5.5).

### 10.2 `respond` (`respond.ts`, ADR 0005)

- `respond(c, document)` (200) and `respond(c, document, status, headers?)`: `c.json` with
  `Content-Type` from
  `formatJsonApiMediaType({ ext: document.jsonapi?.ext, profile: document.jsonapi?.profile })`, so
  the header and the body cannot disagree (`#content-negotiation-servers`: the response MUST specify
  the extensions and profiles applied). A 201 gets `Location` from the resource's `links.self`
  (string or link object `href`) unless `headers` carries one (`#crud-creating-responses-201`:
  `Location` MUST match `links.self` when both are present). A caller header whose name matches a
  fixed one case-insensitively is dropped: Hono applies header records in key order, and a lowercase
  `content-type` would otherwise win. The return type is `JsonApiResponse<TDocument, TStatus>` for
  Hono's RPC inference.
- `respondError(c, error, base?, headers?)`: `errorDocument(error, base)` with `error.status`, the
  error's own headers (`Allow`, `Vary`), which win over `headers`, and the bare media type: no
  extension or profile applies to an error document. A bare rendering: no error id header, no
  report; `errorHandler` does those for errors that are thrown.
- `isJsonApiResponse(response)`, `varyAccept(current)`.

### 10.3 `readDocument(c)` (`body.ts`)

415 unless the request `Content-Type` parses as the JSON:API media type (`#content-negotiation-all`:
clients MUST send documents with it); 400 `MALFORMED_JSON` when the body is not JSON. Media type
parameters were already checked by `jsonApi()`.

### 10.4 Validators (`validators.ts`)

Each is a `MiddlewareHandler` in the shape of Hono's `validator` and stores its result for
`c.req.valid()`. A rejected request throws the parser's `BanError` for `app.onError` to render
(10.5); Hono's default error handler answers a thrown `BanError` through its `getResponse()`, so the
rejection is a JSON:API document even on an app without `errorHandler()`, without the handler's id
header and report.

| Validator                                                  | Target  | Stored value                                                                                                                                                                         |
| ---------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `queryValidator(resource)`                                 | `query` | `ParsedQuery<TSort, TFilter>` from `parseQuery(resource, <query string of c.req.url>)`                                                                                               |
| `bodyValidator(resource, { operation: 'create' })`         | `json`  | `ParsedResourceObject<CreateAttributesOf<TResource>>`                                                                                                                                |
| `bodyValidator(resource, { operation: 'update', param? })` | `json`  | `ParsedResourceObject<UpdateAttributesOf<TResource>>`; `data.id` MUST equal the `:id` route parameter (`param`, default `id`); a route without it throws `TypeError` at request time |
| `relationshipValidator(resource, name, 'one')`             | `json`  | `ResourceIdentifier \| null`                                                                                                                                                         |
| `relationshipValidator(resource, name, 'many')`            | `json`  | `ReadonlyArray<ResourceIdentifier>`                                                                                                                                                  |

`relationshipValidator` throws `TypeError` at setup for an undeclared relationship or a cardinality
that disagrees with the definition; `name` is typed as `RelationshipNameOf<TResource>`. A
relationship that `writable.update` leaves out is refused with 403 `FORBIDDEN` before the body is
read, whatever the method ("A server MUST return 403 Forbidden in response to an unsupported request
to update a relationship", `#crud-updating-relationship-responses-403`), so an application may mount
every relationship's route and let the definition decide.

### 10.5 Handlers (`handlers.ts`, ADR 0014)

- `errorHandler(options?)` for `app.onError` is a @nizam-os/hono-ban handler:
  `createBan({ errors: ERROR_CATALOG, format: jsonApi({ ...format, mixedEntries: true, document }) }).onError(handlerOptions)`,
  where `document` and `format` are this package's options and the rest (`ErrorHandlerOptions<E>`
  extends @nizam-os/hono-ban's `HandlerOptions<E, JsonApiCatalog>`) are @nizam-os/hono-ban's:
  `onReport(report, c)` (called exactly once, anything it throws is swallowed), `headers` (error
  headers and `Content-Type` win), `map` (receives the handler's instance, whose catalog is
  `ERROR_CATALOG` over the built-ins), `includeStack`, `transform`, `requestIdHeader`, `requestId`,
  `traceId`, `errorIdHeader`, `maxBodyBytes` (@nizam-os/ban-core SPEC 6 and 6.11). `document` adds
  top-level `jsonapi`, `links`, and `meta` members to every error document; `format` is the JSON:API
  format's own options (`typeLinkBaseUrl`, `aboutLink`, `includeId`, `traceIdMetaKey`),
  `mixedEntries` being always on since this package's errors combine entries.
- What it renders: a `BanError` as is (this package's, the application's own instance's, or any
  other library's on @nizam-os/ban-core); Hono's `HTTPException` with a 4xx or 5xx status adopted by
  status (@nizam-os/ban-core's primary entry for that status, `detail` from the message unless
  empty, its response headers kept except the body-describing ones, the exception as `cause`); an
  `HTTPException` outside those classes passed through as its own `getResponse()` (a thrown
  redirect); anything else as a constant 500 whose `detail` is "An unexpected error occurred", the
  thrown value on `cause` for the report. Every response carries
  `Content-Type: application/vnd.api+json`, `Cache-Control: no-store` unless `headers` sets one, the
  error id in `X-Error-Id` and in each error object's `id`, and `meta.traceId` when the request
  carried a W3C `traceparent`.
- `notFoundHandler({ document?, headers? })` for `app.notFound`: a 404 `NOT_FOUND` document with
  detail "No resource exists at the requested URL" through `respondError`.

Tests: `middleware.test.ts`, `respond.test.ts`, `body.test.ts`, `validators.test.ts`,
`validators.test-d.ts`, `handlers.test.ts`.

---

## 11. Atomic operations (`@nizam-os/jsonapi-core/atomic`, `@nizam-os/hono-jsonapi/atomic`, ADR 0010, ADR 0013)

Types (`types.ts`):

- `OperationCode = 'add' | 'update' | 'remove'`;
  `OperationTarget = { type; id?; lid?; relationship? }`.
- `ResolvedResourceObject<TAttributes> = { type; id; lid; attributes; relationships: Record<string, ResourceLinkage>; meta }`:
  the operation's `data` with every `lid` reference replaced by the id the earlier operation
  produced.
- `OperationContext<TTransaction, TContext = unknown> = { ctx, tx, index, pointer, meta }`: `ctx` is
  what the host handed the processor for this request (Hono's `Context` under
  `@nizam-os/hono-jsonapi`).
- `ResourceHandlers<TResource, TTransaction, TContext> = { resource; create?; update?; remove?; relationships? }`
  where `create({ data })` and `update({ id, data })` return a row (the result's `data`) or
  `undefined` (an empty result), `remove({ id })` returns nothing, and `relationships[name]` is
  `{ update?, add?, remove? }` over linkage. Handlers MAY be synchronous (`MaybePromise`).
- `AnyResourceHandlers` is the erased form the processor stores; its handler members are declared
  through method signatures so typed handlers are assignable (bivariant parameters).
- `AtomicOptions<TTransaction, TContext> = { resources; transaction(ctx, run); resolveHref? }`.
  `transaction` MUST call `run` once and MUST roll back whatever `run` did when it rejects.
- `OperationsOutcome = { results, document }` and `OperationsProcessor<TContext>` (11.1);
  `OperationsResultDocument` is the `atomic:results` document.

### 11.1 `operationsProcessor(options)` (`process.ts`), `assertOperationsContentType` (`content-type.ts`), and `atomicOperations(options)` (`@nizam-os/hono-jsonapi/atomic`, `handler.ts`)

The core processes; the host (an HTTP adapter) does what needs the request and the response.
`operationsProcessor(options)` returns
`OperationsProcessor<TContext> = (body, ctx) => Promise<OperationsOutcome>`; listing a resource type
twice throws `TypeError` at setup, and so do resources whose definitions' `atomic.max` differ (5.1,
ADR 0023), since one endpoint takes one cap. Per call, in order:

1. `parseOperationsDocument(body, { maxOperations, resolveHref })` (11.2), `maxOperations` the
   `atomic.max` the resources' definitions share, `DEFAULT_MAX_OPERATIONS` when there are none.
2. `options.transaction(ctx, run)`; `run` executes every operation in document order (11.4) with one
   `Lids` registry (11.3) and `OperationContext = { ctx, tx, index, pointer, meta }`. A `BanError`
   from an operation is rebuilt by `errorAtOperation(error, pointer)` with the operation's pointer
   as the path of every item without one (an error without items becomes one item with the error's
   `message` as `detail`), so each error object gets `source.pointer` set to the operation's pointer
   (extension: errors SHOULD point at the operation); any error aborts `run`, so the transaction
   rolls back, and escapes the processor as it is. `errorAtOperation` is exported for a host whose
   `transaction` maps a failure once it ended, outside the processor, so that error points at its
   operation alike; it throws `TypeError` for a pointer that is not one (RFC 6901).
3. The outcome is `{ results, document }`: `results` holds one result per operation, in order;
   `document` is `{ jsonapi: { version: '1.1', ext: [extension] }, 'atomic:results': results }` when
   at least one result carries `data`, and `undefined` when none does (extension: "MUST include the
   `atomic:results` array"; `204 No Content` allowed "if all results are empty").

`assertOperationsContentType(value)` throws a 415 unless `value` parses as the JSON:API media type
with the extension in `ext` (extension: the request "MUST ... specify the extension in the `ext`
media type parameter"). Other parameters are the negotiation layer's concern (3.3).

`atomicOperations(options)` in `@nizam-os/hono-jsonapi/atomic` is a Hono `Handler` built on the two;
`ctx` is Hono's `Context<E>` (`AtomicOptions<TTransaction, Context<E>>`). Per request, in order:

1. A method other than `POST` is 405 with `Allow: POST` (extension: "MUST be sent via POST").
2. `assertOperationsContentType(c.req.header('content-type'))`.
3. `readDocument` (10.3), then the processor with `c` as `ctx`.
4. No document: `204 No Content`. Otherwise `200` with the document through `respond`, which puts
   the extension on `Content-Type`.

Every failure in 1 to 4 is thrown for `app.onError` to render (10.5): the 405 carries `Allow: POST`
in the error's headers; a handler's error propagates after the rollback.

### 11.2 Document and targets (`parse-document.ts`, `parse-target.ts`)

`parseOperationsDocument(body, { maxOperations, resolveHref? })` throws one 400 listing every
problem, each pointing into the request:

- The document MUST be an object whose top-level members are among `atomic:operations`, `jsonapi`,
  `links`, `meta`, and @-Members.
- `atomic:operations` MUST be a non-empty array with at most `maxOperations` entries.
- Each operation (`/atomic:operations/<i>`) MUST be an object with members among `op`, `ref`,
  `href`, `data`, `meta`; `op` MUST be `add`, `update`, or `remove`; `meta` MUST be an object when
  present.
- An operation MAY carry `ref` or `href`, not both. `ref` MUST be an object with a string `type`,
  exactly one of string `id` and string `lid`, an optional string `relationship`, and no other
  members. `href` is accepted only when `resolveHref` is given and returns a target; otherwise 400
  at `/atomic:operations/<i>/href`.

The result is `RawOperation = { index, pointer, op, target, targetMember, hasData, data, meta }` in
order, with `data` untouched: it is parsed against the targeted definition during execution.
`targetMember` names the member the target came from, `ref` or `href`.

### 11.3 Local identities (`lids.ts`)

`Lids` maps `(type, lid)` to the id an earlier `add` produced. `define` rejects a repeated `lid` for
a type (400); `resolve` rejects a `lid` no earlier operation created (400, at the pointer of the
reference). `identifier`, `identifiers`, and `linkage` replace `lid` identifiers with `id`
identifiers, keeping `meta`.

### 11.4 Execution (`execute*.ts`)

`executeOperation` classifies by `op` and target:

| Operation                        | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add`, no relationship target    | The target, when given, MAY only name a collection (no `id` or `lid`). The type comes from the target or from `data.type`. Unknown type: 404 at `.../ref/type` or `.../data/type`. No `create` handler: 403. `data` is parsed with 9.2 (`create`, `lids` on, pointer `.../data`), `lid` references resolved, the handler called, the returned row serialized as the result's `data`. A `data.lid` is defined from the result's id or the client-generated id; a handler that returns nothing for an operation with a `lid` is a `TypeError`. |
| `update`, no relationship target | Type from the target or `data.type`; 404 and 403 as above. The id is the target's (`lid` resolved), else `data.id`, else `data.lid` resolved; a `data.lid` that disagrees with the target's `lid` is 409 at `.../data/lid`. `data` is parsed as an `update` with that id.                                                                                                                                                                                                                                                                    |
| `remove`, no relationship target | A target is required (400). 404 and 403 as above. `remove({ id })`; the result is empty.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| any `op` with `ref.relationship` | The relationship MUST be declared (400 at `.../ref/relationship`). `add` and `remove` apply only to to-many relationships (400 at `.../op` for to-one). `data` is required and parsed as linkage of the declared cardinality and type with `lids` on (`add` and `remove`: always an array). No handler for the `op`, or a relationship that `writable.update` leaves out: 403. The result is empty.                                                                                                                                          |

An error about the target points at the member of `ref` at fault (`.../ref/type`, `.../ref/lid`,
`.../ref/relationship`), or at `.../ref` for a target without `id` or `lid`; for a target the
resolver read from `href`, every such error points at `.../href`, the one string that holds every
member then (extension: an error's pointer names "the source of the problem in the request
document").

Results carry `data` only when a handler returned a row (extension: results for `remove` and
relationship operations MUST NOT contain `data`).

Tests: `parse-document.test.ts`, `lids.test.ts`, `content-type.test.ts`, `process.test.ts` (the
extension's examples, lid flow, the empty outcome, the host context, rollback, pointers),
`process-semantics.test.ts` (every rule above), `writable.test.ts` (the fields an `add` or an
`update` writes, a relationship operation on a relationship updates do not write, no handler run),
and `process-coverage.test.ts` in the core; `atomic/handler.test.ts` in `@nizam-os/hono-jsonapi`
(405, 415, malformed JSON, 200 with the extension on `Content-Type`, 204, rendering and propagation
after the rollback); `atomic.e2e.test.ts` over HTTP.

---

## 12. Packaging

Three packages under `packages/`, each ESM only with `type: module`, `sideEffects: false`, `files`
of `dist`, `CHANGELOG.md`, `LICENSE`, `README.md`, `engines.node >= 22.12.0`, and
`publishConfig.provenance` (ADR 0013).

- `@nizam-os/jsonapi-core`: `dependencies.@nizam-os/ban-core` (`workspace:^`, a caret range when
  published), no `peerDependencies`. `@nizam-os/hono-jsonapi`: `dependencies.@nizam-os/jsonapi-core`
  (`workspace:^`, a caret range when published) and `peerDependencies.hono >= 4.13.7` (the first
  release no published Hono advisory affects) and `@nizam-os/hono-ban >= 2.0.0` (ADR 0014), and CI
  runs its tests on hono 4.13.7; one copy of `@nizam-os/ban-core` and of `hono` in the graph is what
  keeps `instanceof` true across the packages.
- `@nizam-os/jsonapi-client`: `dependencies.@nizam-os/jsonapi-core` (`workspace:^`, a caret range
  when published), no `peerDependencies`; its `exports` map has `.` and `./package.json` (15.9).
- Each of the other two `exports` maps has `.`, `./atomic`, and `./package.json`, with declarations
  next to the `dist/*.js` files. tsdown rewrites both maps from its entry map on every build
  (`exports.devExports: 'source'`): the in-repo map resolves each subpath to `./dist/*.js` by
  default and to `./src/**/index.ts` under the `source` condition, which only
  `packages/hono-jsonapi/tsconfig.json` (`customConditions`) and its Vitest project
  (`ssr.resolve.conditions`) enable; `publishConfig.exports` holds the dist-only map that
  `pnpm publish` and `pnpm pack` apply. CI fails on a diff of either `package.json`.
- Built with `platform: 'neutral'`, `target: es2023`, source maps, declarations from
  `isolatedDeclarations` (ADR 0004); `@nizam-os/jsonapi-core`'s build leaves `@nizam-os/ban-core`
  external and `@nizam-os/hono-jsonapi`'s leaves `@nizam-os/jsonapi-core`, `hono`, and
  `@nizam-os/hono-ban` external. `publint --strict` and `attw --profile esm-only` run on every build
  and in `check:pkg`.
- Versions are independent; Changesets patch-bumps `@nizam-os/hono-jsonapi` when its
  `@nizam-os/jsonapi-core` range moves. Both are published with npm provenance through trusted
  publishing (`release.yml`), one trusted publisher per package.

---

## 13. Constants (`packages/jsonapi-core/src/internal/constants.ts`)

| Name                                  | Value                                                                                        | Exported |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| `JSON_API_MEDIA_TYPE`                 | `application/vnd.api+json`                                                                   | yes      |
| `JSON_API_VERSION`                    | `1.1`                                                                                        | yes      |
| `ATOMIC_OPERATIONS_EXTENSION`         | `https://jsonapi.org/ext/atomic`                                                             | yes      |
| `CURSOR_PAGINATION_PROFILE`           | `http://jsonapi.org/profiles/ethanresnick/cursor-pagination/`                                | yes      |
| `UNSUPPORTED_SORT_TYPE`               | `https://jsonapi.org/profiles/ethanresnick/cursor-pagination/unsupported-sort`               | yes      |
| `MAX_SIZE_EXCEEDED_TYPE`              | `https://jsonapi.org/profiles/ethanresnick/cursor-pagination/max-size-exceeded`              | yes      |
| `RANGE_PAGINATION_NOT_SUPPORTED_TYPE` | `https://jsonapi.org/profiles/ethanresnick/cursor-pagination/range-pagination-not-supported` | yes      |
| `MEMBER_NAME_PATTERN`                 | section 2.1                                                                                  | no       |
| `EXTENSION_NAMESPACE_PATTERN`         | `^[A-Za-z0-9]+$`                                                                             | no       |
| `PAGE_SIZE_PATTERN`                   | `^[0-9]+$`                                                                                   | no       |
| `QUOTABLE_PATTERN`                    | `^[A-Za-z0-9_.[\]-]{1,64}$` (4.4)                                                            | no       |
| `PROTO_KEYS`                          | `__proto__`, `constructor`, `prototype`                                                      | no       |
| `RESERVED_QUERY_FAMILIES`             | `include`, `fields`, `sort`, `page`, `filter`                                                | no       |
| `CURSOR_PAGE_MEMBERS`                 | `size`, `after`, `before`                                                                    | no       |
| `DEFAULT_PAGE_SIZE`                   | 20                                                                                           | no       |
| `DEFAULT_MAX_PAGE_SIZE`               | 100                                                                                          | no       |
| `DEFAULT_MAX_OPERATIONS`              | 10, a definition's `atomic.max` when it gives none (5.1, 11.1)                               | `atomic` |

---

## 14. Test plan

One Vitest run over three projects (`packages/*/vitest.config.ts`), each with `typecheck` enabled
for its `*.test-d.ts`; `@nizam-os/hono-jsonapi`'s project resolves `@nizam-os/jsonapi-core` from
source (section 12). V8 coverage thresholds of 90% for statements, branches, functions, and lines
over `packages/*/src/` combined (the `index.ts` barrels excluded). Every test names the clause or
server choice it pins. Fixtures with IO (`test-fixtures.ts`) are real in-memory stores, not mocks of
the packages' own modules.

| Area                                | Files                                                                                                                                                                                    | What is pinned                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Internal                            | `object.test.ts`, `pointer.test.ts`, `quotable.test.ts`                                                                                                                                  | prototype-safe reads, RFC 6901 escaping and unescaping, the quotable token's characters and bounds                                                                                                |
| Media types                         | `parse.test.ts`, `json-api.test.ts`                                                                                                                                                      | RFC 9110 grammar, case rules, quoting, `q`, `ext` and `profile` lists                                                                                                                             |
| Negotiation                         | `negotiate.test.ts`                                                                                                                                                                      | each rule of 3.3                                                                                                                                                                                  |
| Errors                              | `json-api-error.test.ts`, `error-document.test.ts`, `errors/request-text.test.ts`, `atomic/request-text.test.ts`                                                                         | catalog closure and spreading, item mapping, both call forms, status derivation, document order, no hostile request text in any detail (4.4)                                                      |
| Documents                           | `member-name.test.ts`, `serialize.test.ts`, `build.test.ts`, `conformance.test.ts`                                                                                                       | member grammar, serialization rules, sparse fieldsets, `included` rules, full linkage, JSON Schema conformance                                                                                    |
| Resources                           | `define-resource.test.ts`, `define-resource.test-d.ts`, `links.test.ts`, `create-define-resource.test.ts`, `create-define-resource.test-d.ts`, `client-types.test-d.ts`, `paths.test.ts` | every definition-time rejection, inference, the links convention, configured defaults, the resolved `writable` sets, the client types, the paths links name                                       |
| Query                               | `parse-query.test.ts`, `parse-families.test.ts`, `parse-filter.test.ts`, `parameter-name.test.ts`                                                                                        | dispatch, aggregation, each family, the filter grammar                                                                                                                                            |
| Pagination                          | `links.test.ts`, `paginated.test.ts`, `errors.test.ts`                                                                                                                                   | link rebuilding, meta members, the profile's error objects                                                                                                                                        |
| Requests                            | `resource-document.test.ts`, `resource-update.test.ts`, `resource-writable.test.ts`, `resource-client-id.test.ts`, `relationship-document.test.ts`, `cardinality.test.ts`                | pointers for every structural error, 403/409/422 cases, the fields each operation writes, a client id's validation, an update's id in another spelling, lids                                      |
| Hono (`@nizam-os/hono-jsonapi`)     | `middleware.test.ts`, `respond.test.ts`, `body.test.ts`, `validators.test.ts`, `validators.test-d.ts`, `handlers.test.ts`, `atomic/handler.test.ts`                                      | `Vary`, `Content-Type` derivation, `Location`, validator storage and typing, the @nizam-os/hono-ban handler's rendering, ids, and reports, the operations endpoint's 405, 415, 204, and rendering |
| Atomic                              | `parse-document.test.ts`, `lids.test.ts`, `content-type.test.ts`, `process.test.ts`, `process-semantics.test.ts`, `writable.test.ts`, `process-coverage.test.ts`                         | the extension's examples, the host context, and every processing rule                                                                                                                             |
| Client (`@nizam-os/jsonapi-client`) | section 15.9                                                                                                                                                                             | section 15                                                                                                                                                                                        |

### 14.1 End-to-end suite (`e2e/jsonapi/`)

A private workspace package that depends on `@nizam-os/jsonapi-core`, `@nizam-os/hono-jsonapi`, and
`@nizam-os/jsonapi-client` through `workspace:*`, so imports resolve through the published `exports`
maps into each `dist/` (never the `source` condition) and `tsc` checks the emitted declarations.
`e2e/jsonapi/support/` holds a blog API (people, articles, tags; a keyset pagination engine over an
in-memory store; a snapshot transaction) built only from the packages: `store.ts` and `resources.ts`
import `@nizam-os/jsonapi-core`, the routes and handlers `@nizam-os/hono-jsonapi`. It serves every
link its documents name: each resource, relationship, and related link, a person's articles paged
like the collection. Each file starts it on `@hono/node-server` and asserts over `fetch`;
`clients.ts` builds the client's transport at the server's origin and records each request as the
server received it.

| File                               | Covers                                                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package-surface.e2e.test.ts`      | the exact export lists of all five subpaths, and that `@nizam-os/hono-jsonapi` re-exports the core's own bindings                                                                                                                     |
| `fetch.e2e.test.ts`                | resources, compound documents, sparse fieldsets, sort, filter, 400 and 404 documents, constant 500                                                                                                                                    |
| `pagination.e2e.test.ts`           | profile on `Content-Type`, default and max size, walking `next` and `prev`, the profile's errors                                                                                                                                      |
| `mutations.e2e.test.ts`            | create with 201 and `Location`, pointers for bad documents, 403 for a field a write does not accept, alone and beside a 400, update, relationship endpoints and a read-only relationship's 403, delete                                |
| `negotiation.e2e.test.ts`          | 415, 406, usable instances, requested profiles, the atomic extension on both headers                                                                                                                                                  |
| `atomic.e2e.test.ts`               | lid flow, positional results, 204, rollback with pointers, a field an operation does not write, 415 and 400 for bad requests                                                                                                          |
| `custom-catalog.e2e.test.ts`       | an application's own @nizam-os/hono-ban instance rendering the packages' errors, its entries, and `HTTPException`                                                                                                                     |
| `client-types.e2e.test.ts`         | the client types the blog's definitions carry, read through the built declarations (5.3)                                                                                                                                              |
| `declarations.e2e.test.ts`         | `tsc --declaration` over modules that export definitions: no diagnostics, and only package entry points named                                                                                                                         |
| `node-types.e2e.test.ts`           | every subpath of the three packages compiled by `tsc` as a Node consumer without the DOM library compiles it (`lib: ["es2023"]`, `types: ["node"]`, `skipLibCheck` off): no diagnostics in their declarations or in those they import |
| `client-reads.e2e.test.ts`         | the built client's pages of records, the walk along `next` and `prev`, cursors, compound documents resolved along the include paths sent, sparse fieldsets, and their types (15.4, 15.6, 15.8)                                        |
| `client-writes.e2e.test.ts`        | the documents a create and an update send and the server stores, the records of a 201 and a 200, a remove's 204, and a member the types refuse, answered 403 (15.4)                                                                   |
| `client-relationships.e2e.test.ts` | linkage by cardinality, related records with the target's fieldset and paged, linkage replaced, added to, and removed from, and a read-only relationship refused in the types and with 403 (15.4)                                     |
| `client-errors.e2e.test.ts`        | each error status into a `ResponseError` with its message naming only the call, ids refused before sending, an aborted request passed on (15.3, 15.7)                                                                                 |
| `client-transport.e2e.test.ts`     | the headers and `Accept-Language` the server receives, in order and per request, and a page link to another origin refused (15.2, 15.8)                                                                                               |

### 14.2 Runtime smoke test (`e2e/jsonapi/smoke/`)

`app.ts` is the same blog API, so every package loads in each runtime; `checks.ts` holds
runtime-neutral assertions over every feature area; `run.ts` drives it in-process on Bun and Deno;
`worker.ts` is the Workers module and `workerd.ts` bundles it with tsdown (`platform: 'neutral'`)
and runs it in Miniflare's workerd. `client-checks.ts` calls a blog of its own through the client,
in-process, inside the runtime that hosts the app, which answers `GET /client-checks` with the
outcome; each harness reports it beside the app's checks (15.9). `pnpm test:runtimes` runs all
three; CI runs them on every pull request and every push to `main`.

---

## 15. The client (`@nizam-os/jsonapi-client`, `packages/jsonapi-client/src/`, ADR 0017, ADR 0019)

`@nizam-os/jsonapi-client` calls a JSON:API server from the definitions the server is built from:
the paths come from their links (5.4), the query from their capabilities (5.2), and every type from
`'~types'` (5.3). It depends on `@nizam-os/jsonapi-core` and on nothing else, imports no framework,
and uses web standards only (`fetch`, `Request`, `Response`, `Headers`, `URL`, `URLSearchParams`),
so the same build runs in browsers, workers, Node, Bun, and Deno. Its declarations name those and no
alias only the DOM library declares: `headers` take `HeadersInit`, the Fetch Standard's, vendored in
`internal/headers-init.ts` as the DOM library types it, since Node's types declare `Headers` but not
the alias (14.1). The client reads a definition's `type`, `relationships`, `links`, and
`query.search`; it never calls `serialize` or a validator.

### 15.1 Surface and module map

| Subpath                    | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@nizam-os/jsonapi-client` | Values: `createTransport`, `createClients`, `serializeQuery`, `deserialize`, `ResponseError`, `isResponseError`, `pageCursors`, `cursorOf`, `operationsOf`, `sendOperations`, `operationOf`; types: `Transport`, `TransportOptions`, `CallOptions`, `Clients`, `ResourceClient`, `RecordOf`, `AnyRecord`, `Identifier`, `IdentifierObject`, `RecordMembers`, `Query`, `ListQuery`, `GetQuery`, `FieldsInput`, `FilterInput`, `TypedFilterInput`, `WideFilterInput`, `Conditions`, `Condition`, `FilterValue`, `FilterValues`, `PageInput`, `CustomValues`, `CreateInput`, `UpdateInput`, `LinkageInput`, `ReadResult`, `WriteResult`, `Deserialized`, `DeserializeOptions`, `ResponseErrorInit`, `ResponseErrorHeaders`, `PageCursors`, `Operation`, `OperationBuilders`, `CreateOperationInput`, `UpdateOperationInput`, `LocalIdentifier`, `OperationsResult`, `OperationResult`, `OperationPointer` |

```
packages/jsonapi-client/src/
  index.ts                     root entry
  internal/object.ts           isRecord(), ownMember(), defineMember(): prototype-safe reads of response JSON
  internal/definition-types.ts the type helpers over definitions the query, record, and client types share
  internal/headers-init.ts     HeadersInit, the Fetch Standard's, as the DOM library types it (15.2, 15.3)
  transport/
    origin.ts                  assertOrigin(), atOrigin(): the origin and the links the client follows (15.2, 15.8)
    transport.ts               createTransport() (15.2)
    send.ts                    send(): negotiation headers, the body, reading the response (15.3)
  query/
    types.ts                   Query, ListQuery, GetQuery, FilterInput (15.5)
    serialize-query.ts         serializeQuery() (15.5)
    serialize-filter.ts        the filter family (15.5)
  document/
    types.ts                   AnyRecord, Deserialized (15.6)
    deserialize.ts             deserialize() (15.6)
    members.ts                 links, the jsonapi object, relationship objects, identifiers, held to their shapes (15.6)
    include-tree.ts            include paths as a tree (15.6)
  errors/response-error.ts     ResponseError, isResponseError() (15.7)
  client/
    types.ts                   Clients, ResourceClient, and the results (15.4)
    write-types.ts             what the writes take, a call's and an operation's: CreateInput, LinkageInput, LocalIdentifier (15.4, 17.1)
    record-types.ts            RecordOf: records typed by the definitions and the query (15.6)
    create-clients.ts          createClients() (15.4)
    resource-client.ts         the methods of one resource (15.4)
    wide-client.ts             the methods as the implementation types them, before createClients types them (15.4)
    urls.ts                    the URLs the calls reach: paths, ids, the origin (15.4)
    request-documents.ts       the documents a write sends (15.4)
    results.ts                 the results the calls read, each held to the call's shape (15.4)
    follow.ts                  next() and prev() (15.8)
  pagination/cursors.ts        pageCursors(), cursorOf() (15.8)
  operations/
    types.ts                   Operation, the builders' inputs, and the results (17)
    operations-of.ts           operationsOf(): the operations of one definition (17.1)
    send-operations.ts         sendOperations(): one request for every operation (17.2)
    operation-results.ts       the results, each held to its operation's shape (17.2)
    operation-of.ts            operationOf(): the operation an error object points at (17.3)
```

### 15.2 `createTransport(options)` (`transport.ts`, `origin.ts`)

`TransportOptions = { origin, headers?, language?, fetch? }`; the result is a `Transport`, an opaque
object the clients send through.

- `origin`: an absolute `http:` or `https:` URL that is its origin followed by `/` alone (its `href`
  is `` `${origin}/` ``), kept as its origin (`URL#origin`); user information, a path, a query, or a
  fragment, which every request would drop, throw `TypeError` naming `origin` and quoting nothing of
  it. It is where the client reaches the server. A definition's links may name another origin (an
  absolute `links.base`, ADR 0015); the client takes only their paths, so one set of definitions
  serves development, staging, production, and tests.
- `headers`: a `HeadersInit`, or a function returning one or a promise of one, called on every
  request so a rotating session token is current. They are applied first; the client's own `Accept`
  and `Content-Type` replace any they set (15.3).
- `language`: a function called on every request; a non-empty result is sent as `Accept-Language`
  (RFC 9110 12.5.4), replacing one `headers` set. An application on Paraglide passes `getLocale`.
- `fetch`: takes a `Request` and resolves to an object with `status`, `headers.get`, and `text()`,
  which a `Response` of any realm or library has; by default the global `fetch`, looked up at
  request time, so a polyfill or a test double installed later is used. It is called as a plain
  function, never as a method of the options, since a browser's `fetch` called on another object
  throws "Illegal invocation".
- A `Transport` has no public members. `createClients` and `sendOperations` read it through an ES
  private field, so a value `createTransport` did not make throws `TypeError` there
  (`<caller>: transport must be made by createTransport`).

### 15.3 Requests and responses (`send.ts`)

- Every request carries `Accept: application/vnd.api+json`; one with a document carries
  `Content-Type: application/vnd.api+json` and the document as `JSON.stringify` writes it, so a
  member set to `undefined` is left out and an attribute a create leaves out keeps the server's
  default (`#content-negotiation-all`: "Clients and servers MUST send all JSON:API payloads using
  the JSON:API media type in the Content-Type header"). Neither carries `profile`, since the Cursor
  Pagination profile needs no request parameter (8.1), and neither carries `ext` but an Atomic
  Operations request, which applies the extension and names it on both (17.2). The bare media type
  in `Accept` is also what a JSON:API 1.0 server requires. A request without a document carries no
  `Content-Type`, which would make a cross-origin `GET` preflighted (Fetch, CORS-safelisted request
  headers).
- Each call takes `CallOptions = { signal?, headers? }`; `headers` are applied after the transport's
  `headers` and `language`, so a call may set its own `Accept-Language`, and before the client's
  own. A `Content-Type` either set is removed from a request without a document.
- A response is read once, as text, and only through `status`, `headers`, and `text()`: the client
  never clones it and never tests it with `instanceof Response`, so a `fetch` that returns another
  realm's or library's response works.
- A 2xx response other than 204 is read as a document when its `Content-Type` is the JSON:API media
  type, parameters other than `ext` and `profile` ignored (`#content-negotiation-clients`), and its
  body is a JSON object with `data`, `errors`, or `meta`, or, answering a request that applies an
  extension, a member the extension defines (`#document-top-level`). A 204 has no document, and a
  202 has one only when its response is one. Any other 2xx is a `TypeError`
  (`<type> <call> answered <status> without a JSON:API document`), never quoting the body: the
  server broke the protocol, which no application handles.
- Any other status is a `ResponseError` (15.7). Redirects are fetch's (`redirect: 'follow'`); a
  rejected `fetch` (a network failure, an abort) reaches the caller as it is.

### 15.4 `createClients(definitions, transport)` (`create-clients.ts`, `resource-client.ts`)

`definitions` holds definitions by client name. Each one's paths are read with
`resourcePaths(definition, { caller: 'createClients' })` (5.4), so a definition whose links give
none throws its `TypeError`; two definitions with one type throw `TypeError`, since records find
their definition by type (15.6). The result holds a `ResourceClient` per name:

| Method                                      | Request                                                                         | Resolves to                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `list(query?, options?)`                    | `GET <collection>?<query>`                                                      | `ReadResult` of the records                                                  |
| `get(id, query?, options?)`                 | `GET <resource>?<query>`; `include` and `fields` only                           | `ReadResult` of the record                                                   |
| `create(input, options?)`                   | `POST <collection>` with `{ data: { type, id?, attributes?, relationships? } }` | `WriteResult` of the record                                                  |
| `update(id, input, options?)`               | `PATCH <resource>` with `{ data: { type, id, attributes?, relationships? } }`   | `WriteResult` of the record                                                  |
| `remove(id, options?)`                      | `DELETE <resource>`                                                             | `WriteResult` of nothing (`data` is `undefined`)                             |
| `relationship(id, name, options?)`          | `GET <relationship link>`                                                       | `ReadResult` of the linkage                                                  |
| `related(id, name, query?, options?)`       | `GET <related link>?<query>`                                                    | `ReadResult` of the related record, `null`, or records                       |
| `setRelationship(id, name, linkage, o?)`    | `PATCH <relationship link>` with `{ data }`                                     | `WriteResult` of the linkage                                                 |
| `addToRelationship(id, name, ids, o?)`      | `POST <relationship link>` with `{ data }`, to-many only                        | `WriteResult` of the linkage                                                 |
| `removeFromRelationship(id, name, ids, o?)` | `DELETE <relationship link>` with `{ data }`, to-many only                      | `WriteResult` of the linkage                                                 |
| `next(result, options?)`, `prev(...)`       | `GET` of `result.links.next` or `links.prev` (15.8)                             | `ReadResult` like `result`, or `undefined` when the link is `null` or absent |

- `definition` is the definition the client was made from, as it was passed: a binding that keys a
  cache by the request reads its query capabilities and serializes with it (`serializeQuery`, 15.5;
  16.2) without being handed the definition a second time. It is typed as the definition passed.
- An id fills the path's `{id}` percent-encoded (`encodeURIComponent`), as the links convention
  encodes it (5.1). An id that is empty, `.`, or `..` throws `TypeError` before anything is sent:
  the URL parser removes a dot segment, percent-encoded or not (URL Standard, single-dot and
  double-dot path segments), and an empty segment names the collection, so the request would reach
  another path with the transport's headers. A relationship method, or a write, naming a
  relationship the definition does not declare throws `TypeError` naming it, and so does a
  relationship method for one whose links give no path.
- Each call reads `data` of one shape: a list for `list`, a to-many `related`, `next`, and `prev`; a
  resource object for `get`, `create`, and `update`; a resource object or `null` for a to-one
  `related`; and linkage of the relationship's cardinality for the relationship calls. A document
  whose `data` has another shape throws `TypeError`
  (`<type> <call> answered <status> with data that is not <shape>`), never quoting the document, so
  a result's type is true; a read whose response holds no document throws the `TypeError` of 15.3.
- `ReadResult<TData> = { status, data, links, meta, jsonapi }` and
  `WriteResult<TData> = { status, data: TData | undefined, links, meta, jsonapi }`: a write's `data`
  is the document's `data` when the response holds it (201, 200), and `undefined` for a 204
  (`#crud-creating-responses-204`, `#crud-updating-responses-204`, `#crud-deleting-responses-204`),
  a 200 with `meta` alone (`#crud-updating-responses-200`, `#crud-deleting-responses-200`), and a
  202, whose document describes the processing rather than the resource
  (`#crud-creating-responses-202`); `remove`'s is always `undefined`. The document's `links`,
  `meta`, and `jsonapi` are kept in each case. A create carries no document back when the server
  stored it unchanged; the input then is the resource.
- The linkage a relationship call reads keeps each identifier's `meta` (`IdentifierObject`), as the
  relationship document holds it; a record keeps it in `$relationships` (15.6). `next` and `prev`
  page records: their argument is a `ReadResult` of records, a `list`'s, a to-many `related`'s, or
  an earlier page's, never linkage.
- `CreateInput = { id?, attributes?, relationships? }` and `UpdateInput` the same without `id`. A
  relationship's value is an id, an identifier object, `null` (to-one), or a list of ids or
  identifiers (to-many); an id becomes an identifier of the relationship's declared type
  (`#document-resource-identifier-objects`). An identifier object gives its `type` and `id` and
  nothing else, so a record passed as one sends only what identifies it.
- Types: the records are `RecordOf` (15.6) over the definitions passed, which resolve related types;
  a literal query passed to `list`, `get`, or `related` is read through a `const` type parameter, so
  its include paths and fieldsets are tuples, and a call without a query reads every field and each
  relationship's linkage. `create`'s `attributes` are `'~types'.create`, `update`'s
  `'~types'.update`, required when that input has a required member and `never` for an operation the
  definition does not serve, so no input compiles; `relationships` take the names `creatable` and
  `updatable` list, and are `never` when they list none, since an object type without members
  accepts any member; `setRelationship`, `addToRelationship`, and `removeFromRelationship` take the
  relationships `updatable` lists, to-many alone for the last two, and none when `'~types'.update`
  is `never`, since the server refuses a write to any other with 403
  (`#crud-updating-relationship-responses-403`; 10.4, 11.4, resource SPEC 19.3); `id` is accepted
  when `clientIds` is `true`; `list` takes `ListQuery` (15.5), with `page` only on a definition that
  paginates and `search` only on one with a search parameter; `get` and `related` take `GetQuery`.
  Both take `fields` only where `'~types'.fields` is `true`, keyed by the types 6.5 accepts: the
  definition's own and each type a segment of its declared include paths reaches through the
  definitions passed. A type's names are the attributes and relationships of its definition, any
  string when no definition passed has that type. The server stays the authority: the client checks
  none of this at run time, and `parseQuery` and the request parsers answer what the types would
  have caught (6, 9).

### 15.5 Query serialization (`serialize-query.ts`, `serialize-filter.ts`)

`serializeQuery(definition, query)` returns the `URLSearchParams` `parseQuery` (6) reads, its pairs
in this order, so one query always gives one URL:

| Member    | Parameters                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `include` | `include` with the paths joined by `,`; an empty list is `include=` (6.4)                                                        |
| `fields`  | `fields[<type>]` with the names joined by `,`, per type in key order; an empty list is the empty fieldset (6.5)                  |
| `sort`    | `sort` with the names joined by `,`, each `-`-prefixed for descending (6.6)                                                      |
| `page`    | `page[size]`, `page[after]`, `page[before]` (6.7)                                                                                |
| `filter`  | `filter[<field>]` for a bare value (`eq`), `filter[<field>][<operator>]` per operator, then `filter[or][<n>]...` per group (6.8) |
| `search`  | the definition's search parameter (5.2)                                                                                          |
| `custom`  | each name with its value, repeated for a list                                                                                    |

- A filter value is a string as it is, a finite number or a bigint by `String`, or a boolean as
  `true` or `false`; a list is the parameter repeated, one pair per value, never joined, since a
  comma belongs to the value (6.8). A number that is not finite throws `TypeError`.
- A member that is `undefined` is left out, as is a fieldset or custom parameter that is
  `undefined`. An empty list is refused with `TypeError` naming the parameter (`filter[author][in]`,
  a custom name), since repeating a parameter zero times sends nothing; an empty `include`,
  fieldset, or `sort` is the empty value the specification defines.
- `page.size` MUST be a positive safe integer (the profile's `^[0-9]+$`), otherwise `TypeError`
  naming `page.size`. `search` on a definition without a search parameter, or `page` on one that
  does not paginate, throws `TypeError`; the types reject both.
- Names are not checked against the definition: the types restrict them, and `parseQuery` reports
  what is left in one 400.
- `toString()` is the `application/x-www-form-urlencoded` serializer JSON:API names
  (`#appendix-query-details-parsing`): square brackets percent-encoded
  (`#appendix-query-details-square-brackets`), a space as `+`, and a comma as `%2C`, which
  `parseQuery` decodes before it splits `include`, `fields`, and `sort`. A list keeps its order: a
  `sort` is applied in the order given (`#fetching-sorting`).

Tests: `serialize-query.test.ts` (each member, order, values, refusals), `round-trip.test.ts`: every
query generated from the blog's definitions is what `parseQuery` reads back from its serialization,
and `types.test-d.ts`: what `ListQuery` and `GetQuery` take and refuse, the fieldsets 6.5 accepts
among them.

### 15.6 Records (`deserialize.ts`, `include-tree.ts`, `record-types.ts`, ADR 0019)

`deserialize(document, { include? })` returns
`Deserialized = { data, included, links, meta, jsonapi }`, `data` being a record, `null`, an array
of records, or `undefined` when the document has no `data`. `include` is the include paths the
request sent. A relationship document's identifiers deserialize as records of `type` and `id`; the
relationship calls read its linkage (15.4).

- A record is a plain object: `type`, `id`, each attribute as sent, each relationship as below, and,
  when the resource object has them, `$links` (its `links`), `$meta` (its `meta`), and
  `$relationships` (each relationship object as sent). No field can collide with them: `$` is a
  reserved character no member name may contain (`#document-member-names-reserved-characters`), and
  no field is named `type` or `id`. @-Members are skipped (`#document-member-names-at-members`), as
  is any member a conforming server cannot send under those rules (`type`, `id`, a name holding
  `$`). Fields are own data properties, so a member named `__proto__` stays a plain key.
- What a record keeps as sent is held to the shape JSON:API gives it, so its type is true: a link is
  a string, `null`, or a link object with a string `href` whose other members keep their types; the
  `jsonapi` object's `version` is a string and its `ext` and `profile` lists of strings; a
  relationship object keeps its `links`, its linkage with each identifier's `meta`, and its `meta`.
  A member of another shape is left out. The document's `links`, `meta`, and `jsonapi` are read the
  same way.
- A relationship on a requested include path is resolved: a to-one is the included record or `null`,
  a to-many the included records in linkage order. A linked resource the document leaves out is left
  out (a to-one is `undefined`); its identifier stays in `$relationships`. Full linkage asks every
  included resource to be linked, not every linked resource to be included
  (`#document-compound-documents`).
- Every other relationship is its linkage: an identifier `{ type, id }`, `null`, or a list of
  identifiers, or `undefined` when the relationship object has no `data`. An identifier's `meta`
  stays in `$relationships`.
- Resolution follows the include paths only, so records form a tree: a record never reaches itself,
  and every result survives `JSON.stringify`, `structuredClone`, and a cache's structural sharing.
  Resources are found by `type` and `id` among the primary data and `included`
  (`#document-compound-documents`: one resource object per type and id).
- `included` holds every included resource as a record with its linkage.
- A document that is not a JSON object, a `data` or `included` of another shape, and a resource
  object or identifier without a string `type` and `id` throw `TypeError`, whose message quotes
  nothing of the document.

`RecordOf<TDefinitions, TDefinition, TQuery>` types a record: `type` is the definition's, `id` a
string; the attributes are `'~types'.attributes` (JSON forms, 5.3), narrowed to `fields[type]` when
the query names that type; each relationship by `'~types'.relationships`: on an include path the
related definition's record (looked up in `TDefinitions` by type, with the rest of the path), else
its linkage. A type no definition in `TDefinitions` has is `AnyRecord`, whose fields are `unknown`.
A query's `include` or fieldset that is a tuple, as a literal passed to a call is (a `const` type
parameter), says what the response holds. One typed as a list says only what it may hold: a
relationship on one of its paths is the related record or its linkage, and the fields of a fieldset
so typed are optional, every field so when the fieldset may be absent.

Tests: `deserialize.test.ts` (records, the result, refusals), `relationships.test.ts` (linkage,
resolution, the tree, resources left out), `members.test.ts`, `round-trip.test.ts` (documents
`collectionDocument` builds from the blog's rows, per query, sent as JSON and deserialized, are the
records the rows describe), and `record-types.test-d.ts`.

### 15.7 Errors (`response-error.ts`)

A response whose status is not 2xx, a 4xx and a 5xx alike, rejects with `ResponseError`: `status`
(the HTTP status, a number), `errors` (the error document's error objects, or empty when the body is
not one, such as a proxy's HTML page), `document` (the error document or `undefined`), and `headers`
(`{ allow, retryAfter }`, from `Allow` and `Retry-After`).
`new ResponseError({ type, call, status, body, headers? })` takes the response body as parsed JSON
(`undefined` when it is not JSON); an error object keeps each member whose type is the one JSON:API
gives it, and the document its `links`, `meta`, and `jsonapi`, read as 15.6 reads them. Each error
object keeps its own `code`, a string (`#error-objects`); the status is never put in its place. The
message names the resource type, the call, and the status, never the URL or the body: a URL carries
ids and filter values, and a message goes to logs. The codes are the server's catalog (4.1 and the
application's own), as the server sent them. `isResponseError(value, code?)` is `true` for a
`ResponseError`, and with `code`, one whose error objects carry it; its type parameter types `code`,
so `isResponseError<AppCode>(error, 'X')` rejects a code the application's catalog does not have. It
recognizes an error made by another copy of the package, through a `Symbol.for` brand, where
`instanceof` would not. An error's `source.pointer` names a member of the request document, which a
form maps to its field; JSON:API asks a client to ignore a pointer the request did not have.

Tests: `response-error.test.ts` (the message, the error objects, the headers, the guard across
copies) and `response-error.test-d.ts` (the guard's code typed by the catalog).

### 15.8 Pagination (`cursors.ts`)

- A link is a string or a link object, whose `href` is read (`#document-links-link`).
- `pageCursors(result)`: `{ next, prev }`, the `page[after]` of `links.next` and the `page[before]`
  of `links.prev`, each `undefined` when the link is `null`, absent, or without it. An infinite list
  keys each page by its cursor and lists with `page: { after }`. A page with no records ends the
  list in its direction: the profile lets `next` point at an empty page.
- `cursorOf(record)`: the record's `$meta.page.cursor` when it is a string (the profile's item
  cursor, 8.3).
- `next(result)` and `prev(result)` follow the link as the server wrote it, its query included and
  untouched (rewriting a URL's `searchParams` re-serializes every pair), and deserialize with the
  `include` the link carries. A link is followed only when it is absolute or root-relative and
  resolves to the transport's origin; anything else throws `TypeError`. A document is the server's
  data, and following a link it names to another origin would send the transport's headers there, as
  fetch refuses to do with `Authorization` on a cross-origin redirect (ADR 0017).

### 15.9 Packaging and tests

ESM only, as the other packages (12): `dependencies` holds `@nizam-os/jsonapi-core` (`workspace:^`,
a caret range when published); no peer dependencies; one subpath, `.`. Built with
`platform: 'neutral'`, `@nizam-os/jsonapi-core` external.

Unit tests sit beside each module: `origin.test.ts`, `send.test.ts` and `responses.test.ts` (the
request, the fetch called, each response), `request-documents.test.ts` (each write's document, read
back by jsonapi-core's own request parsers), `reads.test.ts`, `writes.test.ts`,
`relationships.test.ts`, `follow.test.ts`, and `create-clients.test.ts`, through a fetch double;
`record-types.test-d.ts`, `client.test-d.ts`, and `relationship-calls.test-d.ts` pin the inference.
`e2e/jsonapi/client-*.e2e.test.ts` drives the blog API over HTTP with the built client (14.1): list
and walk pages, compound documents into records, sparse fieldsets, each write and relationship call,
every error status the blog answers into a `ResponseError`, and the headers and `Accept-Language`
the server receives. `e2e/jsonapi/smoke/client-checks.ts` runs the client against a blog in-process
on Bun, Deno, and workerd (14.2).

## 16. TanStack Query (`@nizam-os/tanstack-query-jsonapi`, `packages/tanstack-query-jsonapi/src/`, ADR 0020)

The client's reads and writes as TanStack Query options, keyed by the request each call sends, so
two calls that send one request share one cache entry and a write refetches what it changed. The
package binds TanStack Query's framework-free core, `@tanstack/query-core` (root ADR 0010), so the
options go into every adapter's hooks: React's and Vue's `useQuery`, Solid's
`useQuery(() => options)`, Svelte's `createQuery(() => options)`, Angular's
`injectQuery(() => options)`, and their infinite and mutation kin.

```ts
const contacts = resourceQueries(clients.contacts);
const meetings = resourceQueries(clients.meetings);
const page = useQuery(contacts.list({ ...query, include: ['organization'] }));
const feed = useInfiniteQuery(contacts.pages({ sort: ['-created_at'] }));
const contact = useQuery(contacts.get(id));
const create = useMutation(contacts.create());
const remove = useMutation(contacts.remove({ invalidates: [meetings.all] }));
```

### 16.1 Surface and module map

| Subpath                            | Exports                                                                                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nizam-os/tanstack-query-jsonapi` | Values: `resourceQueries`, `operationsMutation`; types: `ResourceQueries`, `OperationsOptions`, `ReadOptions`, `PagesOptions`, `WriteOptions`, `WriteSettings`, `ListResult`, `UpdateVariables`, `PageParam`, `KeyedDefinition`, `AllKey`, `ListKey`, `PagesKey`, `GetKey` |

```
packages/tanstack-query-jsonapi/src/
  index.ts                     root entry
  query-keys.ts                the keys of 16.2: the query string a call sends
  pages.ts                     an infinite list's page parameters, from the query's cursors and the pages' links (16.3)
  query-types.ts               the options' types, holding only the members resourceQueries sets (16.5)
  queries.ts                   resourceQueries(), and the TypeErrors of an argument that is not a client (16.2 to 16.6)
  invalidation.ts              the keys a write's invalidates adds, and the invalidation of every key together (16.4, 17.4)
  operations.ts                operationsMutation(): one Atomic Operations request as mutation options (17.4)
```

### 16.2 Keys

| Member              | Options        | Key                                       | Runs                                              |
| ------------------- | -------------- | ----------------------------------------- | ------------------------------------------------- |
| `all`               |                | `[type]`                                  |                                                   |
| `list(query?)`      | `ReadOptions`  | `[type, 'list', <query>]`                 | `client.list(query, { signal })`                  |
| `pages(query?)`     | `PagesOptions` | `[type, 'pages', <query>]`                | `client.list` of the query at the page's cursor   |
| `get(id, query?)`   | `ReadOptions`  | `[type, 'get', id, <include and fields>]` | `client.get(id, query, { signal })`               |
| `create(settings?)` | `WriteOptions` | `mutationKey: [type, 'create']`           | `client.create(input)`                            |
| `update(settings?)` | `WriteOptions` | `mutationKey: [type, 'update']`           | `client.update(id, input)` for `{ id, ...input }` |
| `remove(settings?)` | `WriteOptions` | `mutationKey: [type, 'remove']`           | `client.remove(id)`                               |

A key is the request. `<query>` is `serializeQuery(client.definition, query).toString()` (15.5), so
two queries that make one request share one cache entry, a bigint filter value keys as its text, and
every key is JSON. The parameters come in `serializeQuery`'s order of the families whatever order
the query's members were written in; within a member the query's own order stands, so a filter whose
fields are written in another order is another request and another entry. `type` is the
definition's, so invalidating `[type]` reaches every list, page, and record of the type, and
`[type, 'list']` every list. `client.definition` is the definition the client was made from (15.4).

### 16.3 Reads and pages

- Reads resolve to the client's `ReadResult` (15.4), the document's `links` and `meta` with the
  records, which paging reads. Each passes TanStack Query's `signal`, so a cancelled query aborts
  its request. A refused read settles the query with the client's `ResponseError`.
- The page parameter is `{ after }` or `{ before }`, starting from the query's own cursors, which
  the key holds as the list's start; the next is `{ after: pageCursors(last).next }` and the
  previous `{ before: pageCursors(first).prev }` (15.8), none when the link is absent or the page
  holds no records, since the profile lets a link point at an empty page. `page[size]` stays the
  query's. `pages` is `never` on a definition whose list takes no `page`, and throws `TypeError` on
  one typed wide.

### 16.4 Writes

Writes invalidate their type and the keys `settings.invalidates` names, the other types the write
changes on the server (removing a contact sets their meetings' contact to null,
`on delete set null`), and return that promise from `onSuccess`, with the `QueryClient` TanStack
Query passes (`context.client`), so the mutation stays pending until the lists and records it
touched have refetched; `remove` first removes the record's `get` entries, so a screen still showing
it does not refetch a 404. A refused write invalidates nothing. An invalidation belongs in the
options: TanStack Query runs a callback passed to `mutate` only while the component that called it
is mounted, and for the last of consecutive calls only, so `mutate`'s callbacks are for what a
screen does next, such as navigating; spreading the options and overriding `onSuccess` would drop
the invalidation.

### 16.5 Types

The options are plain objects typed by `ReadOptions`, `PagesOptions`, and `WriteOptions`, which hold
only the members `resourceQueries` sets (ADR 0020): a read's `queryKey`, tagged with its data
through query-core's `DataTag`, and its `queryFn`; a page list's key, `queryFn`, `initialPageParam`,
`getNextPageParam`, and `getPreviousPageParam`; a write's `mutationKey`, `mutationFn`, and
`onSuccess`. Every adapter's hooks take them as they are, with their data typed and `select`
inferring from it, and `queryClient.getQueryData(contacts.get(id).queryKey)` is typed through the
tag. The data of an infinite query's hook is `InfiniteData<ListResult, unknown>`, TanStack Query's
default for an infinite query without `select`, and a pages key is tagged with the same, as every
adapter's `infiniteQueryOptions` tags one (ADR 0021), so `getQueryData` of it reads as the hook
does. Records are the client's `RecordOf` for the query passed (15.6), `create`'s variables its
`CreateInput`, `update`'s `{ id } & UpdateInput`, and `remove`'s the id. The options are made over
the client's calls typed wide, and typed by its definitions where `resourceQueries` returns them, as
`createClients` types the calls. An application adds its own members by spreading them,
`{ ...contacts.list(state), placeholderData: keepPreviousData }`, and may pass them through its
adapter's `queryOptions`, `infiniteQueryOptions`, and `mutationOptions`, but for Vue's
`infiniteQueryOptions`, whose result Vue's `useInfiniteQuery` refuses for a key the helper was
handed tagged: a Vue application spreads the pages options instead.

### 16.6 Arguments

`resourceQueries` throws `TypeError` for a value `createClients` did not return (one without
`definition` and the calls), and a write for `invalidates` that is not a list of query keys, such as
one key passed alone. Messages name the function, and the definition's type where they concern one,
never a value.

- @ref https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
- @ref https://tanstack.com/query/v5/docs/framework/react/reference/mutationOptions
- @ref https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
- @ref https://tanstack.com/query/v5/docs/framework/react/guides/mutations#mutation-side-effects

### 16.7 Packaging and tests

ESM only, as the other packages (12): `@nizam-os/jsonapi-client` (the application's clients and
their `definition`) is a peer dependency and a `workspace:^` development dependency, and
`@tanstack/query-core` `^5.89.0` an optional peer (`peerDependenciesMeta`, root ADR 0011), imported
for types only: 5.89.0, the release after 5.87.4, is the first whose mutation callbacks receive the
`QueryClient` (`context.client`). An application installs its TanStack Query adapter, which depends
on one exact release of query-core and re-exports it, and lists query-core itself only under Yarn
Plug'n'Play, at that release. Query-core at the catalog's release is a development dependency; there
are no dependencies. One subpath, `.`, built with `platform: 'neutral'`.

Unit tests sit beside each module, through a query-core `QueryClient` and the observers every
adapter's hooks are made of (`QueryObserver`, `InfiniteQueryObserver`, `MutationObserver`), over the
clients of the blog's definitions in `src/test-support/` and a fetch double that holds each answer
until the test releases it or the request's signal aborts it: `query-keys.test.ts` (one key per
request, the canonical order, bigints, what `[type]` and `[type, 'list']` reach), `queries.test.ts`
(each read through a `QueryClient`, the signal of each, a refused read, the `TypeError`s),
`pages.test.ts` (the pages in both directions from the query's cursors, an empty page that links on,
a link absent or without its cursor), `writes.test.ts` (each write pending until the reads a screen
shows have refetched, an entry no screen shows left stale, removal before the refetch,
`invalidates`, a refused write, `mutate`'s `onSuccess` after the refetch), and `queries.test-d.ts`
(data and variables typed by the definitions, `getQueryData` through the tagged keys, `pages`
`never` without pagination). The tests read through the observers: from 5.102 `fetchQuery` and its
kin are deprecated for `queryClient.query`, which the 5.89 floor does not have. CI runs them on
query-core 5.89.0, and a floor that fails them is raised in the same change.

End to end, against the built package: `e2e/jsonapi/query/adapters/` type-checks the options with
the hooks of each adapter, React, Vue, Solid, Svelte, and Angular Query, passed as they are, from a
getter where the adapter takes one, and through the adapter's own helpers, their data typed exactly,
`select` inferring from it, and `getQueryData` typed through the tags, with Vue's
`infiniteQueryOptions` kept under `@ts-expect-error` (ADR 0021);
`e2e/jsonapi/query/query-cache.e2e.test.ts` drives the blog API over HTTP through query-core's
observers: a list and a record keyed by the request, pages both ways by the server's links, writes
that settle once the reads shown have refetched, and a refused write that leaves the cache as it
was. `e2e/jsonapi/smoke/query-checks.ts` reads and writes the blog in-process through a
`QueryClient` on Bun, Deno, and workerd, where server rendering prefetches. The resource family
drives it against a database (resource SPEC 20.8).

## 17. Atomic Operations from the client (`@nizam-os/jsonapi-client`, `@nizam-os/tanstack-query-jsonapi`, ADR 0022, ADR 0023)

A client sends several writes as one request through the Atomic Operations extension, which commits
them all or none (11). Each operation is a value built from a definition, so a model that holds the
definition builds them without a client; one call sends them through the transport, and the query
binding gives that call as mutation options.

```ts
const contacts = operationsOf(Contacts);
const meetings = operationsOf(Meetings);
const { results } = await sendOperations(transport, [
  contacts.create({ lid: 'ada', attributes: { name: 'Ada' } }),
  meetings.create({
    attributes: { title: 'Intro' },
    relationships: { contact: { type: 'contacts', lid: 'ada' } },
  }),
  contacts.update(archivedId, { attributes: { status: 'active' } }),
  contacts.remove(oldId),
]);
results[0].data; // the created contact's record, or undefined
```

### 17.1 `operationsOf(definition)` (`operations/operations-of.ts`)

`operationsOf(definition)` returns `OperationBuilders<TDefinition>`, a builder per write of the
resource client (15.4), each taking what the call of its name takes and returning an `Operation`
instead of sending:

| Builder                                     | `op`     | `ref`                              | `data`                                                                                                         |
| ------------------------------------------- | -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `create(input)`                             | `add`    | none                               | `{ type, id?, lid?, attributes?, relationships? }`, the resource object `create` sends, with the input's `lid` |
| `update(id, input)`                         | `update` | none                               | `{ type, id, attributes?, relationships? }`, the resource object `update` sends                                |
| `remove(id)`                                | `remove` | `{ type, id }`                     | none                                                                                                           |
| `setRelationship(id, name, linkage)`        | `update` | `{ type, id, relationship: name }` | the linkage `setRelationship` sends                                                                            |
| `addToRelationship(id, name, linkage)`      | `add`    | `{ type, id, relationship: name }` | the identifiers `addToRelationship` sends                                                                      |
| `removeFromRelationship(id, name, linkage)` | `remove` | `{ type, id, relationship: name }` | the identifiers `removeFromRelationship` sends                                                                 |

- An `Operation<TDefinition, TData>` is a frozen object: `definition`, the definition it writes,
  `op`, `ref`, and `data`, the last two `undefined` where the table gives none, and `'~data'`, which
  is type-only and always absent, as a definition's `'~types'` is (5.3): the data its result holds.
  The extension's operation object is `{ op, ref, data }` with the absent members left out; an
  update names its target by `data`'s `type` and `id`, as the extension's own example does.
- A relationship value is what the call takes, an id, an identifier, `null`, or a list (15.4), or
  `{ type, lid }`, a `LocalIdentifier` naming a resource an earlier operation of the request creates
  with that `lid`; it is sent as it is. `create` takes `lid` beside `id`. A target is an id: a
  resource the request creates is created with its relationships, so targeting it by its `lid` adds
  nothing (ADR 0022).
- A relationship the definition does not declare throws `TypeError` naming it, as the call does;
  nothing else is checked, since the server answers it in one 400 (11.2, 11.4).
- Types: `CreateOperationInput` and `UpdateOperationInput` are `CreateInput` and `UpdateInput`
  (15.4) with relationship values that may be `LocalIdentifier`s, `create`'s with `lid`; the
  relationship builders take the names the calls take. `TData` is the record of the definition
  without a query (`RecordOf`, 15.6) for `create` and `update`, and `undefined` for the rest.

### 17.2 `sendOperations(transport, operations, options?)` (`operations/send-operations.ts`, `operations/operation-results.ts`)

In order, before anything is sent:

1. `transport` must be one `createTransport` made, as for `createClients` (15.2).
2. `operations` must be a non-empty list of `Operation`s, each with a `definition` that has a string
   `type` and an `op` of the extension's; anything else throws `TypeError` naming the index, never a
   value.
3. Every operation's definition must name one operations path,
   `resourcePaths(definition, { caller: 'sendOperations' }).operations` (5.4, ADR 0023); otherwise
   `TypeError`, since one request reaches one endpoint. The cap is not counted: the server answers a
   request over it with its 400 (11.2), and the definitions carry it for the screens (5.1).

Then one `POST <operations path>` through the transport, as 15.3 sends a document, with the document
`{ 'atomic:operations': [...] }`, each operation's object in order, and with `Content-Type` and
`Accept` both `application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"`: a client that
applies an extension "MUST specify the `ext` media type parameter in the `Content-Type` header"
(`#content-negotiation-all`), and the results are the extension's member, so `Accept` requires the
server to apply it: a client "MAY use the `ext` media type parameter in an `Accept` header to
require that a server apply all the specified extensions" (`#content-negotiation-clients`).
`options` are the call's `CallOptions` (15.3).

It resolves to `OperationsResult<TOperations> = { status, results, links, meta, jsonapi }`:

- A `200` holds a document with `atomic:results`, a list with one result object per operation; a
  document "MUST contain at least one of" `data`, `errors`, `meta`, or "a member defined by an
  applied extension" (`#document-top-level`), so a results document holds no `data`. Each result is
  `OperationResult<TData> = { data, meta }`: `meta` when it is an object; `data` the record of the
  operation's definition (15.6, no include, since a results document holds none) for an `add` or an
  `update` without `ref.relationship` whose result holds a resource object, and `undefined` when the
  result holds no `data`. The document's `links`, `meta`, and `jsonapi` are read as 15.6 reads them.
- A `204` holds no document: every result is `{ data: undefined, meta: undefined }`, since the
  extension allows it only "if all results are empty".
- Any other 2xx, a `200` without `atomic:results` or with a list of another length, and a result
  whose `data` its operation cannot hold (a list, `null`, or any `data` on a removal or a
  relationship operation, whose results "MUST NOT contain data") throw `TypeError`
  (`<types> operations answered <status> ...`), never quoting the document.
- Any other status rejects with `ResponseError` (15.7), `type` the operations' types in order of
  first appearance joined with `, `, `call` `operations`.

`results` is typed per operation: a tuple of operations, as a literal list passed to the call is (a
`const` type parameter), gives a tuple of results, and a list type a list of them.

### 17.3 Refusals: `operationOf(errorObject)` (`operations/operation-of.ts`)

A server points an error at the operation that failed (11.1; the extension: errors SHOULD carry a
`source.pointer` to "the source of the problem in the request document"). `operationOf(error)` takes
an error object of a `ResponseError` and returns `OperationPointer = { index, pointer }` when its
`source.pointer` is `/atomic:operations/<index>` alone or followed by `/` and further segments:
`index` the operation's position in the request, an RFC 6901 array index (`0` or a digit `1` to `9`
followed by digits), and `pointer` the rest, `''` for the operation itself, so
`/data/attributes/email` names what a single call's refusal names (resource SPEC 20.4). Any other
object gives `undefined`. An index past the request's operations is returned as it is; a caller that
maps it to what it sent holds the list.

### 17.4 The mutation: `operationsMutation(transport, settings?)` (`@nizam-os/tanstack-query-jsonapi`, `operations.ts`)

```ts
const operations = operationsMutation(transport);
const bulk = useMutation(operations);
await bulk.mutateAsync(
  ids.map((id) => contacts.update(id, { attributes: { status: 'archived' } })),
);
```

`OperationsOptions<TOperation>` holds `mutationKey: ['operations']`, a `mutationFn` that calls
`sendOperations(transport, operations)`, and an `onSuccess` that, through the `QueryClient` TanStack
Query passes it, first removes the `get` entries of every record a removal removed (an operation
whose `op` is `remove` and whose `ref` names no relationship: `[type, 'get', id]`, 16.2), then
invalidates `[type]` for every type the operations write and each key `settings.invalidates` names,
and returns that promise, so the mutation stays pending until the reads a screen shows have
refetched, as the single writes do (16.4). A refused request invalidates nothing. `TOperation` is
`Operation` by default, so the variables are any list of operations and each result's data is
`unknown`; an application narrows it with a type argument. The types hold only the members it sets
(ADR 0020). It throws `TypeError` for `invalidates` that is not a list of query keys, as the single
writes do (16.6); a transport `createTransport` did not make is refused by the first mutation, with
`sendOperations`' `TypeError`.

### 17.5 Tests

`@nizam-os/jsonapi-client`: `operations-of.test.ts` (each builder's operation, read back by
jsonapi-core's own `parseOperationsDocument`, a `lid` and a `LocalIdentifier`, an undeclared
relationship), `send-operations.test.ts` (the request and its headers, each `TypeError` before
sending) and `operation-results.test.ts` (a 200 read per operation, a 204, each result shape
refused, a refusal's `ResponseError`) through a fetch double, `operation-of.test.ts`, and
`operations.test-d.ts` (inputs and results typed by the definitions, a tuple of results for a tuple
of operations); end to end, `e2e/jsonapi/client-operations.e2e.test.ts` sends operations to the
blog's endpoint over HTTP with the built client: a create linked by its `lid` with the request as
the server received it, a `204`, a refusal at an operation and at a member of one, each with nothing
committed, a request over the cap refused by the server, and the `TypeError`s before sending,
nothing sent; `e2e/jsonapi/smoke/client-checks.ts` sends operations linked by a `lid` and a refusal
at its index in-process on Bun, Deno, and workerd (14.2). `@nizam-os/tanstack-query-jsonapi`:
`operations.test.ts` through a `QueryClient` and a `MutationObserver` (one request for every
operation, pending until the reads shown of each type written have refetched, the removed records'
entries removed first and a relationship's removal keeping its record's, `invalidates`, a refused
request, the `TypeError`s) and `operations.test-d.ts` (any list of operations and `unknown` data by
default, narrowed by a type argument); the adapters' type checks of 16.7 pass `operationsMutation`
to each adapter's mutation hook; `e2e/jsonapi/query/operations-cache.e2e.test.ts` runs it over HTTP
against the blog (a person and an article linked to them by a `lid`, with a removal, settling once
the reads shown have refetched, and a refused request leaving the cache and the store as they were);
and `e2e/jsonapi/smoke/query-checks.ts` runs it in-process on Bun, Deno, and workerd. The resource
family drives both against a database (resource SPEC 21).
