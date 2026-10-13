# ADR 0016: The seek leads with a range on the first key; declared nullability shapes seek and order

- Status: accepted; supersedes the clause of ADR 0008 that the seek does not consult nullability,
  and its `NULLS LAST` on every key; amended by ADR-0020 (a seek of two or more branches runs as one
  select per branch under `union all`, so an index bounds the scan inside a tie of the first key and
  after a value of a nullable one too)
- Date: 2026-10-11

## Context

ADR 0008's seek is a disjunction. After `(v, w)` on `(name, id)` it reads
`name > v or name is null or (name = v and id > w)`, and PostgreSQL starts a B-tree scan only from
conditions joined by `and`, never from one inside an `or`. In the stern application on PostgreSQL
14, with 20 000 contacts in one organization and an index on `(organization_id, name, id)`, the page
10 000 rows down read 10 101 index entries, every one before the cursor, in 3.8 ms; the same page
sorted by `-name` sorted all 20 000 rows of the organization, in 14.2 ms (issue #100). Use The
Index, Luke names the remedy: "we can add this redundant condition manually", a range on the first
key joined by `and`, which the index uses to start at the cursor while the disjunction still decides
the exact rows. The range is only correct where it holds every row the seek selects, and that
depends on where nulls are: after a value on a nullable key the seek also selects the nulls, which
`name >= v` excludes. @ref https://use-the-index-luke.com/sql/partial-results/fetch-next-page @ref
https://www.postgresql.org/docs/current/indexes-types.html#INDEXES-TYPES-BTREE

The order had the same problem from another side. Every key carried an explicit null placement, and
an index satisfies an `ORDER BY` only in the orders its declaration gives, forward or backward: "a
forward scan of an index on column `x` produces output satisfying `ORDER BY x` (or more verbosely,
`ORDER BY x ASC NULLS LAST`)", and backward `ORDER BY x DESC NULLS FIRST`. The planner does not
relax that for a `NOT NULL` column: on PostgreSQL 14,
`order by name desc nulls last, id asc nulls last` over a `NOT NULL` column ran a sequential scan
and a top-N sort with an index on `(name, id)` and with one on `(name desc, id)`, while
`order by name desc, id asc` ran a backward index-only scan of `(name, id)` with an incremental sort
of the ties (PostgreSQL 13 and later), or a forward scan of `(name desc, id)`. With a `limit`, "if
there is an index matching the `ORDER BY`, the first `n` rows can be retrieved directly, without
scanning the remainder at all". @ref https://www.postgresql.org/docs/current/indexes-ordering.html
@ref https://www.postgresql.org/docs/13/release-13.html ("Implement incremental sorting")

Both remedies need to know which keys can hold nulls. Definitions already declare it (`nullable`,
default `false`); `@nizam-os/resource-core` derives it from the catalog's `NOT NULL` constraints.

## Decision

- `PlanKey` carries the field's declared `nullable`.
- Over two or more keys, the seek is `range and disjunction` when the first key has a range, and the
  disjunction alone otherwise. After a value the range is `k >= v` (`k <= v` descending) on a key
  that is not nullable, and none on a nullable key; after a null it is `k is null`. Before a value
  it is `k <= v` (`k >= v` descending) on any key, since no null sorts before a value; before a null
  there is none. A single key's seek is its own range. `beyond` after a value adds `or k is null`
  only on a nullable key.
- The order places nulls on nullable keys only: `NULLS LAST` forward and `NULLS FIRST` on a backward
  page, as ADR 0008 states. A key that is not nullable has `nulls: null` and no placement, so
  PostgreSQL's default applies, which is the order an index declared without one has.
- The declaration is trusted and checked where a page can see it: `finishPage` throws a `TypeError`
  for a null sort value on a key that is not nullable, and the Kysely binding's typed definer
  requires `nullable: true` on a column whose type includes `null`.

## Consequences

An index on the sort columns in the sort's directions, followed by the key, serves every page from
its cursor: `(name, id)` for `name`; `(name desc, id)` for `-name`, or `(name, id)` read backward
with an incremental sort of the ties. A nullable column sorted descending needs `NULLS LAST` in the
index, `(nickname desc nulls last, id)`, because that is the order the query asks for. On stern the
pages 10 000 rows down now read 102 entries for `name` after and before the cursor and 103 for
`-name`, in 0.13 to 0.19 ms. A server-only e2e test reads the plans with `EXPLAIN (ANALYZE)` and
checks that a page halfway down 10 000 rows is an index scan whose index condition bounds the first
key and that it reads about one page of entries.

The range narrows the first key only. After a value on a nullable first key there is none, so those
pages still filter from the start of the list, and a first key with many equal values still filters
the entries of its tie that precede the cursor: on stern, `-createdAt` over 20 000 equal timestamps
read 10 101 entries at the same depth through `(organization_id, created_at desc, id)` (issue #101).
Sort by a `NOT NULL` column with few ties where depth matters, or by a generated column over
`coalesce`. A definition that declares a column not nullable while the table holds nulls in it now
throws on the first page that meets one, where it used to page them; that is a declaration error.
The SQL of every request changes (no placement on keys that are not nullable, the range added),
while for data that matches its declaration the rows, their order, and the cursors stay the same;
the cursor format and `CURSOR_VERSION` do not change.
