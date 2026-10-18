# @nizam-os/resource-ui

## 0.1.0

### Minor Changes

- [#191](https://github.com/nizam-os/kit-ts/pull/191) [`6c828e2`](https://github.com/nizam-os/kit-ts/commit/6c828e2131717bdf35c9bba9ebd4270ab5888a7d) Thanks [@ali-issa](https://github.com/ali-issa)! - Describe a row's and a selection's actions from the declaration. `recordActions(resource, options)`
  and `bulkActions(resource, options)` take actions by name, each a removal or an update with fixed
  values, and hold the write to the declaration: it must serve the write, an update's values must set
  members its update writes and pass its write validator, and anything else throws `TypeError` before
  the model returns. Each action keeps the application's texts as given and reports `state(target)`,
  whether it shows by `can` and `hidden` and whether it runs by `disabled`, with a reason for a
  tooltip. A record action gives the variables of `resourceQueries`' `update` or `remove`; a bulk
  action gives one Atomic Operations operation per selected id for `operationsMutation`, disables a
  selection that is empty or over the definition's `atomic.max`, and maps a refusal to the record of
  each operation and the member it names.

- [#180](https://github.com/nizam-os/kit-ts/pull/180) [`9587f29`](https://github.com/nizam-os/kit-ts/commit/9587f2964869379031b751c0523eda286fc63f55) Thanks [@ali-issa](https://github.com/ali-issa)! - New package: a framework-free model of forms and lists over resource-core declarations, starting
  with field descriptors. `fieldsOf(resource, messages)` describes each public field and relationship
  with the messages' own label functions and option labels, which render in the locale of each call,
  whether a create must carry it, whether it sorts, and its filter's control and declared operators.

- [#136](https://github.com/nizam-os/kit-ts/pull/136) [`0c8c6fa`](https://github.com/nizam-os/kit-ts/commit/0c8c6fa3d316be3b1fa0cc1c1d64885ca9e61735) Thanks [@ali-issa](https://github.com/ali-issa)! - Add `resourceForm(resource, operation, options)`, a framework-free model of a create or an update
  form over a declared resource. It holds the members the operation writes, or those `members` names,
  and starts them on create from each default as a read gives it, an array's included, and on update
  from the record the client read, each value as its input edits it. Its `validator` is a synchronous
  Standard Schema that runs the declaration's own write validator and puts each issue on its field in
  the words the server gives the same refusal, a blank value reading as required. `write(values)`
  returns what the client's `create` or `update` takes: only the members the person changed, a cleared
  input as `null`. `errors(error)` places a refused write's error objects on the fields their pointers
  name, the rest for a banner. `@nizam-os/jsonapi-client` is a peer dependency.

- [#136](https://github.com/nizam-os/kit-ts/pull/136) [`62ac31e`](https://github.com/nizam-os/kit-ts/commit/62ac31eb17f0af291fece99fe7f0c9812694d066) Thanks [@ali-issa](https://github.com/ali-issa)! - Add `resourceList(resource, messages)`, a framework-free model of a list screen whose state is the
  client's list query: its `sort`, `filter`, `page`, and `search`, kept where the application keeps
  it, such as a route's search. It gives TanStack Table v9 its sorting and column filters, the
  declaration's default order when the state has no sort, and turns each change Table hands back,
  updaters included, into the next state, starting over at the first page for every change but paging;
  an input emptied to `undefined` or an empty list removes its filter. `next` and `previous` follow
  the result's links, ending where the server has no further page. `query(search)` reads a route's
  search back leniently, as JSON or as the API's own parameters, dropping each member the definition
  refuses so a stale or edited link still opens the list, and keeping JSON in its own forms so a
  router that validates its search after every navigation reads the same state. `columns` holds the
  descriptors of the members a read returns. Table is not a peer: the model imports nothing of it.
  `@nizam-os/jsonapi-core` is a dependency.

### Patch Changes

- [#191](https://github.com/nizam-os/kit-ts/pull/191) [`8a2cc03`](https://github.com/nizam-os/kit-ts/commit/8a2cc03db49d2f70ca2fe442c66ecf3e6c953b55) Thanks [@ali-issa](https://github.com/ali-issa)! - Type each action of a model by the call its write makes. `recordActions` and `bulkActions` typed
  every action as either write the declaration serves, so
  `update.mutate(rowActions.archive.variables(contact))` did not compile until the screen narrowed on
  `call`. They now infer, by name, what each action gives as `remove`: `true` types a removal, nothing
  or `undefined` an update, and an action typed as its init before the call either write. Every action
  is still checked against its init, so a member no action takes or an attribute no update writes
  stays an error. `RecordActions` and `BulkActions` take each name's `ActionCall`, now exported, and
  `RecordActionsOptions` and `BulkActionsOptions` take what each action gives as `remove` in place of
  the names.

- [#136](https://github.com/nizam-os/kit-ts/pull/136) [`a6156da`](https://github.com/nizam-os/kit-ts/commit/a6156da956e0ba2204158a21338c8689623a66ef) Thanks [@ali-issa](https://github.com/ali-issa)! - `resourceList`'s `query(search)` names every member of the list query, `undefined` where the state
  holds none. TanStack Router hands a route the URL's search with the validated one spread over it, so
  a member `query` dropped, such as a sort the definition refuses, still reached the request and the
  server refused it with a 400; the URL's `include` and `fields` reached the request too.
- Updated dependencies [[`f6568c1`](https://github.com/nizam-os/kit-ts/commit/f6568c1b4448a9e092f9f7132601c6f48b404c69), [`6c8d4df`](https://github.com/nizam-os/kit-ts/commit/6c8d4dfa08366e330e2dde1aa791ea6b35432e45), [`ebbd31f`](https://github.com/nizam-os/kit-ts/commit/ebbd31fddc3a17e259958e2397ec93bf4f6fd154), [`87a54f2`](https://github.com/nizam-os/kit-ts/commit/87a54f2e3e583652693daeb89823f89f56ed5e62), [`fd58e17`](https://github.com/nizam-os/kit-ts/commit/fd58e17a2760567201515ae061736bc9a081174b), [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34), [`47b5e86`](https://github.com/nizam-os/kit-ts/commit/47b5e868731f0b20def93d61e255234df1ea0961), [`6dd6c4f`](https://github.com/nizam-os/kit-ts/commit/6dd6c4f1f825a928cf6cb568c15e6463d1e5850b), [`6264485`](https://github.com/nizam-os/kit-ts/commit/6264485bdceb370a7fa5fb87bd52a365127d0991), [`0bdd504`](https://github.com/nizam-os/kit-ts/commit/0bdd5044c67ee0b7a2ef032d999d71fbe3fae9ea), [`6084c4b`](https://github.com/nizam-os/kit-ts/commit/6084c4b681ab940900ef71f049bf07a1548f82f4), [`a3286fe`](https://github.com/nizam-os/kit-ts/commit/a3286fef943a3de401c452584c496b59ab184b70), [`231501b`](https://github.com/nizam-os/kit-ts/commit/231501b7a6a1afe8eac359b50b7a2d99a7cf59b3), [`6d2b017`](https://github.com/nizam-os/kit-ts/commit/6d2b017fb9e8c62ce9fbb2883a3beee74a989075), [`13c1aa9`](https://github.com/nizam-os/kit-ts/commit/13c1aa9cec464c68c0bfcfe82fb05b82429a8b85), [`33f9060`](https://github.com/nizam-os/kit-ts/commit/33f9060871baf54ebd5a09b66194a7b7098f9c19), [`d08e7ee`](https://github.com/nizam-os/kit-ts/commit/d08e7ee00764affee59a646a1e1ffcaf1ef1c554), [`97f3c1c`](https://github.com/nizam-os/kit-ts/commit/97f3c1cf930b9ad71afef5637739faef100d2b60), [`6ce0fba`](https://github.com/nizam-os/kit-ts/commit/6ce0fba5eb97a32c5a884c7c0f450adaba9104b2), [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4), [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152), [`b417552`](https://github.com/nizam-os/kit-ts/commit/b4175527fa26aa1f36ca68fddc4e0d49a74a7d09), [`48677cf`](https://github.com/nizam-os/kit-ts/commit/48677cf9f997eb934d9b895ebfe26e38b3b43989), [`3165675`](https://github.com/nizam-os/kit-ts/commit/31656752fb3e252b61d20c9eeed8f2a484264a83), [`f8e652c`](https://github.com/nizam-os/kit-ts/commit/f8e652cde529ec1c0fdcfdd83c64bd0e471d0210), [`d6c2a48`](https://github.com/nizam-os/kit-ts/commit/d6c2a489b7edb43972c35f99a817235df7615592), [`0cb082d`](https://github.com/nizam-os/kit-ts/commit/0cb082d3939b6142d2daa2a1ebc5cc89db3591ec), [`8b5e206`](https://github.com/nizam-os/kit-ts/commit/8b5e206bab7c144acf9fe0d5bc992707b1700f54), [`4fe1af3`](https://github.com/nizam-os/kit-ts/commit/4fe1af3df37ed4411e64378ba87150321f20da18), [`82eca45`](https://github.com/nizam-os/kit-ts/commit/82eca45cade231500a5d75f2ba3d0d0cf72ee812), [`f4a53b4`](https://github.com/nizam-os/kit-ts/commit/f4a53b407ab4cdcb3245755ca03bb2c436a61a9d), [`e8f8ade`](https://github.com/nizam-os/kit-ts/commit/e8f8adebe8870015d0127b52593f574ebddcb916), [`e11a6cc`](https://github.com/nizam-os/kit-ts/commit/e11a6cc1ff9f68dd56a3997acfdf6acec782e283), [`cec37c1`](https://github.com/nizam-os/kit-ts/commit/cec37c138fabaf2e37703e39b2b605368b95015e), [`0a5fe97`](https://github.com/nizam-os/kit-ts/commit/0a5fe9772396d7514147806453153cf1f3ac3547), [`2a56a8e`](https://github.com/nizam-os/kit-ts/commit/2a56a8ea4a88b0fa88650d5be15fb7e8277dc43f), [`ad320bf`](https://github.com/nizam-os/kit-ts/commit/ad320bfe3cce31a4d4e0d0f670f8fac51797ed1e), [`cd69e52`](https://github.com/nizam-os/kit-ts/commit/cd69e525896f7261d34de2710c585d0b7b65c7d9), [`eed8b0b`](https://github.com/nizam-os/kit-ts/commit/eed8b0b4c5ee78eb39f13655d79d631d77eeb9df), [`36ae74c`](https://github.com/nizam-os/kit-ts/commit/36ae74cddb998a6fdddcbc89c0ee1f9787574b34), [`9b7d42f`](https://github.com/nizam-os/kit-ts/commit/9b7d42fd541839ffb6182d9b2fa301736713e6b4), [`e7949ba`](https://github.com/nizam-os/kit-ts/commit/e7949ba2ff768c3950259b061463488e4d7c09de), [`659c973`](https://github.com/nizam-os/kit-ts/commit/659c973dbed17e51e863e21e0c6886ae3fd01a13), [`f62c925`](https://github.com/nizam-os/kit-ts/commit/f62c925720dbfa3b0f69f306be7feb8aaf201e1e), [`4e920da`](https://github.com/nizam-os/kit-ts/commit/4e920da161a11c6b27360232d14756aa36718b8d), [`a9ba280`](https://github.com/nizam-os/kit-ts/commit/a9ba280088ac37123393530c449bd765542bc206), [`f662dc3`](https://github.com/nizam-os/kit-ts/commit/f662dc308235224e2f1d91fb2c70fed568be9e24), [`8a87a9f`](https://github.com/nizam-os/kit-ts/commit/8a87a9fa2feada78b4a7a5a490a36c19fdd7eb85), [`332bb8d`](https://github.com/nizam-os/kit-ts/commit/332bb8da391d968083a224102c04f6ad25da662a), [`f475362`](https://github.com/nizam-os/kit-ts/commit/f475362adca6a54d11a4ebaf5610b079a3fab9d6), [`97f3c1c`](https://github.com/nizam-os/kit-ts/commit/97f3c1cf930b9ad71afef5637739faef100d2b60), [`c7efc14`](https://github.com/nizam-os/kit-ts/commit/c7efc1494831b0b206dffbb78630a3f403fb67c7), [`a9a23d3`](https://github.com/nizam-os/kit-ts/commit/a9a23d3eb014c958361ec7c714cd5c212020cef9), [`227c2ac`](https://github.com/nizam-os/kit-ts/commit/227c2ac67b1c81e94c848bf29093f05d5c535251), [`829408d`](https://github.com/nizam-os/kit-ts/commit/829408dfca7d6b27b43e688ebc6fe829e0e8c44d), [`a2ded61`](https://github.com/nizam-os/kit-ts/commit/a2ded61e43cefd3157c1a1f0e0ffd26237d501cf), [`c052bd8`](https://github.com/nizam-os/kit-ts/commit/c052bd8a528012779deea2c20026f653a0afe7f0), [`3449a4a`](https://github.com/nizam-os/kit-ts/commit/3449a4abef916ab3cb2fbf32ea3a086a7fb00794), [`248e80b`](https://github.com/nizam-os/kit-ts/commit/248e80bfaa669dc9ebbe1453a5402e37327faa94), [`1f6f805`](https://github.com/nizam-os/kit-ts/commit/1f6f805b38737d372977ebf4563375593d4c6152), [`6d8a03e`](https://github.com/nizam-os/kit-ts/commit/6d8a03ef03534c724778d40068450b7bc63425e1)]:
  - @nizam-os/jsonapi-core@0.1.0
  - @nizam-os/resource-core@0.1.0
  - @nizam-os/jsonapi-client@0.1.0
