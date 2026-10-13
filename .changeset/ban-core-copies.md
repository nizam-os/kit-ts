---
'@nizam-os/ban-core': minor
---

A `BanError` built by another copy of `@nizam-os/ban-core` is recognized: every error carries a brand
from the global symbol registry on its prototype, and `isBanError` and `instanceof BanError` accept
an error whose brand has the version this copy reads. A handler answers such an error with its own
status, code, detail, and items, where it answered 500 before, as happened when a package manager
installed a second copy for ranges that cannot meet. A subclass keeps the ordinary `instanceof`
check, and an error from a copy with another shape is still an unexpected failure.
