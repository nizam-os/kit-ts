/**
 * A runtime of the contract (resource SPEC 12.10) held in memory, for the
 * routes' tests: each declared operation over rows by type, as public
 * rows, scoped to the actor's workspace for a scoped resource, with every
 * call recorded, so a test reads what a route handed the runtime. `get`,
 * `update`, and `remove` of a row the actor does not see answer
 * NOT_FOUND, as a runtime does, and so does a write that links a row
 * that does not exist, at `/data/relationships/<name>`, as a runtime's
 * target lookup answers (SPEC 12.3); an include of workspaces by an actor
 * without `workspaces:read` answers FORBIDDEN, as a policy would. A page
 * holds every row the actor sees, in insertion order, and has no other
 * page. A constraint's violation is the client's error once mapped: at
 * once for an operation of `as(actor)`, and once the transaction ended
 * inside one. `transaction` keeps the contract's rules: the first failure
 * ends it, every row returns to what it held when an operation failed or
 * `work` rejected, and it rejects with the failure, mapped, unless `work`
 * rejected with another value. Not published with the package.
 */
import type { DeclaredResource } from '@nizam-os/resource-core';
import type {
  Actor,
  Domain,
  PublicRow,
  ResourceOperations,
  ResourceRuntime,
} from '@nizam-os/resource-core/server';

import { jsonApiError } from '@nizam-os/hono-jsonapi';

import {
  checkConstraints,
  checkTargets,
  clientError,
  linkedRows,
  membersOf,
  newRow,
  notFound,
  pageOf,
  roundTrip,
} from './memory-rows';

export type Permission = 'tasks:read' | 'tasks:write' | 'workspaces:read';

/** A member of one workspace. */
export interface Member extends Actor<Permission> {
  readonly workspace: string;
}

/** The domain of the tests. */
export interface TestDomain {
  readonly actor: Member;
  readonly permissions: Permission;
  readonly quotas: never;
  readonly services: undefined;
  readonly errors: Readonly<Record<string, never>>;
}

/** One call a route made: the resource's type, the operation, its arguments, and the actor. */
interface Call {
  readonly type: string;
  readonly operation: string;
  readonly args: ReadonlyArray<unknown>;
  readonly actor: Member;
}

/** The runtime, its rows by type and id, and every call made to it. */
export interface MemoryRuntime extends ResourceRuntime<TestDomain> {
  readonly rows: ReadonlyMap<string, Map<string, PublicRow>>;
  readonly calls: Array<Call>;
}

type Operations = {
  -readonly [K in keyof ResourceOperations]: ResourceOperations[K];
};

/** Runs one call of an operation: at once, or as a transaction admits it. */
type Admit = <TResult>(operation: () => Promise<TResult>) => Promise<TResult>;

/** The scope's member on a row of a scoped resource: the workspace it belongs to. */
const SCOPE = 'workspace';

const direct: Admit = async (operation) => {
  try {
    return await operation();
  } catch (thrown) {
    throw clientError(thrown);
  }
};

/** A member of `workspace` holding `permissions`. */
export function member(
  id: string,
  workspace: string,
  permissions: ReadonlyArray<Permission>,
): Member {
  const held: ReadonlySet<string> = new Set(permissions);
  return { id, workspace, can: (permission) => held.has(permission) };
}

/** Each declared operation of `declared` over `state`, as `actor` runs it, each call run by `call`. */
function operationsOf(
  state: MemoryRuntime,
  declared: DeclaredResource,
  actor: Member,
  call: Admit,
): ResourceOperations {
  const type = declared.names.type;
  const trip = async <TResult>(work: () => TResult): Promise<TResult> =>
    call(async () => roundTrip(work));
  const rows = state.rows.get(type) ?? new Map<string, PublicRow>();
  const scoped = declared.declaration.scope !== undefined;
  const visible = (row: PublicRow): boolean =>
    !scoped || row[SCOPE] === actor.workspace;
  const record = (operation: string, args: ReadonlyArray<unknown>): void => {
    state.calls.push({ type, operation, args, actor });
  };
  const find = (id: string): PublicRow => {
    const row = rows.get(id);
    if (row === undefined || !visible(row)) {
      throw notFound();
    }
    return row;
  };
  const declaredOperations: ReadonlySet<string> = new Set(
    declared.declaration.operations,
  );
  const operations: Operations = {};
  if (declaredOperations.has('list')) {
    operations.list = async (request, options) =>
      trip(() => {
        record('list', [request, options]);
        return pageOf([...rows.values()].filter((row) => visible(row)));
      });
  }
  if (declaredOperations.has('get')) {
    operations.get = async (id) =>
      trip(() => {
        record('get', [id]);
        return find(id);
      });
  }
  if (declaredOperations.has('create')) {
    operations.create = async (input) =>
      trip(() => {
        record('create', [input]);
        checkTargets(state.rows, input);
        const id = input.id ?? crypto.randomUUID();
        checkConstraints(id, input);
        const row = {
          ...newRow(declared, id, input),
          ...(scoped ? { [SCOPE]: actor.workspace } : {}),
          id,
        };
        rows.set(id, row);
        return row;
      });
  }
  if (declaredOperations.has('update')) {
    operations.update = async (id, input) =>
      trip(() => {
        record('update', [id, input]);
        checkTargets(state.rows, input);
        const row = { ...find(id), ...membersOf(input), id };
        checkConstraints(id, input);
        rows.set(id, row);
        return row;
      });
  }
  if (declaredOperations.has('remove')) {
    operations.remove = async (id) =>
      trip(() => {
        record('remove', [id]);
        find(id);
        rows.delete(id);
      });
  }
  if (declared.resource.query.include.length > 0) {
    operations.include = async (relationship, linked) =>
      trip(() => {
        record('include', [relationship, linked]);
        const target = declared.resource.relationships[relationship]?.type;
        if (target === 'workspaces' && !actor.can('workspaces:read')) {
          throw jsonApiError('FORBIDDEN', {
            detail: 'The actor may not read the workspace',
          });
        }
        return linkedRows(
          linked,
          relationship,
          target === undefined ? undefined : state.rows.get(target),
        );
      });
  }
  return Object.freeze(operations);
}

/** Every row of `rows` back to what `snapshot` holds, in the same maps the operations hold. */
function restore(
  rows: ReadonlyMap<string, Map<string, PublicRow>>,
  snapshot: ReadonlyMap<string, ReadonlyMap<string, PublicRow>>,
): void {
  for (const [type, held] of snapshot) {
    const live = rows.get(type);
    live?.clear();
    for (const [id, row] of held) {
      live?.set(id, row);
    }
  }
}

/** `transaction(actor, work)` over `state`, with the domain `domainOf` makes for a call. */
async function transactionOf<TResult>(
  state: MemoryRuntime,
  domainOf: (call: Admit) => Domain,
  work: (domain: Domain) => Promise<TResult>,
): Promise<TResult> {
  const snapshot = new Map(
    [...state.rows].map(([type, rows]) => [type, new Map(rows)] as const),
  );
  const failures: Array<unknown> = [];
  const call: Admit = async (operation) => {
    if (failures.length > 0) {
      throw new TypeError(
        'transaction: an operation was called after an earlier one failed, which ended the transaction',
      );
    }
    try {
      return await operation();
    } catch (error) {
      failures.push(error);
      throw error;
    }
  };
  try {
    const value = await work(domainOf(call));
    if (failures.length === 0) {
      return value;
    }
    throw failures[0];
  } catch (error) {
    restore(state.rows, snapshot);
    throw error === failures[0] ? clientError(error) : error;
  }
}

/** A runtime of `resources` over `seed`, the rows of each type, by type. */
export function memoryRuntime(
  resources: ReadonlyArray<DeclaredResource>,
  seed: Readonly<Record<string, ReadonlyArray<PublicRow>>> = {},
): MemoryRuntime {
  const rows = new Map(
    resources.map((declared) => {
      const type = declared.names.type;
      const seeded = Object.hasOwn(seed, type) ? seed[type] : undefined;
      return [
        type,
        new Map((seeded ?? []).map((row) => [row.id, row] as const)),
      ] as const;
    }),
  );
  const domainOf = (actor: Member, call: Admit): Domain =>
    Object.freeze(
      Object.fromEntries(
        resources.map((declared) => [
          declared.names.type,
          operationsOf(state, declared, actor, call),
        ]),
      ),
    );
  const state: MemoryRuntime = {
    warnings: [],
    resources,
    rows,
    calls: [],
    as: (actor) => domainOf(actor, direct),
    transaction: async (actor, work) =>
      transactionOf(state, (call) => domainOf(actor, call), work),
  };
  return state;
}
