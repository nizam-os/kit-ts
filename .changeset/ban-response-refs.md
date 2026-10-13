---
'@nizam-os/ban-core': minor
'@nizam-os/hono-ban': minor
---

`errorResponses` takes `responseRef`, where the document holds each entry's response, and then gives
a status that carries one entry as a Reference Object to that response instead of inlining it;
`errorResponseObjects` gives the responses to place there, for example in `components.responses`. A
document of many operations repeated the response of each 404 or 409 that carries one code on every
operation; it now holds each once. A status that combines entries, such as the 400 and the 500 under
`jsonApi({ mixedEntries: true })`, stays inline. Without `responseRef` the result keeps its type,
`Record<string, ResponseObject>`; with it, each value is a `ResponseObject` or a new
`ReferenceObject`. `ResponseObject` and `MediaTypeObject` are now object types, so a document
builder that types its components with specification extensions, such as `openapi3-ts`, accepts
them.
