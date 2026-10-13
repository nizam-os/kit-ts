/**
 * What the property checks share: the resource under check with its
 * table and declaration, a stable print to compare values by, and where a
 * member's value comes from.
 * Not published with the package.
 * @packageDocumentation
 */
import type { PublicCatalog, PublicTable } from '@nizam-os/catalog-core';

import type { DeclaredResource } from '../../declare/declared-resource';
import type { ModelDeclaration, ModelMember } from './members';

/** One declared resource under check. */
export interface Subject {
  readonly catalog: PublicCatalog;
  readonly table: PublicTable;
  readonly resource: DeclaredResource;
  readonly declaration: ModelDeclaration;
  readonly domainCodes: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
}

/** JSON with object keys sorted, so equal values print equally. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).toSorted(([a], [b]) => a.localeCompare(b)),
        )
      : inner,
  );
}

/** The disagreement at `where`, when `received` prints otherwise than `expected`. */
export function differ(
  where: string,
  expected: unknown,
  received: unknown,
): Array<string> {
  return stable(expected) === stable(received)
    ? []
    : [`${where}: expected ${stable(expected)}, received ${stable(received)}`];
}

/** `values` sorted, since the SPEC orders none of the lists compared as sets. */
export const sorted = (values: Iterable<string>): Array<string> =>
  [...values].toSorted();

/** The table and column a member's value and limits come from: a relationship's are its target key's (SPEC 8). */
export function valueSource(
  { catalog, table }: Subject,
  member: ModelMember,
): readonly [PublicTable, string] {
  if (member.kind === 'field') {
    return [table, member.column];
  }
  const target = catalog.tables[member.target!]!;
  return [target, target.primaryKey![0]!];
}
