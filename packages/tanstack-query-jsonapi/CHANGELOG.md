# @nizam-os/tanstack-query-jsonapi

## 0.1.0

### Minor Changes

- [#180](https://github.com/nizam-os/kit-ts/pull/180) [`5a88c8a`](https://github.com/nizam-os/kit-ts/commit/5a88c8a22e6bff643847c727f2279ee8b5c6e570) Thanks [@ali-issa](https://github.com/ali-issa)! - New package: TanStack Query options for `@nizam-os/jsonapi-client`'s calls, which every adapter's
  hooks take as they are: React's, Vue's, Solid's, Svelte's, and Angular's. `resourceQueries(client)`
  gives each read and write of a resource as a plain object typed with `@tanstack/query-core`, an
  optional peer from 5.89 imported for types only, keyed by the request it sends, so two queries that
  send one request share one cache entry and invalidating the type reaches every list, page, and
  record of it. Reads pass TanStack Query's signal, so a cancelled query aborts its request. An
  infinite list pages both ways by the server's links from the query's own cursors. Each write
  invalidates its type, and the other types its `invalidates` setting names, and stays pending until
  the reads it touched have refetched; a removal first drops the record's own entries, so a screen
  still showing it does not fetch a 404. `@nizam-os/jsonapi-client` is a peer dependency.

- [#191](https://github.com/nizam-os/kit-ts/pull/191) [`63ab127`](https://github.com/nizam-os/kit-ts/commit/63ab1272360b67931b2a2e50710fe68648fa7f6c) Thanks [@ali-issa](https://github.com/ali-issa)! - Send Atomic Operations as one mutation. `operationsMutation(transport, settings?)` returns mutation
  options, typed `OperationsOptions`, whose `mutationFn` sends the operations `operationsOf` builds
  with `sendOperations`, under the `mutationKey` `['operations']`. On success it removes the `get`
  entries of every record a removal removed, then invalidates every type the operations write and each
  key `invalidates` names, and stays pending until the reads a screen shows have refetched, as the
  single writes do; a refused request invalidates nothing. The operations are any operation by
  default, each result's data `unknown`, and a type argument narrows them. `invalidates` that is not a
  list of query keys throws `TypeError`.

### Patch Changes

- Updated dependencies [[`ebbd31f`](https://github.com/nizam-os/kit-ts/commit/ebbd31fddc3a17e259958e2397ec93bf4f6fd154), [`87a54f2`](https://github.com/nizam-os/kit-ts/commit/87a54f2e3e583652693daeb89823f89f56ed5e62), [`fd58e17`](https://github.com/nizam-os/kit-ts/commit/fd58e17a2760567201515ae061736bc9a081174b), [`47b5e86`](https://github.com/nizam-os/kit-ts/commit/47b5e868731f0b20def93d61e255234df1ea0961), [`6dd6c4f`](https://github.com/nizam-os/kit-ts/commit/6dd6c4f1f825a928cf6cb568c15e6463d1e5850b), [`6264485`](https://github.com/nizam-os/kit-ts/commit/6264485bdceb370a7fa5fb87bd52a365127d0991), [`0bdd504`](https://github.com/nizam-os/kit-ts/commit/0bdd5044c67ee0b7a2ef032d999d71fbe3fae9ea)]:
  - @nizam-os/jsonapi-client@0.1.0
