---
'@nizam-os/pg-catalog': minor
---

Generated catalog modules now type their binding with a named interface:
`export interface ExtractedCatalog extends Readonly<typeof value> {}` and
`export const catalog: ExtractedCatalog = value;`, with `ExtractedPublicCatalog` for
`publicCatalog`. TypeScript prints an interface by its name, so a compile error in code typed by the
catalog reads `DeclareContext<ContactsPublicCatalog, ...>` instead of a dump of the catalog cut
short, and checks far faster: 76 such errors on a schema of 115 tables went from 13.4 s and 5.8 GB
to 0.5 s and 182 MB.

- `out.catalog` takes `{ file, interface }` and `out.public` takes `interface`, to name the
  interfaces after the application. `defineExtraction` refuses a name that is not an ASCII
  identifier starting with an uppercase letter, and one that both modules share.
- `renderCatalogModule` and `renderPublicCatalogModule` take `{ interface }` as a second argument.
- `parseCatalogModule` reads modules of both shapes. Run `pg-catalog extract` once after upgrading:
  `extract --check` reports the committed modules as stale until then.
