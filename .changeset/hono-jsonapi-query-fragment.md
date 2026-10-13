---
'@nizam-os/hono-jsonapi': patch
---

`queryValidator` reads the query only up to the URL's fragment, and none when a `#` comes before any
`?`. A literal `#` can reach the request URL (Node's HTTP server keeps it), and the parameters after
it, which a cache or a filter in front of the application never sees, were parsed and acted on: the
interpretation differential Hono fixed in its own query helpers in 4.13.5 (GHSA-crvj-82cr-hjcx).
