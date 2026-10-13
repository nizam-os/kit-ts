---
'@nizam-os/kysely-resource': minor
---

`@nizam-os/resource-core` and `@nizam-os/keyset-core` are peer dependencies instead of dependencies.
The application declares its resources and behaviors and makes the keyset definer with its own
copies, and the runtime now works with those same copies, so ranges that cannot meet fail at install
instead of at boot, where a second copy of `@nizam-os/resource-core` refused every behavior, or on a
request, where a second copy of `@nizam-os/keyset-core` answered a refused cursor with 500. Install
both next to the runtime, as the README's install line already does.
