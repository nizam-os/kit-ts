---
'@nizam-os/jsonapi-core': minor
---

First release: JSON:API 1.1 for any JavaScript runtime, framework-free.

- `defineResource` declares a resource's type, fields, relationships, links, query capabilities, and
  Standard Schema validators once; every parser and builder reads from it. `links: { base }` derives
  `self` and the relationship links by the recommended URL design, and `createDefineResource` states
  such defaults once for every definition.
- `resourceDocument`, `collectionDocument`, `toOneRelationshipDocument`,
  `toManyRelationshipDocument`, and `include` build documents with sparse fieldsets applied and full
  linkage enforced.
- `parseQuery` parses `include`, `fields`, `sort`, `page`, `filter`, a search parameter, and
  declared custom parameters, reporting every problem in one 400.
- `paginatedDocument` and `paginationLinks` implement the Cursor Pagination profile.
- `parseCreateDocument`, `parseUpdateDocument`, and the relationship document parsers check request
  documents against the definition with RFC 6901 pointers on every error.
- `negotiate` applies the server content negotiation rules (415, 406) over two header values.
- Errors are [@nizam-os/ban-core](https://github.com/nizam-os/kit) errors: `jsonApiError` builds
  one from a closed catalog (`ERROR_CATALOG` over @nizam-os/ban-core's built-ins), `errorItem` one
  object of a list, and `errorDocument` the document; an application spreads the catalog into its
  own `createBan`.
- `@nizam-os/jsonapi-core/atomic` implements the Atomic Operations extension as
  `operationsProcessor`, with a caller-owned transaction, local ids across operations, and a
  host-supplied context for handlers.
