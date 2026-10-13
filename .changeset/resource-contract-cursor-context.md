---
'@nizam-os/resource-core': minor
---

The storage contract checks obligation 12: a cursor `list` issued in one scope is refused in another
with keyset-core's `INVALID_CURSOR`, reason `context`, though both scopes send the same request.
