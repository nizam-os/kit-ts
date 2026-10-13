---
'@nizam-os/ban-core': minor
'@nizam-os/hono-ban': minor
---

`errorResponses` takes `objectRef`, where the document holds each entry's error object, and then
references the objects instead of inlining them; `errorObjectSchemas` gives the objects to place
there, for example in `components.schemas`. Under `jsonApi({ mixedEntries: true })` the 400 and 500
responses of each operation carry the objects of most of its codes, so an OpenAPI document of many
operations repeated every object many times; it now holds each once. `ErrorFormat` gains the
optional `objectSchema(definition, ctx)` beside `mixedSchema`, which the JSON:API format defines
when `mixedEntries` is on, and `SchemaContext` the optional `objectRef`. A response description
names a description several entries share once, where it repeated it before.
