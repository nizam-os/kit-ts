---
'@nizam-os/resource-core': minor
---

Add `isResourceBehavior`, true for exactly what `defineResource` returned and never for a copy, and
`scopeColumnOf`, the column a declaration scopes its table by, so a runtime can check both at boot.
