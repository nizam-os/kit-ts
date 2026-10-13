/**
 * A pager per binding (keyset SPEC 14.4): each shared keyset paginated
 * through `@nizam-os/kysely-keyset` over a harness's Kysely instance, and
 * through `@nizam-os/drizzle-keyset` over its Drizzle database, so a feature
 * file runs every expectation once per binding. Both select `id` and
 * `first_name`, so rows compare across bindings.
 */
import type {
  DrizzleKeyset,
  FieldsInit,
  KeysetRequestOf,
  Page,
  QueryEvent,
  RelationsInit,
} from '@nizam-os/drizzle-keyset';
import type { CursorContext, KyselyKeyset } from '@nizam-os/kysely-keyset';

import type { Harness } from './db.ts';

import { contacts as table } from './drizzle-schema.ts';
import {
  composite,
  contacts,
  drizzleKeysets,
  phrased,
  searchable,
} from './keysets.ts';

export interface Row {
  readonly id: string;
  readonly first_name: string;
}

/** The options both bindings take alike. */
interface PageOptions {
  readonly total?: boolean;
  readonly onQuery?: (event: QueryEvent) => void;
  readonly context?: CursorContext;
}

/** One keyset's page over a harness. */
export type Pager<TRequest> = (
  harness: Harness,
  request: TRequest,
  options?: PageOptions,
) => Promise<Page<Row>>;

/** A keyset's request, as `plan` and `paginate` take it. */
type RequestOf<TKeyset extends { plan: (request: never) => unknown }> =
  Parameters<TKeyset['plan']>[0];

export interface Binding {
  readonly name: string;
  readonly contacts: Pager<RequestOf<typeof contacts>>;
  readonly searchable: Pager<RequestOf<typeof searchable>>;
  readonly phrased: Pager<RequestOf<typeof phrased>>;
  readonly composite: Pager<RequestOf<typeof composite>>;
}

export function kyselyPager<
  TFields extends FieldsInit,
  TRelations extends RelationsInit,
>(
  keyset: KyselyKeyset<TFields, TRelations>,
): Pager<KeysetRequestOf<TFields, TRelations>> {
  return async (harness, request, options) =>
    keyset.paginate(
      harness.db.selectFrom('contacts').select(['id', 'first_name']),
      request,
      options,
    );
}

export function drizzlePager<
  TFields extends FieldsInit,
  TRelations extends RelationsInit,
>(
  keyset: DrizzleKeyset<TFields, TRelations>,
): Pager<KeysetRequestOf<TFields, TRelations>> {
  return async (harness, request, options) =>
    keyset.paginate(harness.drizzle, request, {
      ...options,
      select: { id: table.id, first_name: table.firstName },
    });
}

export const BINDINGS: ReadonlyArray<Binding> = [
  {
    name: 'Kysely',
    contacts: kyselyPager(contacts),
    searchable: kyselyPager(searchable),
    phrased: kyselyPager(phrased),
    composite: kyselyPager(composite),
  },
  {
    name: 'Drizzle',
    contacts: drizzlePager(drizzleKeysets.contacts),
    searchable: drizzlePager(drizzleKeysets.searchable),
    phrased: drizzlePager(drizzleKeysets.phrased),
    composite: drizzlePager(drizzleKeysets.composite),
  },
];
