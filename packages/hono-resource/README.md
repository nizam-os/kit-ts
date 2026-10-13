# @nizam-os/hono-resource

[Hono](https://hono.dev) routes for a runtime of
[`@nizam-os/resource-core`](https://github.com/nizam-os/kit/tree/main/packages/resource-core)
declarations. `jsonApiRoutes` serves every declared operation at the path its JSON:API links name,
with no handler written per resource:
[`@nizam-os/hono-jsonapi`](https://github.com/nizam-os/kit/tree/main/packages/hono-jsonapi)
negotiates, validates, and builds documents, the runtime authorizes and runs, and your error handler
renders every error. Every choice is written down in
[`docs/resource/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/resource/SPEC.md),
section 19, and the decisions behind it in
[ADR 0013](https://github.com/nizam-os/kit/blob/main/docs/resource/adr/0013-hosts-take-the-runtime-contract-and-mount-where-the-links-point.md).

Status: in development and unreleased. The collection, resource, relationship, and related routes,
includes, the Atomic Operations endpoint, the OpenAPI document, and the 405 of every other method
are served, and `resourceTypeOf` tells your error handler which resource a request addressed, for
localized errors.

## Install

```bash
pnpm add @nizam-os/hono-resource @nizam-os/hono-jsonapi @nizam-os/hono-ban @nizam-os/resource-core hono zod
```

`hono >= 4.13.7`, `@nizam-os/hono-jsonapi`, and `@nizam-os/resource-core` are peer dependencies: your
application declares the resources and mounts `jsonApi()` with its own copies, and the routes must
work with those same copies
([ADR 0006](https://github.com/nizam-os/kit/blob/main/docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)).
The routes import no runtime: any runtime of the contract runs behind them, such as
[`@nizam-os/kysely-resource`](https://github.com/nizam-os/kit/tree/main/packages/kysely-resource)'s.
They run wherever Hono runs: Node 22.12+, Bun, Deno, and Cloudflare Workers. Hono 4.13.7 is the
floor, the first release no published Hono advisory affects. Without the advisories it would be
4.13.0: the operations endpoint decodes an `href` with Hono's own `tryDecodeURIComponent`, so it
names what your router would, and `hono/utils/url` exports it from that release on.

## Quick start

Link the declarations under the base you serve them at, once, in the definer:

```ts
// src/resources/declare-resource.ts
export const declareResource = createDeclareResource({
  catalog: publicCatalog,
  codecs,
  scopes: { organization: { column: 'organization_id' } },
  links: { base: '/api' },
});
```

Then mount the routes of the runtime at `/`, behind `jsonApi()` and your error handlers:

```ts
// src/server/app.ts
import type { JsonApiVariables } from '@nizam-os/hono-jsonapi';

import { Hono } from 'hono';

import {
  ATOMIC_OPERATIONS_EXTENSION,
  CURSOR_PAGINATION_PROFILE,
  errorHandler,
  jsonApi,
  notFoundHandler,
} from '@nizam-os/hono-jsonapi';
import { jsonApiRoutes } from '@nizam-os/hono-resource';

import { runtime } from './runtime'; // what createResourceRuntime resolved to
import { sessionActor } from './session';

export interface AppEnv {
  readonly Variables: JsonApiVariables;
}

export const app = new Hono<AppEnv>();
app.use(
  jsonApi({
    profiles: [CURSOR_PAGINATION_PROFILE],
    extensions: [ATOMIC_OPERATIONS_EXTENSION],
  }),
);
app.onError(errorHandler());
app.notFound(notFoundHandler());
app.route('/', jsonApiRoutes({ runtime, actor: sessionActor }));
```

```ts
// src/server/session.ts
import type { Context } from 'hono';

import type { AppEnv } from './app';

import { jsonApiError } from '@nizam-os/hono-jsonapi';

export async function sessionActor(c: Context<AppEnv>): Promise<AppActor> {
  const session = await sessions.verify(c.req.header('Authorization'));
  if (session === undefined) {
    throw jsonApiError('UNAUTHORIZED', { detail: 'The request carries no valid session' });
  }
  return { id: session.userId, organization: session.organization, can: session.can };
}
```

## Routes

Each route exists only when the declaration declares its operation:

| Route                                              | Runs                                                                      | Answers                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /api/contacts`                                | `list(keysetRequest(Contacts, query), { parameters })`, then each include | 200, the page with the Cursor Pagination links and meta                     |
| `POST /api/contacts`                               | `create(document)`                                                        | 201, the resource document, with `Location` from its links                  |
| `GET /api/contacts/:id`                            | `get(id)`, then each include                                              | 200, the resource document with `included`                                  |
| `PATCH /api/contacts/:id`                          | `update(id, document)`                                                    | 200, the resource document                                                  |
| `DELETE /api/contacts/:id`                         | `remove(id)`                                                              | 204                                                                         |
| `GET /api/contacts/:id/relationships/organization` | `get(id)`                                                                 | 200, the relationship document: the linkage and its links                   |
| `PATCH /api/notes/:id/relationships/contact`       | `update(id, { relationships: { contact: linkage } })`                     | 200, the updated relationship document                                      |
| `GET /api/contacts/:id/organization`               | `get(id)`, then the target's `get` of the linked id                       | 200, the target's resource document, or `data: null` when nothing is linked |

- **The paths are the links'.** `resourcePaths` reads them from each resource's JSON:API links, the
  function the OpenAPI document reads and a client calls through, so the routes, the links, the
  document, and the client name the same URLs. A type outside ASCII is served at the percent-encoded
  path its links spell.
- **Every other method answers 405** with an `Allow` header listing the path's methods, `HEAD`
  beside `GET`, since Hono answers `HEAD` with the `GET` route.
- **The query and the document are validated before the runtime runs**: an undeclared sort is a 400,
  a member the operation does not write a 403 at its pointer, an update whose `id` is not the path's
  a 409.
- **Every refused filter value is answered at once, at the parameter the client sent.** `list` gets
  the query's `filterParameters`, so `filter[status]=gone` is refused at `filter[status]`, a value
  in a group at `filter[or][0][status]`, and three bad values with three error objects.
- **Includes run through the resource's `include`**, so its policy for the relationship decides, and
  the rows join `included` once each.
- **Relationship routes follow the declaration.** They exist when the resource declares `get`: the
  relationship link's `PATCH` when the relationship is `readWrite` and the resource declares
  `update`, and the related link when the target declares `get`. An update the link does not
  support, `POST` or `DELETE` on a to-one relationship or `PATCH` of one the resource does not
  update, answers 403, as JSON:API requires.
- **A refused linkage points at `/data`**, where the relationship document holds it: the runtime's
  `/data/relationships/contact` becomes `/data`, so a client maps the error to what it sent.
- **What the runtime throws is the response**, such as `NOT_FOUND` for a row the actor does not see.

`jsonApiRoutes` throws `TypeError` before it serves anything when an option is wrong, a runtime
without `transaction` among them, when the runtime runs no resource, when a resource's links give no
paths, when the links have different origins or bases, when two routes have one path, the operations
endpoint's among them, when a relationship's target, includable or not, is not among the runtime's
resources, or, when the operations endpoint is served, when the definitions' caps on one request
differ.

## Atomic Operations

When a resource declares `create`, `update`, or `remove`, the routes also serve
`POST /api/operations`, the operations path of your links (`resourcePaths`), their base followed by
`/operations`: the endpoint of the [Atomic Operations extension](https://jsonapi.org/ext/atomic/).
Every operation of a request runs in one `runtime.transaction` as the request's actor, so they
commit together, the first failure rolls every one back, and the hook after commit runs once with
all their events.

```http
POST /api/operations HTTP/1.1
Content-Type: application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"
Accept: application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"

{
  "atomic:operations": [
    { "op": "add", "data": { "type": "contacts", "lid": "lin", "attributes": { "name": "Lin" } } },
    {
      "op": "add",
      "data": {
        "type": "notes",
        "attributes": { "body": "Met at the fair" },
        "relationships": { "contact": { "data": { "type": "contacts", "lid": "lin" } } }
      }
    },
    { "op": "remove", "href": "/api/contacts/3b1d5c2e-8a7f-4e6d-9c0b-1a2b3c4d5e6f" }
  ]
}
```

| `op`     | Target                                               | Runs                                              |
| -------- | ---------------------------------------------------- | ------------------------------------------------- |
| `add`    | none, or a collection `href` such as `/api/contacts` | `create(data)`                                    |
| `update` | a resource's `ref` or `href`, or `data`'s `id`       | `update(id, data)`                                |
| `update` | a `ref` with `relationship`, or a relationship link  | `update(id, { relationships: { <name>: data } })` |
| `remove` | a resource's `ref` or `href`                         | `remove(id)`                                      |

- **A relationship operation follows the declaration**, as the relationship link's `PATCH` does: the
  relationship must be `readWrite` and the resource must declare `update`.
- **Results**: 200 with `atomic:results`, where each `add` and resource `update` carries its row as
  `data`; 204 without a document when none does.
- **A `lid` names what an earlier `add` created**, in a later operation's `ref`, `data`, or linkage.
- **An `href` names what a route serves**: a collection path for an `add`, a resource path, or a
  relationship link, resolved against the endpoint's URL, with the links' origin and no query or
  fragment. Any other `href`, a related link among them, answers 400 at its pointer.
- **Errors point at the operation that failed.** The runtime's `/data/attributes/email` becomes
  `/atomic:operations/1/data/attributes/email`, a relationship operation's refused linkage
  `/atomic:operations/1/data`, and an error without a pointer `/atomic:operations/1`. A constraint
  violation, which the runtime maps once the transaction ended, points at the operation whose call
  raised it all the same.
- **An operation the resource does not declare answers 403**, a type the runtime does not run 404,
  and a request of more operations than the definitions' `atomic.max` 400, before any runs: 10
  unless the definer's `atomic` says otherwise (`createDeclareResource({ atomic: { max: 50 } })`).

## The OpenAPI document

Pass `openapi`, the options of
[`openapi`](https://github.com/nizam-os/kit/tree/main/packages/resource-core#openapi-and-the-api-diff)
without the resources, which are the runtime's, and the routes serve the document at
`GET /api/openapi.json`, the base of your links followed by `/openapi.json`:

```ts
app.route(
  '/',
  jsonApiRoutes({
    runtime,
    actor: sessionActor,
    openapi: {
      info: { title: 'Contacts API', version: '1.0.0' },
      appErrors: APP_ERRORS,
      codes: { all: ['UNAUTHORIZED'] },
    },
  }),
);
```

- **Built once, when `jsonApiRoutes` runs.** A document that cannot be built, such as one with an
  example its schema refuses, throws at boot instead of answering 500 on a request.
- **Served without an actor**, as `application/json`: a client reads it before it has a session.
- **The same paths as the routes**, since both come from the links, so the document cannot drift
  from what the server answers.
- **The operations endpoint is listed** when a resource declares a write: `POST /api/operations`
  under the extension's media type, with a schema for each operation a resource takes, its results,
  and the codes of every write. A client can hold an operations request to it before sending it, and
  a test can hold the endpoint's answers to it, as this repository's end-to-end suite does.

## Errors and localization

The routes throw and your ban renders. Build it with the JSON:API catalog, the codes of the
runtime's resources, and your own, and localize with
[`localizeErrors`](https://github.com/nizam-os/kit/tree/main/packages/resource-core#messages-and-localization),
which labels each member an error points at in the words of the resource the request addressed.
`resourceTypeOf(c)` names that resource:

```ts
// src/server/errors.ts
import { createBan } from '@nizam-os/hono-ban';
import { jsonApi } from '@nizam-os/hono-ban/formats/json-api';
import { resourceTypeOf } from '@nizam-os/hono-resource';
import { ERROR_CATALOG } from '@nizam-os/jsonapi-core';
import { errorCatalog, localizeErrors } from '@nizam-os/resource-core';

import { messages } from '../i18n/messages'; // defineMessages over your Paraglide messages

const ban = createBan({
  errors: { ...ERROR_CATALOG, ...errorCatalog(runtime.resources, APP_ERRORS) },
  format: jsonApi({ mixedEntries: true }),
});

export const handle = ban.onError<AppEnv>({
  transform: localizeErrors(messages, { resource: resourceTypeOf }),
});
```

```ts
// src/server/app.ts
app.use('*', async (c, next) =>
  paraglideMiddleware(c.req.raw, async () => {
    await next();
    return c.res;
  }),
);
app.use(
  jsonApi({ profiles: [CURSOR_PAGINATION_PROFILE], extensions: [ATOMIC_OPERATIONS_EXTENSION] }),
);
app.onError(handle);
```

| The request                                            | `resourceTypeOf(c)`                                             |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| a collection, resource, or relationship route          | the route's resource, from before the actor resolves            |
| a related link, such as `/api/contacts/7/organization` | the target, `organizations`                                     |
| `POST /api/operations`                                 | the type of the operation that failed, when the runtime runs it |
| anything else, such as a 405                           | `undefined`                                                     |

With German messages that label a contact's `email` as `E-Mail`, a client that sends
`{ "email": 5 }` to `POST /api/contacts`, or in the second operation of an operations request, reads
`E-Mail muss vom Typ string sein.` at `/data/attributes/email` or
`/atomic:operations/1/data/attributes/email`.

The contacts application of this repository's end-to-end suite is a complete host composed this way,
served over a socket and held to the document it serves:
[`e2e/resource/support/contacts-server.ts`](https://github.com/nizam-os/kit/tree/main/e2e/resource/support/contacts-server.ts).

## Best practices

**Mount at `/` and keep the prefix in `links.base`.** `app.route('/api', routes)` would serve the
routes at `/api/api/...` while the links and the document still name `/api/...`. The definer's
`links.base` is the one place the prefix lives.

**Resolve the actor from the request's credentials alone.** `actor` runs once per request, before
the query or the document is read, so a client without a session gets your `UNAUTHORIZED` and learns
nothing about the resource from a 400. Throw the catalog's error, never return a guest actor you did
not mean to have, and leave the body to the validators. `UNAUTHORIZED` is a `@nizam-os/ban-core`
built-in, which your messages need not cover, so give it an entry, or a German client reads that 401
in English. A 405, and the 403 of an update a relationship does not support, answer without the
actor: the OpenAPI document lists every path's methods to anyone.

**Type the actor with your `Env`.** Pass a function whose parameter is `Context<AppEnv>`, such as
`sessionActor` above, and the routes are a `Hono<AppEnv>`; an inline arrow with an untyped `c` gets
Hono's default `Env`.

**Leave authorization to the runtime.** The routes check no permission: the runtime's policies
decide every operation and every include, for HTTP and for workers alike.

**List the extension in `jsonApi()`.** The operations endpoint needs `ATOMIC_OPERATIONS_EXTENSION`
among `jsonApi()`'s extensions, as the quick start mounts it; without it, `jsonApi()` answers every
operations request 415 before the route runs.

**Send a change that spans resources as one operations request.** A contact and the note about it
then commit together or not at all, and the hook after commit wakes the relay once. Two requests can
leave the contact without its note when the second fails.

**Send `href`s as the links spell them.** The resolver sees the `href`, not the request, so with
root-relative links an absolute `href` names nothing; echo `links.self` as the server sent it, or
use `ref`.

**Put `jsonApi()` first, and CORS before it.** `jsonApi()` negotiates every request (415 and 406)
before a route runs. A browser's preflight `OPTIONS` would otherwise reach the 405, so mount
`hono/cors` before both when browsers call the API from another origin.

**Localize with `resourceTypeOf`, not with the path.** A type guessed from the URL is `api` under a
base and `operations` on the operations endpoint, so every member loses its label; the routes know
the resource, the related link's target, and the operation that failed.

**Run `paraglideMiddleware` before everything else.** The error handler runs inside the request's
middleware chain, so the messages read the locale the middleware resolved only when it wraps the
whole chain, `jsonApi()`'s 415 and 406 included.

**Serve one runtime with one set of routes.** Its resources must share the links' origin and base;
mounting a second `jsonApiRoutes` of the same runtime would register every route twice.

## Documentation

- [SPEC section 19](https://github.com/nizam-os/kit/blob/main/docs/resource/SPEC.md): the routes'
  contract, and section 12.10 the runtime contract they take
- [DESIGN](https://github.com/nizam-os/kit/blob/main/docs/resource/DESIGN.md): what the resource
  family builds and why
- [ADR 0013](https://github.com/nizam-os/kit/blob/main/docs/resource/adr/0013-hosts-take-the-runtime-contract-and-mount-where-the-links-point.md):
  the routes' decisions

## License

[MIT](./LICENSE)
