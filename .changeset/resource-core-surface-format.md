---
'@nizam-os/resource-core': minor
---

A committed surface can be read back safely.

- `surfaceOf` writes the surface's `format` (`SURFACE_FORMAT`, 1) first, raised whenever the surface
  changes shape.
- `parseSurface(value)` reads a surface back from JSON and throws a `TypeError` naming the first
  member that is wrong, or a format it does not read, so a hand edit or an old snapshot fails
  clearly instead of misleading `diffSurfaces`.
