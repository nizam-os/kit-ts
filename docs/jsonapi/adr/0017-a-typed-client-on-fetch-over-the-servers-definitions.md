# ADR 0017: A typed client in the family, on fetch, over the server's definitions

- Status: accepted
- Date: 2026-10-12

## Context

The family's design listed client-side serialization as a non-goal: the request document types were
exported so a typed client could be written against them, and none shipped. Applications built on
the family need one. A web application calls the API its own server defines, a worker calls another
service's, and each writes the same code: building paths, serializing `include`, `fields`, `sort`,
`page`, and `filter` as the server parses them, turning compound documents into records, and reading
error documents. Written per application, that code drifts from the server: a filter value joined
with commas where the server repeats the parameter, a path that no longer matches the links.

The server's definitions already hold the paths (their links, ADR 0015), the query capabilities, and
the field names; ADR 0018 makes them hold the types too. They are plain modules the client can
import: a definition's `serialize` and validators are never called by a client.

A client runs where `fetch` runs: browsers, workers, Node, Bun, and Deno. Its requests carry the
application's credentials (a session header, a bearer token), and a response is data the client did
not write. fetch drops `Authorization` when a redirect leaves the request's origin; a client that
sends an absolute URL past its configured base sends its headers anywhere (ofetch #564).

The clients surveyed (jsona 1.14, kitsu 11.1, @orbit/jsonapi 0.17, json-api-normalizer 1.0, and
WarpDrive 5.9 among JSON:API clients; openapi-fetch 0.17, ky 2.2, and ofetch 1.5 among typed fetch
clients) agree on little and share pitfalls this decision avoids:

- Orbit discards a 404's error document and any error body of an unexpected media type; WarpDrive
  puts the HTTP status in `code`, where JSON:API keeps each error object's own string code.
- WarpDrive sorts a query's keys and array values, so `sort=title,-created` reaches the server
  reordered, against "Sort fields SHOULD be applied in the order specified".
- A `Content-Type` on a `GET` makes a cross-origin request preflighted; kitsu always sends one.
- A client-level timeout signal is created once and shared by every request (openapi-fetch #2567),
  and a library's `instanceof Response` check broke an injected fetch (ky #857).

@ref https://jsonapi.org/format/1.1/#content-negotiation-clients @ref
https://fetch.spec.whatwg.org/#http-redirect-fetch (step 13: "the moment another origin is seen
after the initial request, the Authorization header is removed") @ref
https://github.com/unjs/ofetch/issues/564 @ref
https://github.com/orbitjs/orbit/blob/v0.17.1/packages/%40orbit/jsonapi/src/jsonapi-request-processor.ts#L372
@ref
https://github.com/warp-drive-data/warp-drive/blob/v5.9.1/warp-drive-packages/core/src/request/-private/fetch.ts#L282-L290
@ref
https://github.com/warp-drive-data/warp-drive/blob/v5.9.1/warp-drive-packages/utilities/src/index.ts#L689
@ref https://jsonapi.org/format/1.1/#fetching-sorting @ref
https://fetch.spec.whatwg.org/#cors-safelisted-request-header

## Decision

- `@nizam-os/jsonapi-client` joins the family: it depends on `@nizam-os/jsonapi-core` and on nothing
  else, uses web standards only, and imports no framework. `createClients(definitions, transport)`
  gives each definition a client whose methods and records are typed by `'~types'` (ADR 0018) and by
  the definitions passed beside it, which resolve related types.
- The application states where the server is, once: `createTransport({ origin })`. Every path comes
  from the definitions' links through `resourcePaths`, which moves from `@nizam-os/resource-core` to
  `@nizam-os/jsonapi-core` so the OpenAPI document, the routes, and the client read paths through one
  function. A definition's own origin, from an absolute `links.base`, is ignored: the transport's
  origin is the client's view of the server.
- Queries serialize to what `parseQuery` reads, through `URLSearchParams`, the
  `application/x-www-form-urlencoded` serializer JSON:API names, members in a fixed order, each list
  in the order given, a filter list as a repeated parameter; the round trip is a test. The client
  checks no name or value against the definition: the types restrict them, and the server reports
  the rest in one 400.
- A response that is not 2xx, a 4xx and a 5xx alike, rejects with `ResponseError`, holding the HTTP
  status and the error document's objects with their own codes, or no objects when the body is not
  an error document; a 2xx that is not a JSON:API document is a `TypeError`, a broken protocol, not
  a condition to handle; a rejected `fetch` reaches the caller as it is. The response is read once,
  through its members, never cloned or tested with `instanceof`.
- A request carries `Accept` with the bare media type, and `Content-Type` only with a document; a
  timeout is the caller's `signal`, per call. Results are plain objects with the status, the data,
  and the document's `links`, `meta`, and `jsonapi`; a write's data is `undefined` when the server
  answered 202 or 204 without a document, as JSON:API allows.
- The client follows a link from a document (`links.next`, `links.prev`) only when it is absolute or
  root-relative and resolves to the transport's origin; otherwise it throws `TypeError`. A response
  must not be able to send the application's headers to another origin, the same reason fetch drops
  `Authorization` on a cross-origin redirect.
- `headers` and `language` are functions read on every request, so a rotated session and a changed
  locale apply to the next call; `language` gives `Accept-Language`, which an application on
  Paraglide fills with `getLocale`.

## Consequences

An application imports the definitions its server uses and gets typed calls with nothing
regenerated; a change to a definition reaches the client in the same type check. The client bundle
holds the definitions it imports and their validators, which a browser application already ships
when it validates forms with them. A server whose links do not follow a route design the client can
read (`resourcePaths`' rules) cannot be called through `createClients`. Following only same-origin
links means a server that pages through another host needs its cursors read with `pageCursors` and
passed to `list`. The DESIGN's non-goal is replaced by this package.
