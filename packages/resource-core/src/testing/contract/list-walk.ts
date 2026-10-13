/**
 * Paging through `list` for the list cases (SPEC 12.8, obligation 5): a
 * page listed in a transaction of its own, whose rejection fails the case
 * with the error as its cause, and a walk over every page of a request,
 * forward with `next` from the first page and back with `prev` from the
 * last, which must give the same pages.
 * @ref https://jsonapi.org/profiles/ethanresnick/cursor-pagination/#auto-id-links (prev and next, null when no page)
 * @packageDocumentation
 */
import type { PageInput } from '@nizam-os/keyset-core';

import type { DeclaredResource } from '../../declare/declared-resource';
import type {
  PublicRow,
  StorageListRequest,
  StoragePage,
} from '../../server/storage';
import type { Contract } from './context';

import { assertEqual, assertThat, ContractFailure } from './assert';

/** The page size of a walk, below the rows of every walk the cases take, so each crosses pages. */
const WALK_SIZE = 2;
/** More pages than any walk of the cases has, so a `next` or a `prev` that never ends fails instead of hanging. */
const MAX_PAGES = 8;

/** What a case lists: the actor's workspace, the resource, and what a row shows as in a failure. */
export interface Listing<TTransaction> {
  readonly contract: Contract<TTransaction>;
  readonly workspace: string;
  readonly resource: DeclaredResource;
  readonly label: (row: PublicRow) => unknown;
}

/** Tasks as an actor of workspace 1 lists them, each shown by its title. */
export function taskListing<TTransaction>(
  contract: Contract<TTransaction>,
): Listing<TTransaction> {
  return {
    contract,
    workspace: '1',
    resource: contract.tasks,
    label: (row) => row['title'],
  };
}

/** Logs, which no scope holds, each shown by its key. */
export function logListing<TTransaction>(
  contract: Contract<TTransaction>,
): Listing<TTransaction> {
  return {
    contract,
    workspace: '1',
    resource: contract.logs,
    label: (row) => row.id,
  };
}

/** A page of `request`, in a transaction of its own; a rejection fails the case as `what`. */
export async function listPage<TTransaction>(
  listing: Listing<TTransaction>,
  request: StorageListRequest,
  what: string,
): Promise<StoragePage> {
  const { contract, workspace, resource } = listing;
  try {
    return await contract.within(workspace, async (tx) =>
      contract.harness.adapter.list(tx, resource, request),
    );
  } catch (error) {
    throw new ContractFailure(`${what}: list rejected`, { cause: error });
  }
}

/** `cursor`, which must name a page. */
export function present(cursor: string | null, what: string): string {
  assertThat(cursor !== null, `${what}: expected a cursor, got null`);
  return cursor ?? '';
}

/** The `code` of a keyset-core error, read by property, so it names the error whatever copy of the package threw it. */
export function keysetCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null
    ? Reflect.get(error, 'code')
    : undefined;
}

/** The `reason` of a keyset-core `INVALID_CURSOR`, read by property as `keysetCode` reads the code. */
export function keysetReason(error: unknown): unknown {
  return typeof error === 'object' && error !== null
    ? Reflect.get(error, 'reason')
    : undefined;
}

/** The labels of a page's rows. */
export function labels<TTransaction>(
  listing: Listing<TTransaction>,
  page: StoragePage,
): ReadonlyArray<unknown> {
  return page.rows.map((row) => listing.label(row));
}

/**
 * The labels of every row `request` lists, page by page from the first
 * page with `next`; walked back from the last page with `prev`, the pages
 * must be the same.
 */
export async function walk<TTransaction>(
  listing: Listing<TTransaction>,
  request: StorageListRequest,
  what: string,
): Promise<ReadonlyArray<unknown>> {
  const at = async (page: PageInput): Promise<StoragePage> =>
    listPage(listing, { ...request, page: { size: WALK_SIZE, ...page } }, what);
  let page = await at({});
  assertEqual(page.prev, null, `${what}: prev of the first page`);
  const forward = [page];
  while (page.next !== null) {
    assertThat(
      forward.length < MAX_PAGES,
      `${what}: next still names a page after ${String(MAX_PAGES)} pages`,
    );
    page = await at({ after: page.next });
    forward.push(page);
  }
  const back = [page];
  while (page.prev !== null) {
    assertThat(
      back.length < MAX_PAGES,
      `${what}: prev still names a page after ${String(MAX_PAGES)} pages`,
    );
    page = await at({ before: page.prev });
    back.push(page);
  }
  const pages = forward.map((each) => labels(listing, each));
  assertEqual(
    back.toReversed().map((each) => labels(listing, each)),
    pages,
    `${what}: the pages walked back with prev`,
  );
  for (const each of forward) {
    assertEqual(
      each.cursors.length,
      each.rows.length,
      `${what}: cursors of a page`,
    );
  }
  return pages.flat();
}
