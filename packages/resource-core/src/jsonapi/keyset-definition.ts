/**
 * A declared resource's keyset definition (SPEC 11.2): the
 * `@nizam-os/keyset-core` `DefaultedKeysetInit` of its list, everything but
 * the cursor, whose secret is server configuration, so the server passes
 * it to its own `createDefineKeyset({ cursor })`. Fields are keyed by
 * public name, the vocabulary of the JSON:API definition beside it
 * (`resource-definition.ts`), so a filter or a sort jsonapi-core accepts
 * names a field keyset-core plans. Every option is spelled out: keyset-core
 * reads an absent `operators` as every operator of the type, and a server's
 * keyset definer would fill an absent page bound with its own default.
 * @ref https://github.com/nizam-os/kit-ts/blob/main/docs/keyset/SPEC.md (sections 3, 3.4, and 3.6)
 * @packageDocumentation
 */
import type {
  ColumnFieldInit,
  DefaultedKeysetInit,
  SortInput,
} from '@nizam-os/keyset-core';

import type { KeysetMember, KeysetMembers } from '../declare/check-filters';
import type { ResolvedSearch } from '../declare/check-options';
import type { ResolvedPage } from '../declare/check-page';

/** What a keyset definition is derived from: what the declaration's checks resolved. */
export interface KeysetSource {
  /** The table's name, unqualified: how a query from `schema.table` exposes it. */
  readonly table: string;
  readonly members: KeysetMembers;
  readonly search: ResolvedSearch | undefined;
  /** `sort.default` by public name, as `checkSort` resolved it. */
  readonly sort: ReadonlyArray<SortInput> | undefined;
  readonly page: ResolvedPage;
}

/** The field init of a member, frozen: its column, keyset type, nullability, and the options its declaration gives. */
function fieldInit(member: KeysetMember): ColumnFieldInit {
  const { keyset } = member;
  return Object.freeze({
    column: member.spec.column,
    ...keyset,
    ...('values' in keyset
      ? { values: Object.freeze([...keyset.values]) }
      : {}),
    nullable: member.spec.nullable,
    sortable: member.sortable,
    operators: Object.freeze([...member.operators]),
  });
}

/** `sort.default`, frozen with each of its entries. */
function frozenSort(sort: ReadonlyArray<SortInput>): ReadonlyArray<SortInput> {
  return Object.freeze(
    sort.map((entry) =>
      typeof entry === 'string' ? entry : Object.freeze({ ...entry }),
    ),
  );
}

/**
 * The keyset definition of a declaration that passed every check, frozen
 * throughout like the resource's other members: every request of every
 * server shares it.
 */
export function keysetDefinition(source: KeysetSource): DefaultedKeysetInit {
  const { members, search, sort } = source;
  return Object.freeze({
    table: source.table,
    key: Object.freeze(['id']),
    fields: Object.freeze(
      Object.fromEntries(
        [members.id, ...members.members].map((member) => [
          member.spec.name,
          fieldInit(member),
        ]),
      ),
    ),
    ...(search === undefined ? {} : { search: Object.freeze({ ...search }) }),
    ...(sort === undefined
      ? {}
      : { sort: Object.freeze({ default: frozenSort(sort) }) }),
    page: Object.freeze({ ...source.page }),
  });
}
