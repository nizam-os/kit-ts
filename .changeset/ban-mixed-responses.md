---
'@nizam-os/ban-core': minor
'@nizam-os/hono-ban': minor
---

`errorResponses` describes the documents a format that combines entries sends. With
`jsonApi({ mixedEntries: true })`, each status's response admits the error objects of every code a
body of that status may carry: its own codes, 400 also every client-error code once they span two
statuses, and 500 every code once a server error is among them, as `responseStatus` picks the status
of a combined document. Each object stays pinned to one entry's `status`, `code`, and `title`.
Before, the schemas rejected a document holding two codes of one status, such as an invalid and an
unknown query parameter, and a 400 holding a 403 object. `ErrorFormat` gains the optional
`mixedSchema(definitions, ctx)` that describes such documents, which the JSON:API format defines
when `mixedEntries` is on.
