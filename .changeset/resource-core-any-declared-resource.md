---
'@nizam-os/resource-core': minor
---

`Infer`, `ErrorCatalog`, and `errorCatalog` constrain their resources by the new
`AnyDeclaredResource` type, the members every declared resource records, instead of the wide
`DeclaredResource`. TypeScript checks a type argument's constraint with error reporting on, and
against the wide type it recomputed a failed check of the definer context on every reference. On a
111-table schema, 20 `Infer<typeof X>` aliases took 1.05 s and 577 MB instead of 0.19 s and 130 MB,
and an exported `ErrorCatalog<...>` annotation took 5.4 s and 2.4 GB instead of 0.32 s. Constrain
your own type helpers by `AnyDeclaredResource` too.
