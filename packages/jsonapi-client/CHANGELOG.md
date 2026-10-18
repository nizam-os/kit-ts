# @nizam-os/jsonapi-client

## 0.1.0

### Minor Changes

- [#123](https://github.com/nizam-os/kit-ts/pull/123) [`87a54f2`](https://github.com/nizam-os/kit-ts/commit/87a54f2e3e583652693daeb89823f89f56ed5e62) Thanks [@ali-issa](https://github.com/ali-issa)! - Calls the server. `createTransport({ origin, headers, language, fetch })` names the server once and
  what every request carries: `headers` and `language` are read per request, so a rotated token and a
  changed locale (Paraglide's `getLocale`) apply to the next call.
  `createClients(definitions, transport)` gives each definition a client with `list`, `get`, `create`,
  `update`, `remove`, the relationship calls, and `next` and `prev`, its paths read from the
  definitions' links. Every call is typed by the definitions: a literal query types the records
  exactly, a write's attributes are the server's validator input, its relationships the writable ones,
  and a client id is accepted only where the definition takes one. Each response is held to the call's
  shape, so a result's type is true; an id no path can carry is refused before sending, and a page
  link is followed only to the transport's origin.

- [#136](https://github.com/nizam-os/kit-ts/pull/136) [`fd58e17`](https://github.com/nizam-os/kit-ts/commit/fd58e17a2760567201515ae061736bc9a081174b) Thanks [@ali-issa](https://github.com/ali-issa)! - Every resource client exposes `definition`, the definition it was made from, typed as the one
  passed, so a cache that keys reads by their request serializes queries with it.

- [#191](https://github.com/nizam-os/kit-ts/pull/191) [`47b5e86`](https://github.com/nizam-os/kit-ts/commit/47b5e868731f0b20def93d61e255234df1ea0961) Thanks [@ali-issa](https://github.com/ali-issa)! - Send writes that must commit together in one Atomic Operations request. `operationsOf(definition)`
  builds each write as an operation, each builder taking what the call of its name takes: a `create`
  takes a `lid`, and a relationship value may be a `LocalIdentifier`, `{ type, lid }`, naming a
  resource an earlier operation of the request creates.
  `sendOperations(transport, operations, options?)` sends them in one `POST` to the definitions'
  operations path under the extension's media type and resolves to a result per operation, a tuple
  typed per operation for a list written in the call; a 204 gives every result empty, and a refusal
  rejects with `ResponseError`, the server having stored none. `operationOf(errorObject)` reads the
  operation an error points at and the pointer within it. A transport `createTransport` did not make,
  an empty list, a value that is not an operation, and operations whose definitions name different
  operations paths throw `TypeError` before anything is sent.

- [#123](https://github.com/nizam-os/kit-ts/pull/123) [`6dd6c4f`](https://github.com/nizam-os/kit-ts/commit/6dd6c4f1f825a928cf6cb568c15e6463d1e5850b) Thanks [@ali-issa](https://github.com/ali-issa)! - New package: a typed client for JSON:API servers built with `@nizam-os/jsonapi-core`. This first
  part writes queries. `serializeQuery(definition, query)` gives the query string the server's
  `parseQuery` reads back as the query meant, in one order, so one query is one URL; a list repeats
  its parameter, so a comma stays part of a filter value. `ListQuery` and `GetQuery` type the query
  from the server's definitions, with nothing generated: the declared include paths and sorts, the
  filter operators by field with `or` groups, the fieldsets of each type a response can hold, and
  `page`, `search`, and custom parameters only where the definition declares them, so what the server
  would answer with a 400 fails to compile. `pageCursors` and `cursorOf` read the Cursor Pagination
  profile's cursors. Runs wherever `fetch` does.

- [#123](https://github.com/nizam-os/kit-ts/pull/123) [`6264485`](https://github.com/nizam-os/kit-ts/commit/6264485bdceb370a7fa5fb87bd52a365127d0991) Thanks [@ali-issa](https://github.com/ali-issa)! - Reads responses. `deserialize(document, { include })` turns a JSON:API document into flat records,
  each holding `type`, `id`, its attributes, and its relationships, with `$links`, `$meta`, and
  `$relationships` for the rest. A relationship resolves to the included record only along the include
  paths the request asked for; otherwise it stays the linkage, `{ type, id }`, so a record never
  claims more than the server sent. `RecordOf` gives the record a query returns from the server's
  definitions: a literal include or fieldset narrows it exactly, a computed one leaves the fields
  optional. Members, links, and identifiers are checked against their shapes, and a document that is
  not JSON:API is refused with a constant `TypeError`. `ResponseError` carries the status, the error
  objects with their codes and pointers, and the `Allow` and `Retry-After` headers; its message names
  the type, the call, and the status, never the URL or the body. `isResponseError(error, code)`
  narrows by code across bundles.

### Patch Changes

- [#191](https://github.com/nizam-os/kit-ts/pull/191) [`ebbd31f`](https://github.com/nizam-os/kit-ts/commit/ebbd31fddc3a17e259958e2397ec93bf4f6fd154) Thanks [@ali-issa](https://github.com/ali-issa)! - Declarations that compile without the DOM library. Every `headers` option named `HeadersInit`, an
  alias only TypeScript's DOM library declares: Node's types declare `Headers` but not the alias, so a
  Node application without `lib: ["dom"]` got TS2304 in the packages' declarations, or read each
  `headers` option as `any` where it skipped checking them. `@nizam-os/ban-core` and
  `@nizam-os/jsonapi-client` now vendor the Fetch Standard's `HeadersInit` as the DOM library types
  it, and `@nizam-os/jsonapi-core` types an error's `headers` as `BanErrorOptions['headers']`. Every
  value the DOM library's alias accepts is still accepted.

- [#123](https://github.com/nizam-os/kit-ts/pull/123) [`0bdd504`](https://github.com/nizam-os/kit-ts/commit/0bdd5044c67ee0b7a2ef032d999d71fbe3fae9ea) Thanks [@ali-issa](https://github.com/ali-issa)! - `setRelationship`, `addToRelationship`, and `removeFromRelationship` take only the relationships an
  update may carry, the ones the definition's `writable.update` list names, and none where the
  definition serves no update. The server refuses a write to any other relationship with 403, so a
  call naming one now fails `tsc` instead.
- Updated dependencies [[`f6568c1`](https://github.com/nizam-os/kit-ts/commit/f6568c1b4448a9e092f9f7132601c6f48b404c69), [`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45), [`ebbd31f`](https://github.com/nizam-os/kit-ts/commit/ebbd31fddc3a17e259958e2397ec93bf4f6fd154), [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34), [`6084c4b`](https://github.com/nizam-os/kit-ts/commit/6084c4b681ab940900ef71f049bf07a1548f82f4), [`a3286fe`](https://github.com/nizam-os/kit-ts/commit/a3286fef943a3de401c452584c496b59ab184b70), [`231501b`](https://github.com/nizam-os/kit-ts/commit/231501b7a6a1afe8eac359b50b7a2d99a7cf59b3), [`6d2b017`](https://github.com/nizam-os/kit-ts/commit/6d2b017fb9e8c62ce9fbb2883a3beee74a989075), [`13c1aa9`](https://github.com/nizam-os/kit-ts/commit/13c1aa9cec464c68c0bfcfe82fb05b82429a8b85), [`33f9060`](https://github.com/nizam-os/kit-ts/commit/33f9060871baf54ebd5a09b66194a7b7098f9c19), [`d08e7ee`](https://github.com/nizam-os/kit-ts/commit/d08e7ee00764affee59a646a1e1ffcaf1ef1c554), [`97f3c1c`](https://github.com/nizam-os/kit-ts/commit/97f3c1cf930b9ad71afef5637739faef100d2b60), [`6ce0fba`](https://github.com/nizam-os/kit-ts/commit/6ce0fba5eb97a32c5a884c7c0f450adaba9104b2), [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4), [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152), [`d6c2a48`](https://github.com/nizam-os/kit-ts/commit/d6c2a489b7edb43972c35f99a817235df7615592)]:
  - @nizam-os/jsonapi-core@0.1.0
