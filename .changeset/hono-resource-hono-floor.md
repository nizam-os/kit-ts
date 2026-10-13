---
'@nizam-os/hono-resource': minor
---

Requires `hono` 4.13.0 or later. The operations endpoint decodes an operation's `href` with Hono's
own `tryDecodeURIComponent`, so it names what the application's router would, and `hono/utils/url`
exports that function from 4.13.0 on. On 4.12.34, which the peer range admitted, the package could
not load.
