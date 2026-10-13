/**
 * The reading operations (SPEC 18.4). `list` asks the policy, then pages
 * through the storage in the actor's scope. `get` reads the row, then asks
 * the policy with it, so a row the policy denies answers as a missing one
 * does (SPEC 12.2). `include` asks the policy for the relationship, then
 * reads the rows the given rows link to, each id once, in one statement,
 * in a transaction of its own; a linked row the actor cannot see is left
 * out, as a get of it would answer `NOT_FOUND`, which JSON:API allows,
 * since it requires every included resource to be linked from the primary
 * data but not every linked resource to be included.
 * @ref https://jsonapi.org/format/1.1/#document-compound-documents
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 * @packageDocumentation
 */
import type { DeclaredResource } from '@nizam-os/resource-core';
import type {
  DomainShape,
  ListOptions,
  PublicRow,
  ResourceBehavior,
  StorageListRequest,
  StoragePage,
} from '@nizam-os/resource-core/server';

import type { Run } from './operation';

import { ownValue } from '../internal/object';
import { knownId, notFound } from './input';
import { transact } from './operation';

/** A page of the resource's rows the actor may list. */
export async function listRows<TDomain extends DomainShape>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
  request: StorageListRequest = {},
  options: ListOptions = {},
): Promise<StoragePage> {
  const { storage, services } = run.options;
  return transact(
    run,
    behavior,
    'list',
    async (tx) => {
      await behavior.policy.authorize('list', { actor: run.actor, services });
      return storage.list(tx, behavior.resource, request, options);
    },
    options.parameters,
  );
}

/** The row whose id is `id`, when the actor may see it; `NOT_FOUND` otherwise. */
export async function getRow<TDomain extends DomainShape>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
  id: string,
): Promise<PublicRow> {
  const { storage, services } = run.options;
  const known = knownId(behavior.resource, id);
  return transact(run, behavior, 'get', async (tx) => {
    const row = await storage.get(tx, behavior.resource, known);
    if (row === undefined) {
      throw notFound();
    }
    await behavior.policy.authorize('get', {
      actor: run.actor,
      services,
      row,
    });
    return row;
  });
}

/** The behavior of the resource `relationship` links to, which boot requires of an includable one. */
function targetOf<TDomain extends DomainShape>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
  relationship: string,
): ResourceBehavior<TDomain> {
  const type = ownValue(behavior.resource.fields, relationship)?.target;
  const target =
    typeof type === 'string'
      ? ownValue(run.options.resources, type)
      : undefined;
  if (target === undefined) {
    throw new TypeError(
      `${behavior.resource.names.type}: the target of ${relationship} has no behavior in options.resources`,
    );
  }
  return target;
}

/** The distinct ids `rows` link to over `relationship` that are in the target key's form. */
function linkedIds(
  target: DeclaredResource,
  relationship: string,
  rows: ReadonlyArray<PublicRow>,
): ReadonlyArray<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = row[relationship];
    if (typeof id !== 'string') {
      continue;
    }
    const known = target.validate.id['~standard'].validate(id);
    if (known.issues === undefined) {
      ids.add(known.value);
    }
  }
  return [...ids];
}

/** The rows of the target that `rows` link to over `relationship`, once the policy allows including it. */
export async function includeRows<TDomain extends DomainShape>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
  relationship: string,
  rows: ReadonlyArray<PublicRow>,
): Promise<ReadonlyArray<PublicRow>> {
  const { storage, services } = run.options;
  await behavior.policy.authorizeInclude(relationship, {
    actor: run.actor,
    services,
  });
  const target = targetOf(run, behavior, relationship);
  const ids = linkedIds(target.resource, relationship, rows);
  if (ids.length === 0) {
    return [];
  }
  return transact(run, target, 'list', async (tx) =>
    storage.many(tx, target.resource, ids),
  );
}
