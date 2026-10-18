# @nizam-os/jsonapi-core

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

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34) Thanks [@ali-issa](https://github.com/ali-issa)! - New `validate.id` on `defineResource`: a Standard Schema for the resource id. With
  `clientIds: true`, a create's client-generated id outside it is refused with 422 `VALIDATION_FAILED`
  at `/data/id`, reported before any issue of the attributes, in a `POST` and in an atomic `add`
  alike, and the parsed id is the validator's output.

- [#123](https://github.com/nizam-os/kit-ts/pull/123) [`6084c4b`](https://github.com/nizam-os/kit-ts/commit/6084c4b681ab940900ef71f049bf07a1548f82f4) Thanks [@ali-issa](https://github.com/ali-issa)! - Every definition now carries, in types only, what a client reads and writes:
  `TypesOf<typeof Articles>` holds the attributes as the JSON `serialize` produces (a `Date` arrives
  as a string, an attribute that may be `undefined` is optional), each relationship's type and
  cardinality, the filter operators, the include paths, whether the resource takes sparse fieldsets,
  paginates, and has a search parameter, the validators' inputs for a create and an update, and the
  fields each write takes. `defineResource` infers it from the definition as written, so a typed
  client follows every edit with nothing generated. The member, `'~types'`, is never present at
  runtime, and `serialize` still rejects a field the definition does not declare.
  
  `ResourceDefinition` takes the client types as a ninth, optional type parameter, and
  `ResourceDefinitionInit` now takes the init's own member types: the relationships, query,
  validators, and writable lists as written. `JsonOf`, `ResourceTypes`, `TypesOf`, and
  `ClientRelationship` are exported.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`a3286fe`](https://github.com/nizam-os/kit-ts/commit/a3286fef943a3de401c452584c496b59ab184b70) Thanks [@ali-issa](https://github.com/ali-issa)! - Export `errorAtOperation(error, pointer)` from `@nizam-os/jsonapi-core/atomic`, re-exported by
  `@nizam-os/hono-jsonapi/atomic`: the function the operations processor applies to an operation's
  failure, so every error object without a source gets the operation's pointer. A host whose
  transaction maps a failure once it ended, outside the processor, points that error at its operation
  alike.

- First release: JSON:API 1.1 for any JavaScript runtime, framework-free.
  
  - `defineResource` declares a resource's type, fields, relationships, links, query capabilities, and
    Standard Schema validators once; every parser and builder reads from it. `links: { base }` derives
    `self` and the relationship links by the recommended URL design, and `createDefineResource` states
    such defaults once for every definition.
  - `resourceDocument`, `collectionDocument`, `toOneRelationshipDocument`,
    `toManyRelationshipDocument`, and `include` build documents with sparse fieldsets applied and full
    linkage enforced.
  - `parseQuery` parses `include`, `fields`, `sort`, `page`, `filter`, a search parameter, and
    declared custom parameters, reporting every problem in one 400.
  - `paginatedDocument` and `paginationLinks` implement the Cursor Pagination profile.
  - `parseCreateDocument`, `parseUpdateDocument`, and the relationship document parsers check request
    documents against the definition with RFC 6901 pointers on every error.
  - `negotiate` applies the server content negotiation rules (415, 406) over two header values.
  - Errors are [@nizam-os/ban-core](https://github.com/nizam-os/kit-ts) errors: `jsonApiError` builds
    one from a closed catalog (`ERROR_CATALOG` over @nizam-os/ban-core's built-ins), `errorItem` one
    object of a list, and `errorDocument` the document; an application spreads the catalog into its
    own `createBan`.
  - `@nizam-os/jsonapi-core/atomic` implements the Atomic Operations extension as
    `operationsProcessor`, with a caller-owned transaction, local ids across operations, and a
    host-supplied context for handlers.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`6d2b017`](https://github.com/nizam-os/kit-ts/commit/6d2b017fb9e8c62ce9fbb2883a3beee74a989075) Thanks [@ali-issa](https://github.com/ali-issa)! - A validation issue's `code` and `expected`, when they are strings, now reach the client: each
  `VALIDATION_FAILED` item of `parseCreateDocument`, `parseUpdateDocument`, and the atomic `add` and
  `update` operations carries them as `reason` and `expected`, which `@nizam-os/ban-core`'s JSON:API
  format renders as `meta.code` and `meta.expected`. A client can tell a length violation from a
  pattern violation without parsing the `detail`. Nothing else of a vendor's issue is kept, so no
  value from the request reaches the response. `errorItem` takes `reason` and `expected` too.

- [#123](https://github.com/nizam-os/kit-ts/pull/123) [`6ce0fba`](https://github.com/nizam-os/kit-ts/commit/6ce0fba5eb97a32c5a884c7c0f450adaba9104b2) Thanks [@ali-issa](https://github.com/ali-issa)! - `resourcePaths(definition, { caller? })` reads where a resource's operations live from its links:
  the collection, the resource with its `{id}`, each relationship's `self` and `related` path, and an
  absolute link's origin. It throws `TypeError` when the links cannot give them, each message starting
  with `caller` (default `resourcePaths`). `ResourcePaths` and `ResourcePathsOptions` are exported,
  and `@nizam-os/hono-jsonapi` re-exports all three. The OpenAPI document of `@nizam-os/resource-core`
  and the routes of `@nizam-os/hono-resource` read their paths through it, so a client calls the URLs
  they name.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4) Thanks [@ali-issa](https://github.com/ali-issa)! - `validate.id` no longer needs `clientIds: true`. An update's document id names the request's
  resource when the texts are equal or `validate.id` takes both with one output, so a client that
  requests a key in its own spelling, such as a UUID in upper case, and sends back the document the
  server gave it is no longer refused with 409, in a `PATCH` and in an atomic `update` alike. The
  parsed update id stays the document's text.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152) Thanks [@ali-issa](https://github.com/ali-issa)! - New `writable` option on `defineResource`: `{ create, update }` lists the fields each write accepts,
  typed as the declared names, and every field stays writable when an operation has no list. A create
  or an update that carries a field its operation does not accept is refused with 403 `FORBIDDEN` at
  the field's pointer before the validator runs, so a read-only field such as `createdAt` stays
  served, sortable, and filterable without a write silently dropping it. Atomic operations refuse it
  the same way, and `relationshipValidator` refuses a relationship that updates do not accept with 403
  before reading the body. A document refused for such a field and for anything else answers 400 with
  every error.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`d6c2a48`](https://github.com/nizam-os/kit-ts/commit/d6c2a489b7edb43972c35f99a817235df7615592) Thanks [@ali-issa](https://github.com/ali-issa)! - List the Atomic Operations endpoint in the OpenAPI document. When a listed resource declares
  `create`, `update`, or `remove`, `openapi()` lists `POST <base>/operations` (operation id
  `atomic:operations`) under the extension's media type: a request schema of each operation the
  processor runs for each resource, with the new `<type>.local`, `<type>.atomic-add`, and
  `<type>.atomic-update` components; a 200 of `atomic:results` and a 204 where an operation can answer
  them; and the error responses of the processor and of every write. Collections under different
  bases, or one at the endpoint's path, throw `TypeError`, as the routes do. `DEFAULT_MAX_OPERATIONS`,
  the processor's default limit, is exported from `@nizam-os/jsonapi-core/atomic` and
  `@nizam-os/hono-jsonapi/atomic`.

### Patch Changes

- [#191](https://github.com/nizam-os/kit-ts/pull/191) [`ebbd31f`](https://github.com/nizam-os/kit-ts/commit/ebbd31fddc3a17e259958e2397ec93bf4f6fd154) Thanks [@ali-issa](https://github.com/ali-issa)! - Declarations that compile without the DOM library. Every `headers` option named `HeadersInit`, an
  alias only TypeScript's DOM library declares: Node's types declare `Headers` but not the alias, so a
  Node application without `lib: ["dom"]` got TS2304 in the packages' declarations, or read each
  `headers` option as `any` where it skipped checking them. `@nizam-os/ban-core` and
  `@nizam-os/jsonapi-client` now vendor the Fetch Standard's `HeadersInit` as the DOM library types
  it, and `@nizam-os/jsonapi-core` types an error's `headers` as `BanErrorOptions['headers']`. Every
  value the DOM library's alias accepts is still accepted.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`231501b`](https://github.com/nizam-os/kit-ts/commit/231501b7a6a1afe8eac359b50b7a2d99a7cf59b3) Thanks [@ali-issa](https://github.com/ali-issa)! - Point the errors about an operation's target at `href` when the operation named its target through
  `href`: an unknown type, an unknown relationship, an unknown `lid`, or a collection where a resource
  is required answered with a pointer under `ref`, a member such an operation does not hold.

- [#154](https://github.com/nizam-os/kit-ts/pull/154) [`13c1aa9`](https://github.com/nizam-os/kit-ts/commit/13c1aa9cec464c68c0bfcfe82fb05b82429a8b85) Thanks [@ali-issa](https://github.com/ali-issa)! - `paginationLinks` drops the request URL's fragment before deriving any link, so `self`, `first`,
  `prev`, `next`, and `last` no longer carry it. A literal `#` can reach the request URL (Node's HTTP
  server keeps it), and its text was echoed into every absolute link of a response that a cache keying
  on the fragment-free URL would store and serve to everyone.

- [#123](https://github.com/nizam-os/kit-ts/pull/123) [`33f9060`](https://github.com/nizam-os/kit-ts/commit/33f9060871baf54ebd5a09b66194a7b7098f9c19) Thanks [@ali-issa](https://github.com/ali-issa)! - A definition whose query declares no `sort` types its sort names as `never` instead of `string`, so
  `query.sort` is `ReadonlyArray<never>` and a typed client refuses a sort the server would answer
  with a 400.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`d08e7ee`](https://github.com/nizam-os/kit-ts/commit/d08e7ee00764affee59a646a1e1ffcaf1ef1c554) Thanks [@ali-issa](https://github.com/ali-issa)! - Error details quote what the client sent only when it is a plain token: letters, digits, `_`, `-`,
  `.`, and square brackets, at most 64 characters, such as a member name, a parameter name, or an id.
  Anything else, such as markup, a line break, a URL, or 10 kB of text, is named without its value,
  and `source` still locates it. An unsupported extension's detail no longer quotes the URI.

- [#123](https://github.com/nizam-os/kit-ts/pull/123) [`97f3c1c`](https://github.com/nizam-os/kit-ts/commit/97f3c1cf930b9ad71afef5637739faef100d2b60) Thanks [@ali-issa](https://github.com/ali-issa)! - A module that exports a definition compiles with `declaration: true` again: `InferredTypes` and
  `DefinitionOf`, which an inferred definition's type names, are exported, so the emitted declarations
  import only `@nizam-os/jsonapi-core` instead of failing with TS2883.
- Updated dependencies [[`890844a`](https://github.com/nizam-os/kit-ts/commit/890844ae14747d4b64a38061cd31fd03484c108d), [`2ff6270`](https://github.com/nizam-os/kit-ts/commit/2ff6270ed3751cc04cafc4aeaf4d31cf6e0291b2), [`50b1e6a`](https://github.com/nizam-os/kit-ts/commit/50b1e6a32cb2c1bf6f95c1df4f9304da114f27dd), [`eeff0dd`](https://github.com/nizam-os/kit-ts/commit/eeff0dd61a32580458e85d5c22501e77210e079d), [`a2ded61`](https://github.com/nizam-os/kit-ts/commit/a2ded61e43cefd3157c1a1f0e0ffd26237d501cf), [`3ad2c60`](https://github.com/nizam-os/kit-ts/commit/3ad2c60449ed8d0d974cf036cf292cd47e7efc51), [`ebbd31f`](https://github.com/nizam-os/kit-ts/commit/ebbd31fddc3a17e259958e2397ec93bf4f6fd154)]:
  - @nizam-os/ban-core@1.0.0
