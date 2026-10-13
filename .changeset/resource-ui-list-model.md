---
'@nizam-os/resource-ui': minor
---

Add `resourceList(resource, messages)`, a framework-free model of a list screen whose state is the
client's list query: its `sort`, `filter`, `page`, and `search`, kept where the application keeps
it, such as a route's search. It gives TanStack Table v9 its sorting and column filters, the
declaration's default order when the state has no sort, and turns each change Table hands back,
updaters included, into the next state, starting over at the first page for every change but paging;
an input emptied to `undefined` or an empty list removes its filter. `next` and `previous` follow
the result's links, ending where the server has no further page. `query(search)` reads a route's
search back leniently, as JSON or as the API's own parameters, dropping each member the definition
refuses so a stale or edited link still opens the list, and keeping JSON in its own forms so a
router that validates its search after every navigation reads the same state. `columns` holds the
descriptors of the members a read returns. Table is not a peer: the model imports nothing of it.
`@nizam-os/jsonapi-core` is a dependency.
