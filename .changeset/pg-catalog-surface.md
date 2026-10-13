---
'@nizam-os/pg-catalog': minor
---

`surface` keeps a snapshot of your API's surface and fails CI when a change breaks a client.

- `pg-catalog surface` writes the surface of the declared resources, what their clients depend on,
  to the file `resources.surface` names, as JSON to commit next to the catalog.
- `pg-catalog surface --check` compares the committed file with the declarations, prints each change
  with the breaking ones first, and exits 1 on a breaking change or a missing file, 0 when every
  change is safe. It needs no database.
- The declared resources are configured under `resources`: `registry`, `storage` for
  `rules --check`, and `surface`. `defineExtraction` checks each.
- `writeSurface(config, { cwd })` and `checkSurface(config, { cwd })` return the reports, and
  `formatSurface(report, file)` the text. A committed file that is not JSON, or not a surface this
  version reads, fails with `surface_unreadable`.
