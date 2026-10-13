---
'@nizam-os/hono-ban': minor
'@nizam-os/hono-jsonapi': minor
'@nizam-os/hono-resource': minor
---

Requires `hono` 4.13.7 or later, the first release no published Hono advisory affects. 4.13.5 fixes
GHSA-crvj-82cr-hjcx (the query parser reads parameters after a URL fragment), GHSA-g6gw-c38x-mqfc
(unbounded dot-notation nesting in `parseBody()`), and GHSA-gqvv-2mrq-wpjv (`toSSG()` writes outside
its output directory); 4.13.7 fixes GHSA-hxh3-vqpv-xpqv (`hono/jsx` renders plain strings unescaped
in boundary components). None of these packages calls those helpers, but each runs on the
application's own Hono, so its peer range no longer admits an affected release.
