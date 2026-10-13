---
'@nizam-os/jsonapi-core': patch
---

`paginationLinks` drops the request URL's fragment before deriving any link, so `self`, `first`,
`prev`, `next`, and `last` no longer carry it. A literal `#` can reach the request URL (Node's HTTP
server keeps it), and its text was echoed into every absolute link of a response that a cache keying
on the fragment-free URL would store and serve to everyone.
