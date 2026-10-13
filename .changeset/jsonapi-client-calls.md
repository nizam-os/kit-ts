---
'@nizam-os/jsonapi-client': minor
---

Calls the server. `createTransport({ origin, headers, language, fetch })` names the server once and
what every request carries: `headers` and `language` are read per request, so a rotated token and a
changed locale (Paraglide's `getLocale`) apply to the next call.
`createClients(definitions, transport)` gives each definition a client with `list`, `get`, `create`,
`update`, `remove`, the relationship calls, and `next` and `prev`, its paths read from the
definitions' links. Every call is typed by the definitions: a literal query types the records
exactly, a write's attributes are the server's validator input, its relationships the writable ones,
and a client id is accepted only where the definition takes one. Each response is held to the call's
shape, so a result's type is true; an id no path can carry is refused before sending, and a page
link is followed only to the transport's origin.
