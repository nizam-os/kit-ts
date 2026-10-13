# @nizam-os/jsonapi-client

A typed client for [JSON:API 1.1](https://jsonapi.org/format/1.1/) servers built with
[`@nizam-os/jsonapi-core`](../jsonapi-core#readme). Its calls, the queries they send, the documents
they write, and the records they read are typed by the definitions the server is built from, so an
include path, sort, filter, fieldset, or attribute the server would refuse fails `tsc` first, and a
record holds exactly what the query asked for. Error documents become a `ResponseError` that keeps
each error's code. Nothing is generated: the client imports the definitions. It uses web standards
only (`fetch`, `Request`, `Headers`, `URL`, `URLSearchParams`), so one build runs in browsers,
workers, Node, Bun, and Deno. Writes that must commit together go in one request through the Atomic
Operations extension. The contract is sections 15 and 17 of
[`docs/jsonapi/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/jsonapi/SPEC.md).

## Install

```bash
pnpm add @nizam-os/jsonapi-client
```

`@nizam-os/jsonapi-core` is the one dependency. The definitions are the server's: see
[What a client sees](../jsonapi-core#what-a-client-sees) for what they carry and how to share them.

## Calls

`createTransport` says where the server is and what every request carries; `createClients` gives a
client per definition:

```ts
import { Articles, People, Tags } from '@acme/api/definitions';

import { createClients, createTransport } from '@nizam-os/jsonapi-client';

import { getLocale } from './paraglide/runtime.js';

const transport = createTransport({
  origin: 'https://api.example.com',
  headers: async () => ({ Authorization: `Bearer ${await session.token()}` }),
  language: getLocale,
});
export const api = createClients({ articles: Articles, people: People, tags: Tags }, transport);

const { data: articles } = await api.articles.list({
  include: ['author'],
  sort: ['-createdAt'],
  page: { size: 20 },
});
articles[0]?.author?.name; // string: the author was included

const { data: created } = await api.articles.create({
  attributes: { title: 'JSON:API', body: 'A specification for building APIs' },
  relationships: { author: '9', tags: ['t1', 't2'] },
});
```

| Call                                                         | Request                                      | `data`                                          |
| ------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------- |
| `list(query?)`                                               | `GET` the collection                         | the records                                     |
| `get(id, query?)`                                            | `GET` the resource, with `include`, `fields` | the record                                      |
| `create(input)`                                              | `POST` the collection                        | the stored record; `undefined` for a 202 or 204 |
| `update(id, input)`                                          | `PATCH` the resource                         | the record as updated, or `undefined`           |
| `remove(id)`                                                 | `DELETE` the resource                        | `undefined`                                     |
| `relationship(id, name)`                                     | `GET` the relationship link                  | the linkage, each identifier with its `meta`    |
| `related(id, name, query?)`                                  | `GET` the related link, `include`, `fields`  | the related record or `null`, or the records    |
| `setRelationship(id, name, linkage)`                         | `PATCH` the relationship link                | the linkage, or `undefined`                     |
| `addToRelationship(id, name, ids)`, `removeFromRelationship` | `POST`, `DELETE` the link of a to-many       | the linkage, or `undefined`                     |
| `next(page)`, `prev(page)`                                   | `GET` the page's `links.next`, `links.prev`  | the records; `undefined` without the link       |

Each call takes `{ signal, headers }` last and resolves to `{ status, data, links, meta, jsonapi }`.
`api.articles.definition` is the definition the client was made from, so a cache that keys a read by
its request serializes the query with it (`serializeQuery(api.articles.definition, query)`), as
[`@nizam-os/tanstack-query-jsonapi`](../tanstack-query-jsonapi#readme) does for TanStack Query. The
paths come from the definitions' links; a definition's own origin, from an absolute `links.base`, is
ignored, so one set of definitions serves development, staging, and production.

The transport:

- `origin`: an absolute `http:` or `https:` URL with nothing after the host but `/`.
- `headers`: sent first on every request; a function is called on each, so a rotated token is
  current. A call's own `headers` come after it, and the client's `Accept` and `Content-Type` last.
- `language`: called on every request; a non-empty result is `Accept-Language`, so the server's
  error titles come back in the user's language. Without one, the runtime's own applies: a browser
  sends the user's languages, and Node's fetch sends `*`.
- `fetch`: by default the global `fetch`, looked up per request. Anything that answers a `Request`
  with an object holding `status`, `headers`, and `text()` will do.

A write's `attributes` are the server's validator input, required when it has a required member; its
`relationships` are the ones the definition's writable lists name, each an id, an identifier object,
or a record (only its `type` and `id` are sent), `null` to empty a to-one, and a list for a to-many.
`id` is accepted where the definition takes client ids. A create or an update the definition does
not serve takes no input at all. `setRelationship`, `addToRelationship`, and
`removeFromRelationship` take the relationships an update may carry, as the server refuses any other
with 403, and none where the definition serves no update.

The client checks what the types cannot: an id that is empty, `.`, or `..` throws `TypeError` before
sending, since the URL parser would drop it from the path; a 2xx that is not a JSON:API document, or
whose `data` is not what the call reads, throws `TypeError`; any other status rejects with
`ResponseError`; and a rejected `fetch`, a network failure or an abort, reaches the caller as it is.

## Queries

`list` takes a `ListQuery` and `get` and `related` a `GetQuery`, typed from the definitions.
`serializeQuery(definition, query)` writes the query string `parseQuery` reads on the server, for
code that sends its own requests:

```ts
import { Articles, People, Tags } from '@acme/api/definitions';

import { serializeQuery, type ListQuery } from '@nizam-os/jsonapi-client';

const definitions = { articles: Articles, people: People, tags: Tags };
type ArticleQuery = ListQuery<typeof definitions, typeof Articles>;

const query: ArticleQuery = {
  include: ['author'],
  fields: { articles: ['title', 'author'], people: ['name'] },
  sort: ['-createdAt', 'title'],
  filter: { title: { like: 'JSON%' }, author: { in: ['9', '12'] } },
  page: { size: 20 },
};

const response = await fetch(
  `https://api.example.com/articles?${serializeQuery(Articles, query)}`,
  {
    headers: { Accept: 'application/vnd.api+json' },
  },
);
// include=author&fields[articles]=title,author&fields[people]=name&sort=-createdAt,title
// &page[size]=20&filter[title][like]=JSON%&filter[author][in]=9&filter[author][in]=12
// (brackets, commas, and % percent-encoded on the wire)
```

| Member    | Takes                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `include` | the declared include paths                                                                                |
| `fields`  | by type, the fields a client reads, for the definition's type and each type its include paths reach       |
| `sort`    | the declared sort names, `-` for descending, applied in the order given                                   |
| `page`    | `size`, `after`, and `before` of the Cursor Pagination profile, on a definition that paginates            |
| `filter`  | by field, a bare value (`eq`) or values by declared operator, and `or` groups                             |
| `search`  | a string, on a definition with a search parameter, sent in that parameter                                 |
| `custom`  | the declared custom parameters by name, and a name with members (`highlight[fields]`), each value or list |

`GetQuery`, for one resource, takes `include` and `fields`. One query always gives one URL: the
members in the order above, each list in the order given.

### Filters

A field takes a bare value when it declares `eq`, otherwise values by operator. The conditions
outside `or` all hold; each group in `or` holds when any of its conditions does, and every group
must hold:

```ts
const recent: ArticleQuery = {
  filter: {
    createdAt: { gte: '2026-01-01' },
    or: [{ title: { like: 'JSON%' }, author: '9' }],
  },
};
// createdAt >= 2026-01-01 AND (title LIKE 'JSON%' OR author = 9)
```

A value is a string as it is, a number or a bigint by `String`, a boolean as `true` or `false`. A
list sends the parameter once per value, never joined, so a comma stays part of the value:
`{ name: 'Lovelace, Ada' }` matches that one name.

### What is checked where

The types restrict names: the include paths, sorts, filter fields and operators, fieldsets, and
custom parameters a definition declares; `page` only where it paginates, `search` only where it has
a search parameter, and `fields` only where it accepts them. `serializeQuery` throws `TypeError` for
what no parameter can carry: a `page.size` that is not a positive safe integer, a number that is not
finite, an empty list, and `page` or `search` on a definition without them. Values are the server's
to judge: a date it cannot read or a page size above its maximum is a 400 that names the parameter.

## Records

The calls read every document into records; `deserialize(document, { include })` does the same for
code that sends its own requests. A record is a plain object holding `type`, `id`, each attribute,
and each relationship, with the resource object's `links`, `meta`, and relationship objects as
`$links`, `$meta`, and `$relationships` (`$` is a character no member name may contain, so nothing
collides with them). A relationship on a path the request included is the included record, or
records in linkage order; every other one is its linkage, `{ type, id }`.

```ts
import { deserialize, type RecordOf } from '@nizam-os/jsonapi-client';

const { data, included, links, meta } = deserialize(await response.json(), {
  include: ['author'],
});
// data: [{ type: 'articles', id: '1', title: 'JSON:API', author: { type: 'people', id: '9', name: 'Ada', ... },
//          tags: [{ type: 'tags', id: 't1' }], $links: { self: '...' } }]

type Article = RecordOf<typeof definitions, typeof Articles, { include: ['author'] }>;
// author: the people record | null | undefined; tags: identifiers
```

Records follow the include paths only, so they form a tree: an article's author never points back at
the article object, and every result survives `JSON.stringify`, `structuredClone`, and a query
cache's structural sharing. A resource linked on an included path that the document leaves out is
left out (a to-one is `undefined`); its identifier stays in `$relationships`.

`RecordOf<TDefinitions, TDefinition, TQuery>` types a record as `deserialize` builds it: the
attributes as JSON (a `Date` arrives as a string), narrowed to `fields[type]`, each relationship
resolved or linkage as the query says. A query whose `include` or fieldset is a literal tuple says
what the response holds; one typed as a list (`ReadonlyArray<...>`) says only what it may hold, so
its relationships are a record or linkage and its fields optional. A related type no definition
passed has is `AnyRecord`, its fields `unknown`.

## Errors

A response that is not 2xx is a `ResponseError`: `status`, `errors` (the error document's error
objects, each with its own `code`; none when the body is not an error document, such as a proxy's
HTML page), `document`, and `headers` (`allow`, `retryAfter`). Its message names the resource type,
the call, and the status, never the URL or the body, so it is safe to log.

```ts
import { isResponseError } from '@nizam-os/jsonapi-client';

type AppCode = 'CONTACT_EMAIL_TAKEN' | 'QUOTA_EXCEEDED';

try {
  await save(contact);
} catch (error) {
  if (isResponseError<AppCode>(error, 'CONTACT_EMAIL_TAKEN')) {
    const field = error.errors[0]?.source?.pointer; // '/data/attributes/email'
  } else {
    throw error;
  }
}
```

`isResponseError(error, code)` is `true` for a `ResponseError` whose error objects carry `code`;
given the application's catalog as its type parameter, it refuses a code the catalog does not have.
It recognizes an error from another copy of the package, where `instanceof` would not.

## Pagination

`next(page)` and `prev(page)` fetch the page a list's `links.next` or `links.prev` names, as the
server wrote the link, and resolve its records along the `include` the link carries; each resolves
to `undefined` when the link is `null` or absent, which ends the list in that direction. A link is
followed only when it is absolute or starts with `/` and is on the transport's origin, so a response
cannot send the transport's headers to another host.

```ts
let page = await api.articles.list({ include: ['author'], page: { size: 20 } });
for (;;) {
  render(page.data);
  const following = await api.articles.next(page);
  if (following === undefined) break;
  page = following;
}
```

`pageCursors(page)` reads the cursors of a page's links: `next` is `page[after]` of `links.next` and
`prev` is `page[before]` of `links.prev`, each `undefined` when the link has none. An infinite list
keys each page by its cursor and lists with `page: { after }`:

```ts
import { pageCursors } from '@nizam-os/jsonapi-client';

const { next } = pageCursors(page);
if (next !== undefined) {
  await api.articles.list({ include: ['author'], page: { size: 20, after: next } });
}
```

`cursorOf(record)` reads a record's item cursor, the profile's `meta.page.cursor`, which a record
carries as `$meta.page.cursor`; list with `page: { after }` set to it to start after that record.

## Atomic Operations

Writes that must hold together go in one request through the
[Atomic Operations](https://jsonapi.org/ext/atomic/) extension, which the server commits all or not
at all. `operationsOf(definition)` builds each write as a value, each builder taking what the call
of its name takes, so a model that holds the definition builds them without a client;
`sendOperations(transport, operations)` sends them in one `POST` to the definitions' operations
path, `/operations` beside the collections:

```ts
import { operationsOf, sendOperations } from '@nizam-os/jsonapi-client';

const people = operationsOf(People);
const articles = operationsOf(Articles);

const { results } = await sendOperations(transport, [
  people.create({ lid: 'ada', attributes: { name: 'Ada' } }),
  articles.create({
    attributes: { title: 'Linked' },
    relationships: { author: { type: 'people', lid: 'ada' } },
  }),
  articles.addToRelationship('1', 'tags', ['t3']),
  articles.remove('3'),
]);
results[0].data?.id; // the id the server gave Ada
results[1].data?.author; // { type: 'people', id: that id }
results[3].data; // undefined: a removal's result holds no data
```

| Builder                                                                             | Sends                                                  | Result `data` |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------- |
| `create(input)`                                                                     | `add` of the resource object `create` sends, its `lid` | the record    |
| `update(id, input)`                                                                 | `update` of the resource object `update` sends         | the record    |
| `remove(id)`                                                                        | `remove` of the resource                               | `undefined`   |
| `setRelationship(id, name, linkage)`, `addToRelationship`, `removeFromRelationship` | `update`, `add`, `remove` of the relationship          | `undefined`   |

A `lid` names a resource the request creates, and a later operation links to it with `{ type, lid }`
wherever a relationship value goes; the server puts the id it gave in its place. `results` holds a
result per operation, in order: `{ data, meta }`, `data` the record of the operation's definition
(each relationship its linkage, since a results document includes nothing) or `undefined` where the
result holds none. For a list written in the call, `results` is a tuple, each result typed by its
operation. A `204` gives every result `{ data: undefined, meta: undefined }`.

A refusal rejects with a `ResponseError` whose message names the operations' types and `operations`,
and the server stored none of them. `operationOf(errorObject)` reads which operation an error points
at, `{ index, pointer }`, its `pointer` what a single call's refusal names; an error at no
operation, such as a request over the cap, gives `undefined`:

```ts
import { isResponseError, operationOf } from '@nizam-os/jsonapi-client';

try {
  await sendOperations(transport, operations);
} catch (error) {
  if (!isResponseError(error)) throw error;
  for (const object of error.errors) {
    const at = operationOf(object); // { index: 1, pointer: '/data/attributes/title' }
    if (at === undefined) showForRequest(object);
    else showForRow(rows[at.index], at.pointer, object);
  }
}
```

The client throws `TypeError` before sending for a transport `createTransport` did not make, an
empty list, a value that is not an operation (by its index), and operations whose definitions name
different operations paths, since one request reaches one endpoint. It does not count operations:
the definitions' `atomic.max` caps a request (10 unless the server's definitions say otherwise), the
server refuses a request over it with a 400, and a screen reads the cap from the definition
(`Articles.atomic.max`) to keep a selection within it.

## Best practices

- **Import the server's definitions; generate nothing.** A renamed attribute or a dropped sort then
  fails the client's `tsc`, not a request in production.
- **Create one transport per server, once,** and the clients beside it at module scope; give the
  transport the origin from configuration, never from a document.
- **Give `headers` a function for credentials,** so every request carries the current token.
- **Pass Paraglide's `getLocale` as `language`,** so titles and details come back in the user's
  language; branch on codes all the same.
- **Time a call out with its own signal,** `{ signal: AbortSignal.timeout(10_000) }`: a signal
  shared by every request would abort them all once it fires.
- **Pass literal queries to the calls.** A literal `include` or fieldset types the records exactly;
  a query held in a variable typed `ListQuery` makes every field optional.
- **Treat a write's `data === undefined` as the server's 202 or 204,** and read the resource again
  when you need what the server stored.
- **Pass every definition a response can hold.** The fields of an included type are typed by its
  definition; a type the client was not given takes any name.
- **Name each sort field once.** The server refuses a field sorted twice in one `sort`.
- **Keep cursors opaque.** Read them with `pageCursors` and `cursorOf` and send them back with the
  same `sort` and `filter`; never decode or build one.
- **Leave `page.size` out for the server's default,** and stay within the definition's `max`
  otherwise.
- **Use the URL as a cache key.** One query always serializes to one URL.
- **Pass the include paths you sent to `deserialize`.** The records resolve exactly those; a
  relationship off them is its linkage.
- **Branch on `code`, never on `title` or `detail`.** Titles and details are the server's text in
  the request's language; codes are its catalog, stable across languages.
- **Map `source.pointer` to a form field** (`/data/attributes/email` is `email`), and show anything
  without a pointer as a form-level error.
- **Read `retryAfter` before retrying** a 429 or a 503, and let every other `ResponseError` reach
  the caller.
- **Send writes that must hold together in one `sendOperations`,** never in a loop of calls: a loop
  that fails halfway leaves the writes before it stored.
- **Link what a request creates by its `lid`,** in the same request, rather than waiting for the
  server's id to send a second one.
- **Keep a selection within the definition's `atomic.max`** for a bulk action, and split work that
  need not commit together into requests of that size.
- **Map each error of a refusal with `operationOf`** to the operation, and so the row or the form,
  that sent it; show an error at no operation for the whole request.

## Documentation

- [`docs/jsonapi/SPEC.md`](https://github.com/nizam-os/kit/blob/main/docs/jsonapi/SPEC.md),
  sections 15 and 17: the client's contract, with the tests that prove it
- [ADR 0017](https://github.com/nizam-os/kit/blob/main/docs/jsonapi/adr/0017-a-typed-client-on-fetch-over-the-servers-definitions.md):
  a typed client on fetch over the server's definitions
- [ADR 0018](https://github.com/nizam-os/kit/blob/main/docs/jsonapi/adr/0018-definitions-carry-the-types-a-client-reads-and-writes.md):
  definitions carry the types a client reads and writes
- [ADR 0022](https://github.com/nizam-os/kit/blob/main/docs/jsonapi/adr/0022-atomic-operations-are-values-built-from-definitions-and-sent-in-one-request.md):
  Atomic Operations are values built from definitions and sent in one request
- [ADR 0023](https://github.com/nizam-os/kit/blob/main/docs/jsonapi/adr/0023-the-operations-endpoint-and-its-cap-are-the-definitions.md):
  the operations endpoint and its cap are the definitions'

## License

MIT
