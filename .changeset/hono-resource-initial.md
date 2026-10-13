---
'@nizam-os/hono-resource': minor
---

First release: the routes of a resource runtime on Hono. `jsonApiRoutes({ runtime, actor })` takes
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
