---
'@nizam-os/drizzle-keyset': patch
---

A page reassigned in a loop, `page = await keyset.paginate(db, { page: { after: page.next } })`,
keeps its row type: `paginate` infers its selection from `options.select` only, never from the
variable the page is assigned to, so the default stays the table's row.
