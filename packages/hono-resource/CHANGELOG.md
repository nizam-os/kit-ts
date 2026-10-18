# @nizam-os/hono-resource

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

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`67425b9`](https://github.com/nizam-os/kit-ts/commit/67425b974cbe275eba8ab8587f7ae73aa39c6f26) Thanks [@ali-issa](https://github.com/ali-issa)! - Serve the OpenAPI document and name the resource a request addressed for localized errors. With the
  new `openapi` option, `jsonApiRoutes` serves `openapi(runtime.resources, options)` at
  `GET <base>/openapi.json` as `application/json`, without an actor; the document is built once when
  the routes are made, so one that cannot be built fails at boot, and a resource whose route takes the
  path is refused. The new `resourceTypeOf(c)` is the type of the resource the request's route serves,
  the target's on a related link, and the type of the operation that failed on the operations
  endpoint, so `localizeErrors(messages, { resource: resourceTypeOf })` labels each member an error
  points at in the words of its own resource.

- [#154](https://github.com/nizam-os/kit-ts/pull/154) [`4082e29`](https://github.com/nizam-os/kit-ts/commit/4082e291f08e563fe8d52ec621feefbced4d746a) Thanks [@ali-issa](https://github.com/ali-issa)! - Requires `hono` 4.13.0 or later. The operations endpoint decodes an operation's `href` with Hono's
  own `tryDecodeURIComponent`, so it names what the application's router would, and `hono/utils/url`
  exports that function from 4.13.0 on. On 4.12.34, which the peer range admitted, the package could
  not load.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`c0f6278`](https://github.com/nizam-os/kit-ts/commit/c0f62784ad18ca5b8ab52f2ce678ffffc1192051) Thanks [@ali-issa](https://github.com/ali-issa)! - First release: the routes of a resource runtime on Hono. `jsonApiRoutes({ runtime, actor })` takes
  any runtime of the contract in `@nizam-os/resource-core/server`, such as `createResourceRuntime`
  resolves to, and returns a Hono app that serves each operation the runtime runs at the paths the
  declarations' links name: `GET` and `POST` on the collection, and `GET`, `PATCH`, and `DELETE` on
  the resource, with query and document validation, keyset pages, and includes.
  
  - The actor resolves once per request, before the query or the document is read, so a request it
    refuses answers that refusal whatever else is wrong with it.
  - Any other method of a served path answers 405 with `Allow`, before the actor resolves.
  - Links the routes cannot serve, such as two origins or two resources on one path, and an includable
    relationship whose target the runtime does not run, throw `TypeError` when the app is built.
  - `hono`, `@nizam-os/hono-jsonapi`, and `@nizam-os/resource-core` are peer dependencies: the
    application hands the routes values made with its own copies.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`a3286fe`](https://github.com/nizam-os/kit-ts/commit/a3286fef943a3de401c452584c496b59ab184b70) Thanks [@ali-issa](https://github.com/ali-issa)! - Serve the Atomic Operations endpoint at `<base>/operations` when a resource declares a write. A
  request's operations run in one `runtime.transaction` as its actor: `add` is `create`, `update` is
  `update`, `remove` is `remove`, and an `update` of a `readWrite` relationship is `update` with that
  relationship alone. They commit together, or the first failure rolls every one back and points at
  the operation that failed, inside its data where the runtime pointed into the input, a constraint
  violation mapped once the transaction ended included. An `href` names a collection, a resource, or a
  relationship link of the routes. `jsonApi()` must list `ATOMIC_OPERATIONS_EXTENSION`, and the
  runtime must implement `transaction`.

- [#115](https://github.com/nizam-os/kit-ts/pull/115) [`9db645f`](https://github.com/nizam-os/kit-ts/commit/9db645f0dcebb71e7dfce995c8c6c1cb5591f372) Thanks [@ali-issa](https://github.com/ali-issa)! - Serve each to-one relationship's routes where its links point: `GET` of the relationship link
  answers the row's linkage, `PATCH` updates it where the relationship is `readWrite` and the resource
  declares `update`, and `GET` of the related link answers the target's resource document, or
  `data: null`. An update a relationship link does not support answers 403, as JSON:API requires, and
  a refused linkage points at `/data`, where the relationship document holds it. `jsonApiRoutes` now
  requires every relationship's target among the runtime's resources, includable or not.

### Patch Changes

- [#158](https://github.com/nizam-os/kit-ts/pull/158) [`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45) Thanks [@ali-issa](https://github.com/ali-issa)! - A refused filter value's error names the query parameter the client sent, as the parser's own
  refusals do. `parseQuery`'s filter conditions keep the `parameter` they came in, as the request
  spelled it, and a condition built by hand names one too. Each entry of keyset-core's
  `InvalidFilterValueError` carries its condition's `path` in the filter tree.
  `@nizam-os/resource-core`'s `filterParameters(resource, query)` lists each condition's path and
  parameter, which a runtime's `list` takes as its `parameters` option. `@nizam-os/kysely-resource`
  then answers a refused value at that parameter, in a transaction too: `filter[status]` or
  `filter[or][0][status]`, where it answered `filter[status][eq]`. `@nizam-os/hono-resource`'s list
  route passes the parameters.
- Updated dependencies [[`f6568c1`](https://github.com/nizam-os/kit-ts/commit/f6568c1b4448a9e092f9f7132601c6f48b404c69), [`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45), [`dbc48f5`](https://github.com/nizam-os/kit-ts/commit/dbc48f52ced0d7f864d454a640446b1449fb44a6), [`3e27946`](https://github.com/nizam-os/kit-ts/commit/3e27946125c98f606d5d184c8fa8a3ebe541fef2), [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34), [`a3286fe`](https://github.com/nizam-os/kit-ts/commit/a3286fef943a3de401c452584c496b59ab184b70), [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4), [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152), [`b417552`](https://github.com/nizam-os/kit-ts/commit/b4175527fa26aa1f36ca68fddc4e0d49a74a7d09), [`48677cf`](https://github.com/nizam-os/kit-ts/commit/48677cf9f997eb934d9b895ebfe26e38b3b43989), [`3165675`](https://github.com/nizam-os/kit-ts/commit/31656752fb3e252b61d20c9eeed8f2a484264a83), [`f8e652c`](https://github.com/nizam-os/kit-ts/commit/f8e652cde529ec1c0fdcfdd83c64bd0e471d0210), [`d6c2a48`](https://github.com/nizam-os/kit-ts/commit/d6c2a489b7edb43972c35f99a817235df7615592), [`0cb082d`](https://github.com/nizam-os/kit-ts/commit/0cb082d3939b6142d2daa2a1ebc5cc89db3591ec), [`8b5e206`](https://github.com/nizam-os/kit-ts/commit/8b5e206bab7c144acf9fe0d5bc992707b1700f54), [`4fe1af3`](https://github.com/nizam-os/kit-ts/commit/4fe1af3df37ed4411e64378ba87150321f20da18), [`82eca45`](https://github.com/nizam-os/kit-ts/commit/82eca45cade231500a5d75f2ba3d0d0cf72ee812), [`f4a53b4`](https://github.com/nizam-os/kit-ts/commit/f4a53b407ab4cdcb3245755ca03bb2c436a61a9d), [`e8f8ade`](https://github.com/nizam-os/kit-ts/commit/e8f8adebe8870015d0127b52593f574ebddcb916), [`e11a6cc`](https://github.com/nizam-os/kit-ts/commit/e11a6cc1ff9f68dd56a3997acfdf6acec782e283), [`cec37c1`](https://github.com/nizam-os/kit-ts/commit/cec37c138fabaf2e37703e39b2b605368b95015e), [`0a5fe97`](https://github.com/nizam-os/kit-ts/commit/0a5fe9772396d7514147806453153cf1f3ac3547), [`2a56a8e`](https://github.com/nizam-os/kit-ts/commit/2a56a8ea4a88b0fa88650d5be15fb7e8277dc43f), [`ad320bf`](https://github.com/nizam-os/kit-ts/commit/ad320bfe3cce31a4d4e0d0f670f8fac51797ed1e), [`cd69e52`](https://github.com/nizam-os/kit-ts/commit/cd69e525896f7261d34de2710c585d0b7b65c7d9), [`eed8b0b`](https://github.com/nizam-os/kit-ts/commit/eed8b0b4c5ee78eb39f13655d79d631d77eeb9df), [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34), [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4), [`e7949ba`](https://github.com/nizam-os/kit-ts/commit/e7949ba2ff768c3950259b061463488e4d7c09de), [`659c973`](https://github.com/nizam-os/kit-ts/commit/659c973dbed17e51e863e21e0c6886ae3fd01a13), [`f62c925`](https://github.com/nizam-os/kit-ts/commit/f62c925720dbfa3b0f69f306be7feb8aaf201e1e), [`4e920da`](https://github.com/nizam-os/kit-ts/commit/4e920da161a11c6b27360232d14756aa36718b8d), [`a9ba280`](https://github.com/nizam-os/kit-ts/commit/a9ba280088ac37123393530c449bd765542bc206), [`f662dc3`](https://github.com/nizam-os/kit-ts/commit/f662dc308235224e2f1d91fb2c70fed568be9e24), [`8a87a9f`](https://github.com/nizam-os/kit-ts/commit/8a87a9fa2feada78b4a7a5a490a36c19fdd7eb85), [`332bb8d`](https://github.com/nizam-os/kit-ts/commit/332bb8da391d968083a224102c04f6ad25da662a), [`f475362`](https://github.com/nizam-os/kit-ts/commit/f475362adca6a54d11a4ebaf5610b079a3fab9d6), [`97f3c1c`](https://github.com/nizam-os/kit-ts/commit/97f3c1cf930b9ad71afef5637739faef100d2b60), [`c7efc14`](https://github.com/nizam-os/kit-ts/commit/c7efc1494831b0b206dffbb78630a3f403fb67c7), [`a9a23d3`](https://github.com/nizam-os/kit-ts/commit/a9a23d3eb014c958361ec7c714cd5c212020cef9), [`227c2ac`](https://github.com/nizam-os/kit-ts/commit/227c2ac67b1c81e94c848bf29093f05d5c535251), [`829408d`](https://github.com/nizam-os/kit-ts/commit/829408dfca7d6b27b43e688ebc6fe829e0e8c44d), [`a2ded61`](https://github.com/nizam-os/kit-ts/commit/a2ded61e43cefd3157c1a1f0e0ffd26237d501cf), [`c052bd8`](https://github.com/nizam-os/kit-ts/commit/c052bd8a528012779deea2c20026f653a0afe7f0), [`3449a4a`](https://github.com/nizam-os/kit-ts/commit/3449a4abef916ab3cb2fbf32ea3a086a7fb00794), [`248e80b`](https://github.com/nizam-os/kit-ts/commit/248e80bfaa669dc9ebbe1453a5402e37327faa94), [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152), [`6d8a03e`](https://github.com/nizam-os/kit-ts/commit/6d8a03ef03534c724778d40068450b7bc63425e1)]:
  - @nizam-os/hono-jsonapi@0.1.0
  - @nizam-os/resource-core@0.1.0
