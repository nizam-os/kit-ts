/**
 * The Atomic Operations endpoint (resource SPEC 19.4): `POST
 * <base>/operations`, the operations path of the resources' links, served
 * when a resource of the runtime declares `create`, `update`, or `remove`,
 * through `atomicOperations`, which takes the cap the resources' definitions
 * share. A request's operations run in one `runtime.transaction` as its
 * actor, so they commit together and the hook after commit runs once. Each
 * runs an operation of the transaction's domain: `add` is `create`, `update`
 * is `update`, `remove` is `remove`, and an `update` of a relationship is
 * `update` with that relationship alone, when it is `readWrite` and the
 * resource declares `update`. Every resource of the runtime has handlers, so
 * an operation its declaration lacks is the processor's 403, not a 404 for
 * its type. Like every route, the endpoint answers another method 405 before
 * the actor; `jsonApi()` must list the extension.
 * @ref https://jsonapi.org/ext/atomic/#processing ("all operations MUST be performed atomically")
 * @ref https://jsonapi.org/ext/atomic/#auto-id-updating-to-one-relationships
 * @packageDocumentation
 */
import type { Context, Env } from 'hono';

import type { AnyResource } from '@nizam-os/hono-jsonapi';
import type {
  RelationshipHandlers,
  ResourceHandlers,
} from '@nizam-os/hono-jsonapi/atomic';
import type { DeclaredResource } from '@nizam-os/resource-core';
import type { Domain, DomainShape } from '@nizam-os/resource-core/server';

import type { RouteContext } from './context';
import type { PathPlan } from './paths';
import type { Path } from './pointers';

import { atomicOperations } from '@nizam-os/hono-jsonapi/atomic';

import { notRun, resourceOperations } from './context';
import { hrefTargets } from './hrefs';
import { allow } from './methods';
import { OperationCalls } from './operation-calls';
import { notingFailedType } from './operation-type';
import { claimRoute } from './paths';
import { linkagePath, nowhere, objectPath } from './pointers';

/** What the operations of one request share: the transaction's domain, and their calls. */
interface OperationsTransaction {
  readonly domain: Domain;
  readonly calls: OperationCalls;
}

type Handlers<TEnv extends Env> = ResourceHandlers<
  AnyResource,
  OperationsTransaction,
  Context<TEnv>
>;

type Handler<
  TEnv extends Env,
  TName extends keyof Handlers<TEnv>,
> = NonNullable<Handlers<TEnv>[TName]>;

type RelationshipUpdate<TEnv extends Env> = NonNullable<
  RelationshipHandlers<OperationsTransaction, Context<TEnv>>['update']
>;

const WRITES: ReadonlySet<string> = new Set(['create', 'update', 'remove']);

/** Where operation `index` holds its resource object, or its linkage. */
function dataOf(index: number): Path {
  return ['atomic:operations', index, 'data'];
}

/** `add`: `declared`'s `create`. */
function createHandler<TEnv extends Env>(
  declared: DeclaredResource,
): Handler<TEnv, 'create'> {
  return async ({ data }, { tx, index }) =>
    tx.calls.run(
      index,
      (path) => objectPath(path, dataOf(index)),
      async () => {
        const { create } = resourceOperations(tx.domain, declared);
        if (create === undefined) {
          throw notRun(declared, 'create');
        }
        return create(data);
      },
    );
}

/** `update`: `declared`'s `update`. */
function updateHandler<TEnv extends Env>(
  declared: DeclaredResource,
): Handler<TEnv, 'update'> {
  return async ({ id, data }, { tx, index }) =>
    tx.calls.run(
      index,
      (path) => objectPath(path, dataOf(index)),
      async () => {
        const { update } = resourceOperations(tx.domain, declared);
        if (update === undefined) {
          throw notRun(declared, 'update');
        }
        return update(id, data);
      },
    );
}

/** `remove`: `declared`'s `remove`; the operation holds no resource object, so no item points into one. */
function removeHandler<TEnv extends Env>(
  declared: DeclaredResource,
): Handler<TEnv, 'remove'> {
  return async ({ id }, { tx, index }) =>
    tx.calls.run(index, nowhere, async () => {
      const { remove } = resourceOperations(tx.domain, declared);
      if (remove === undefined) {
        throw notRun(declared, 'remove');
      }
      await remove(id);
    });
}

/** `update` of relationship `name`: `declared`'s `update` with that relationship alone. */
function relationshipUpdate<TEnv extends Env>(
  declared: DeclaredResource,
  name: string,
): RelationshipUpdate<TEnv> {
  return async ({ id, data }, { tx, index }) => {
    await tx.calls.run(
      index,
      (path) => linkagePath(path, name, dataOf(index)),
      async () => {
        const { update } = resourceOperations(tx.domain, declared);
        if (update === undefined) {
          throw notRun(declared, 'update');
        }
        return update(id, { relationships: { [name]: data } });
      },
    );
  };
}

/** The handlers of `declared`'s writes, over the transaction's domain. */
function handlersOf<TEnv extends Env>(
  declared: DeclaredResource,
): Handlers<TEnv> {
  const { resource } = declared;
  const declares: ReadonlySet<string> = new Set(
    declared.declaration.operations,
  );
  const relationships = declares.has('update')
    ? Object.keys(resource.relationships).filter((name) =>
        resource.writable.update.has(name),
      )
    : [];
  return {
    resource,
    create: declares.has('create') ? createHandler(declared) : undefined,
    update: declares.has('update') ? updateHandler(declared) : undefined,
    remove: declares.has('remove') ? removeHandler(declared) : undefined,
    relationships: Object.fromEntries(
      relationships.map((name) => [
        name,
        { update: relationshipUpdate<TEnv>(declared, name) },
      ]),
    ),
  };
}

/**
 * Mounts the endpoint at the plan's operations path when a resource of
 * `plan` declares a write. Throws `TypeError` when a resource's route has
 * its path, and the processor's when the definitions' caps differ.
 */
export function operationsRoute<TEnv extends Env, TDomain extends DomainShape>(
  context: RouteContext<TEnv, TDomain>,
  plan: PathPlan,
): void {
  const writes = plan.resources.some(({ declared }) =>
    declared.declaration.operations.some((operation) => WRITES.has(operation)),
  );
  if (!writes) {
    return;
  }
  const path = plan.operations;
  claimRoute(plan, path);
  const { app, actors, methods, runtime } = context;
  const resolveHref = hrefTargets(plan, path);
  const handler = atomicOperations<OperationsTransaction, TEnv>({
    resources: plan.resources.map(({ declared }) => handlersOf<TEnv>(declared)),
    resolveHref,
    transaction: async (c, run) => {
      const calls = new OperationCalls();
      try {
        return await runtime.transaction(actors.of(c), async (domain) =>
          run({ domain, calls }),
        );
      } catch (error) {
        throw calls.settled(error);
      }
    },
  });
  const served: ReadonlySet<string> = new Set(
    plan.resources.map(({ declared }) => declared.names.type),
  );
  app.post(
    path,
    actors.resolve,
    notingFailedType(handler, resolveHref, served),
  );
  allow(methods, path, 'POST');
}
