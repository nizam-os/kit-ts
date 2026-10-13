---
'@nizam-os/resource-ui': patch
---

`resourceList`'s `query(search)` names every member of the list query, `undefined` where the state
holds none. TanStack Router hands a route the URL's search with the validated one spread over it, so
a member `query` dropped, such as a sort the definition refuses, still reached the request and the
server refused it with a 400; the URL's `include` and `fields` reached the request too.
