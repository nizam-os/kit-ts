/**
 * The rows of the runtime held in memory (`memory-runtime.ts`): new rows,
 * the members an input writes, the target lookup a runtime runs (SPEC
 * 12.3), the constraints a table checks, pages, and includes, each
 * settling after a turn of the microtask queue as a storage round trip
 * does. A constraint throws a `Violation`, which is not the client's
 * error until it is mapped, as a PostgreSQL violation is not (SPEC 18.5).
 * Not published with the package.
 */
import type { DeclaredResource } from '@nizam-os/resource-core';
import type {
  PublicRow,
  ResourceInput,
  StoragePage,
} from '@nizam-os/resource-core/server';

import { jsonApiError } from '@nizam-os/hono-jsonapi';

const PAGE_SIZE = 10;

/** The title a unique constraint holds taken. */
export const TAKEN_TITLE = 'Taken';

/** What a constraint throws: the path of the member it refused, which its client's error points at. */
class Violation extends Error {
  public readonly path: ReadonlyArray<string>;

  public constructor(path: ReadonlyArray<string>) {
    super('memory runtime: a constraint refused the row');
    this.path = path;
  }
}

/** Throws a `Violation` when row `id` would hold the taken title, or be its own parent. */
export function checkConstraints(id: string, input: ResourceInput): void {
  if (input.attributes?.['title'] === TAKEN_TITLE) {
    throw new Violation(['data', 'attributes', 'title']);
  }
  const parent = input.relationships?.['parent'];
  if (
    typeof parent === 'object' &&
    parent !== null &&
    'id' in parent &&
    parent.id === id
  ) {
    throw new Violation(['data', 'relationships', 'parent']);
  }
}

/** The client's error of `thrown`: a violation's 409 at its path, as a runtime maps one; anything else as thrown. */
export function clientError(thrown: unknown): unknown {
  return thrown instanceof Violation
    ? jsonApiError([
        {
          code: 'CONFLICT',
          status: 409,
          detail: 'A constraint refused the row',
          path: thrown.path,
        },
      ])
    : thrown;
}

/** The error of a row the actor does not see, as a runtime answers it. */
export function notFound(): Error {
  return jsonApiError('NOT_FOUND', { detail: 'The resource does not exist' });
}

/** Throws NOT_FOUND at the first relationship of `input` that links a row `rows` does not hold. */
export function checkTargets(
  rows: ReadonlyMap<string, ReadonlyMap<string, PublicRow>>,
  input: ResourceInput,
): void {
  for (const [name, linkage] of Object.entries(input.relationships ?? {})) {
    const missing =
      typeof linkage === 'object' &&
      linkage !== null &&
      'type' in linkage &&
      'id' in linkage &&
      rows.get(String(linkage.type))?.has(String(linkage.id)) !== true;
    if (missing) {
      throw jsonApiError([
        {
          code: 'NOT_FOUND',
          status: 404,
          detail: 'The related resource does not exist',
          path: ['data', 'relationships', name],
        },
      ]);
    }
  }
}

/** The members `input` writes, each relationship as its target's id. */
export function membersOf(input: ResourceInput): Record<string, unknown> {
  const relationships = Object.entries(input.relationships ?? {}).map(
    ([name, linkage]) =>
      [
        name,
        typeof linkage === 'object' && linkage !== null && 'id' in linkage
          ? linkage.id
          : null,
      ] as const,
  );
  return { ...input.attributes, ...Object.fromEntries(relationships) };
}

/** A new row of `declared`: every member `null` but those `input` writes. */
export function newRow(
  declared: DeclaredResource,
  id: string,
  input: ResourceInput,
): Record<string, unknown> {
  const { attributes, relationships } = declared.resource;
  const members = [...attributes, ...Object.keys(relationships)];
  return {
    ...Object.fromEntries(members.map((name) => [name, null])),
    ...membersOf(input),
    id,
  };
}

/**
 * `work`'s result once a turn of the microtask queue has passed, as a
 * storage round trip settles: a route that did not await an operation
 * would hold a pending promise.
 */
export async function roundTrip<TResult>(
  work: () => TResult,
): Promise<TResult> {
  await Promise.resolve();
  return work();
}

/** A page of every row in `rows`. */
export function pageOf(rows: Array<PublicRow>): StoragePage {
  return {
    rows,
    cursors: rows.map((row) => row.id),
    next: null,
    prev: null,
    hasNext: false,
    hasPrev: false,
    size: PAGE_SIZE,
    cursor: (row: PublicRow) => row.id,
  };
}

/** The rows `rows` link to over `relationship` in `targets`, each once. */
export function linkedRows(
  rows: ReadonlyArray<PublicRow>,
  relationship: string,
  targets: ReadonlyMap<string, PublicRow> | undefined,
): Array<PublicRow> {
  const ids = new Set(
    rows.flatMap((row) => {
      const id = row[relationship];
      return typeof id === 'string' ? [id] : [];
    }),
  );
  return [...ids].flatMap((id) => {
    const target = targets?.get(id);
    return target === undefined ? [] : [target];
  });
}
