/**
 * The domain (SPEC 18.4): for an actor, one set of operations per
 * resource, keyed by its type, holding the operations its declaration
 * declares (SPEC 3.3), and `include` when it declares an includable
 * relationship. Each operation runs the lifecycle of SPEC 12.3 in one
 * transaction of the storage, scoped to every scope the actor has, so a
 * worker's call and a request take the same path; in a session of
 * `transaction(actor, work)`, each call runs as the session admits it, in
 * the session's transaction.
 * @packageDocumentation
 */
import type { Operation } from '@nizam-os/resource-core';
import type {
  DomainShape,
  ResourceBehavior,
  ResourceOperations,
} from '@nizam-os/resource-core/server';

import type { Run } from './operation';
import type { Session } from './session';
import type { DomainOptions } from './types';

import { storageConfigOf } from '../storage/registry';
import { getRow, includeRows, listRows } from './reads';
import { createRow, removeRow, updateRow } from './writes';

type Operations = {
  -readonly [K in keyof ResourceOperations]: ResourceOperations[K];
};

/** Runs one call of an operation: at once, or as the session of `run` admits it. */
type Call = <TResult>(operation: () => Promise<TResult>) => Promise<TResult>;

/** Each declared operation of `behavior`, run as the actor of `run`. */
function operationsOf<TDomain extends DomainShape>(
  run: Run<TDomain>,
  behavior: ResourceBehavior<TDomain>,
): ResourceOperations {
  const { declaration } = behavior.resource;
  const { session } = run;
  const call: Call = async (operation) =>
    session === undefined ? operation() : session.call(operation);
  const declared: ReadonlySet<Operation> = new Set(declaration.operations);
  const operations: Operations = {};
  if (declared.has('list')) {
    operations.list = async (request, options) =>
      call(async () => listRows(run, behavior, request, options));
  }
  if (declared.has('get')) {
    operations.get = async (id) => call(async () => getRow(run, behavior, id));
  }
  if (declared.has('create')) {
    operations.create = async (input) =>
      call(async () => createRow(run, behavior, input));
  }
  if (declared.has('update')) {
    operations.update = async (id, input) =>
      call(async () => updateRow(run, behavior, id, input));
  }
  if (declared.has('remove')) {
    operations.remove = async (id) =>
      call(async () => removeRow(run, behavior, id));
  }
  const includable = Object.values(declaration.relationships ?? {}).some(
    (relationship) => relationship.include === true,
  );
  if (includable) {
    operations.include = async (relationship, rows) =>
      call(async () => includeRows(run, behavior, relationship, rows));
  }
  return Object.freeze(operations);
}

/**
 * The domain of `options`: `as(actor)` gives each resource's operations as
 * `actor` runs them, and `as(actor, session)` as they run in the session
 * of `transaction(actor, work)`. Throws `TypeError` for a storage
 * `createKyselyStorage` did not make.
 */
export function createDomain<TDomain extends DomainShape>(
  options: DomainOptions<TDomain>,
): (
  actor: TDomain['actor'],
  session?: Session,
) => Readonly<Record<string, ResourceOperations>> {
  const config = storageConfigOf(options.storage);
  if (config === undefined) {
    throw new TypeError(
      'createResourceRuntime: options.storage must come from createKyselyStorage',
    );
  }
  return (actor, session) => {
    const run: Run<TDomain> = { options, config, actor, session };
    return Object.freeze(
      Object.fromEntries(
        Object.entries(options.resources).map(([type, behavior]) => [
          type,
          operationsOf(run, behavior),
        ]),
      ),
    );
  };
}
