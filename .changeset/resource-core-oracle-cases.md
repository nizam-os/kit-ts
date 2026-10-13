---
'@nizam-os/resource-core': minor
---

`oracleCases(resources, { storage })`, from the `testing` entry, lists what
`pg-catalog rules --check` writes into the database for a registry, and how it judges each write.

- Each member a client writes or reads tries its boundary fixtures in a copy of its column holding
  its NOT NULL and the CHECKs its schema enforces; the write schema and the database must agree, and
  every stored value must pass the read schema.
- Each validator tries its fixtures against the CHECK it stands for, once per CHECK: an `accept`
  fixture must be stored, and a `reject` fixture refused by that CHECK, not by the column's type.
- Each codec writes its fixtures through a storage codec over text and must read them back as
  themselves.
- A fixture is written as itself or not at all: one with no text form, one JSON would write as
  another value, or one its storage codec throws on is reported with the reason, never sent.
- The registry checks run first, so a registry mistake reads `oracleCases: ...`, and a codec without
  a storage codec throws a `TypeError` naming it.
