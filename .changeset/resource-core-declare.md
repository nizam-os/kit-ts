---
'@nizam-os/resource-core': minor
---

First release of `@nizam-os/resource-core`, starting with the definer and the declaration.

- `createDeclareResource({ catalog, codecs, validators, scopes, domains, links, page })` binds a
  `declareResource(table, declaration)` to the public catalog `@nizam-os/pg-catalog` extracts and to
  the application's registries. It refuses the full catalog, since declarations reach browsers, and
  a catalog of another format.
- A declaration names its table, fields, relationships, constraints, codecs, validators, and scope
  by their database and registry names, and `tsc` checks each one at the option that holds it: an
  unknown name, an access the column or the operations do not allow, a column without a wire form
  and no codec, a foreign key that does not reference a public table's primary key, an id column
  that cannot carry a resource id, `clientIds` on a key that takes no client value, and a CHECK
  without a rule that a written column reaches and no validator covers.
- The same rules run when the module loads, so JavaScript callers get a `TypeError` whose message
  starts with the option's path.
- `declareResource` returns a frozen resource holding the table and a frozen copy of the
  declaration. Relationship targets are functions read lazily, so declarations may reference each
  other in either order and across modules.
