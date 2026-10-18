# @nizam-os/hono-jsonapi

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

- [#154](https://github.com/nizam-os/kit-ts/pull/154) [`dbc48f5`](https://github.com/nizam-os/kit-ts/commit/dbc48f52ced0d7f864d454a640446b1449fb44a6) Thanks [@ali-issa](https://github.com/ali-issa)! - Requires `hono` 4.13.7 or later, the first release no published Hono advisory affects. 4.13.5 fixes
  GHSA-crvj-82cr-hjcx (the query parser reads parameters after a URL fragment), GHSA-g6gw-c38x-mqfc
  (unbounded dot-notation nesting in `parseBody()`), and GHSA-gqvv-2mrq-wpjv (`toSSG()` writes outside
  its output directory); 4.13.7 fixes GHSA-hxh3-vqpv-xpqv (`hono/jsx` renders plain strings unescaped
  in boundary components). None of these packages calls those helpers, but each runs on the
  application's own Hono, so its peer range no longer admits an affected release.

- First release: JSON:API 1.1 for Hono, on top of `@nizam-os/jsonapi-core` (re-exported in full).
  
  - `jsonApi()` middleware negotiates `Content-Type` and `Accept` and adds `Vary: Accept`; `respond`
    derives `ext` and `profile` on `Content-Type` from the document and `Location` on a 201.
  - `queryValidator`, `bodyValidator`, and `relationshipValidator` are Hono validators typed for
    `c.req.valid()`; `readDocument` reads a request document.
  - `errorHandler` is a [@nizam-os/hono-ban](https://github.com/nizam-os/kit-ts) handler over the
    catalog: every failure, including Hono's `HTTPException` and the validators' and middleware's
    rejections, is an error document with an error id in the header and the body; `notFoundHandler`
    gives unmatched routes the same shape. `@nizam-os/hono-ban` is a peer dependency next to `hono`.
  - `@nizam-os/hono-jsonapi/atomic` exposes `atomicOperations()`, the Atomic Operations endpoint as a
    Hono handler; handlers receive the Hono `Context` as `ctx`.

- [#93](https://github.com/nizam-os/kit-ts/pull/93) [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34) Thanks [@ali-issa](https://github.com/ali-issa)! - New `validate.id` on `defineResource`: a Standard Schema for the resource id. With
  `clientIds: true`, a create's client-generated id outside it is refused with 422 `VALIDATION_FAILED`
  at `/data/id`, reported before any issue of the attributes, in a `POST` and in an atomic `add`
  alike, and the parsed id is the validator's output.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`a3286fe`](https://github.com/nizam-os/kit-ts/commit/a3286fef943a3de401c452584c496b59ab184b70) Thanks [@ali-issa](https://github.com/ali-issa)! - Export `errorAtOperation(error, pointer)` from `@nizam-os/jsonapi-core/atomic`, re-exported by
  `@nizam-os/hono-jsonapi/atomic`: the function the operations processor applies to an operation's
  failure, so every error object without a source gets the operation's pointer. A host whose
  transaction maps a failure once it ended, outside the processor, points that error at its operation
  alike.

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

- [#154](https://github.com/nizam-os/kit-ts/pull/154) [`3e27946`](https://github.com/nizam-os/kit-ts/commit/3e27946125c98f606d5d184c8fa8a3ebe541fef2) Thanks [@ali-issa](https://github.com/ali-issa)! - `queryValidator` reads the query only up to the URL's fragment, and none when a `#` comes before any
  `?`. A literal `#` can reach the request URL (Node's HTTP server keeps it), and the parameters after
  it, which a cache or a filter in front of the application never sees, were parsed and acted on: the
  interpretation differential Hono fixed in its own query helpers in 4.13.5 (GHSA-crvj-82cr-hjcx).
- Updated dependencies [[`f6568c1`](https://github.com/nizam-os/kit-ts/commit/f6568c1b4448a9e092f9f7132601c6f48b404c69), [`2ff6270`](https://github.com/nizam-os/kit-ts/commit/2ff6270ed3751cc04cafc4aeaf4d31cf6e0291b2), [`50b1e6a`](https://github.com/nizam-os/kit-ts/commit/50b1e6a32cb2c1bf6f95c1df4f9304da114f27dd), [`eeff0dd`](https://github.com/nizam-os/kit-ts/commit/eeff0dd61a32580458e85d5c22501e77210e079d), [`a2ded61`](https://github.com/nizam-os/kit-ts/commit/a2ded61e43cefd3157c1a1f0e0ffd26237d501cf), [`3ad2c60`](https://github.com/nizam-os/kit-ts/commit/3ad2c60449ed8d0d974cf036cf292cd47e7efc51), [`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45), [`ebbd31f`](https://github.com/nizam-os/kit-ts/commit/ebbd31fddc3a17e259958e2397ec93bf4f6fd154), [`dbc48f5`](https://github.com/nizam-os/kit-ts/commit/dbc48f52ced0d7f864d454a640446b1449fb44a6), [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34), [`6084c4b`](https://github.com/nizam-os/kit-ts/commit/6084c4b681ab940900ef71f049bf07a1548f82f4), [`a3286fe`](https://github.com/nizam-os/kit-ts/commit/a3286fef943a3de401c452584c496b59ab184b70), [`231501b`](https://github.com/nizam-os/kit-ts/commit/231501b7a6a1afe8eac359b50b7a2d99a7cf59b3), [`6d2b017`](https://github.com/nizam-os/kit-ts/commit/6d2b017fb9e8c62ce9fbb2883a3beee74a989075), [`13c1aa9`](https://github.com/nizam-os/kit-ts/commit/13c1aa9cec464c68c0bfcfe82fb05b82429a8b85), [`33f9060`](https://github.com/nizam-os/kit-ts/commit/33f9060871baf54ebd5a09b66194a7b7098f9c19), [`d08e7ee`](https://github.com/nizam-os/kit-ts/commit/d08e7ee00764affee59a646a1e1ffcaf1ef1c554), [`97f3c1c`](https://github.com/nizam-os/kit-ts/commit/97f3c1cf930b9ad71afef5637739faef100d2b60), [`6ce0fba`](https://github.com/nizam-os/kit-ts/commit/6ce0fba5eb97a32c5a884c7c0f450adaba9104b2), [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4), [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152), [`d6c2a48`](https://github.com/nizam-os/kit-ts/commit/d6c2a489b7edb43972c35f99a817235df7615592)]:
  - @nizam-os/jsonapi-core@0.1.0
  - @nizam-os/hono-ban@2.0.0
