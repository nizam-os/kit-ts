/**
 * The domain the lifecycle tests run (resource SPEC 12, 18.4), over the
 * storage contract's schema with an outbox: tasks, scoped to a workspace,
 * that include their parent and their workspace; workspaces, unscoped; and
 * the partitioned logs. A member of a workspace holds permissions; the
 * services hold the tasks quota's limit; each write of a task has a rule
 * and records an event, and a create supplies the server value
 * `created_by` from the actor. The declarations are typed, as an
 * application's are; what this module exports is typed wide.
 */
import type {
  Actor,
  Quota,
  QuotaContext,
  ResourceBehavior,
  ResourceOperations,
} from '@nizam-os/resource-core/server';

import type { DomainOptions } from '../runtime/types';
import type { KyselyStorage } from '../storage/types';

import { z } from 'zod';

import { createDeclareResource } from '@nizam-os/resource-core';
import {
  createDomainDefiners,
  defineEvent,
  defineQuota,
} from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { createDomain } from '../runtime/domain';

export type Permission = 'tasks:read' | 'tasks:write' | 'workspaces:read';

/** A member of one workspace. */
export interface Member extends Actor<Permission> {
  readonly workspace: string;
}

interface Services {
  /** The most tasks one workspace may hold. */
  readonly taskLimit: number;
}

const APP_ERRORS = {
  TASK_LOCKED: { status: 409, title: 'Task Locked' },
} as const;

const QUOTAS: {
  readonly tasks: Quota<QuotaContext<Member, Services>>;
} = {
  tasks: defineQuota({
    limit: ({ services }: QuotaContext<Member, Services>) => services.taskLimit,
  }),
};

/** The test application's domain, as its definers read it. */
export interface TestDomain {
  readonly actor: Member;
  readonly permissions: Permission;
  readonly quotas: keyof typeof QUOTAS;
  readonly services: Services;
  readonly errors: typeof APP_ERRORS;
}

export const MEMBER_ID = '00000000-0000-4000-8000-0000000000aa';
const EVERYTHING: ReadonlyArray<Permission> = [
  'tasks:read',
  'tasks:write',
  'workspaces:read',
];

/** A member of `workspace` holding `permissions`, every one by default. */
export function member(
  workspace: string,
  permissions: ReadonlyArray<Permission> = EVERYTHING,
): Member {
  const granted: ReadonlySet<string> = new Set(permissions);
  return {
    id: MEMBER_ID,
    workspace,
    can: (permission) => granted.has(permission),
  };
}

const declareResource = createDeclareResource({
  catalog: contractFixture.catalog,
  codecs: contractFixture.codecs,
  scopes: { workspace: { column: 'workspace_id' } },
});

const Workspaces = declareResource('workspaces', {
  operations: ['get', 'create'],
  fields: { name: { access: 'readWrite' }, created_in: { access: 'read' } },
});

const Tasks = declareResource('tasks', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'workspace',
  clientIds: true,
  fields: {
    title: { access: 'readWrite', filter: ['eq'], sort: true },
    done: { access: 'readWrite' },
    points: { access: 'readWrite' },
    created_by: { access: 'read' },
  },
  relationships: {
    workspace_id: { target: () => Workspaces, access: 'read', include: true },
    parent_id: { target: () => Tasks, access: 'readWrite', include: true },
  },
  page: { default: 2, max: 3 },
});

const { logs } = contractFixture.resources;

const TaskCreated = defineEvent(
  'task.created',
  1,
  z.object({ id: z.string(), title: z.string() }),
);
const TaskRenamed = defineEvent(
  'task.renamed',
  1,
  z.object({ id: z.string(), from: z.string(), to: z.string() }),
);
const TaskRemoved = defineEvent(
  'task.removed',
  1,
  z.object({ id: z.string() }),
);

const { definePolicy, defineResource } = createDomainDefiners<TestDomain>();

/** The title a task's rules refuse to create, rename, or remove. */
export const LOCKED = 'Locked';
/** The title of a task the policy hides from a get. */
export const HIDDEN = 'Hidden';

const TasksBehavior = defineResource(Tasks, {
  policy: definePolicy(Tasks, {
    list: ({ actor }) => actor.can('tasks:read'),
    get: ({ actor, row }) => actor.can('tasks:read') && row.title !== HIDDEN,
    create: ({ actor }) => actor.can('tasks:write'),
    update: ({ actor }) => actor.can('tasks:write'),
    remove: ({ actor }) => actor.can('tasks:write'),
    include: {
      parent: ({ actor }) => actor.can('tasks:read'),
      workspace: ({ actor }) => actor.can('workspaces:read'),
    },
  }),
  operations: {
    create: {
      values: ({ actor }) => ({ created_by: actor.id }),
      quota: 'tasks',
      rules: [
        ({ input, reject }) => {
          if (input.attributes.title === LOCKED) {
            reject('TASK_LOCKED', {
              fields: ['title'],
              detail: 'The title is locked.',
            });
          }
        },
      ],
      effects: [
        ({ row }) => [TaskCreated.of({ id: row.id, title: row.title })],
      ],
    },
    update: {
      rules: [
        ({ row, input, reject }) => {
          if (row.title === LOCKED && input.attributes.title !== undefined) {
            reject('TASK_LOCKED', { fields: ['title'] });
          }
        },
      ],
      effects: [
        ({ row, previous }) =>
          row.title === previous.title
            ? []
            : [
                TaskRenamed.of({
                  id: row.id,
                  from: previous.title,
                  to: row.title,
                }),
              ],
      ],
    },
    remove: {
      rules: [
        ({ row, reject }) => {
          if (row.title === LOCKED) {
            reject('TASK_LOCKED');
          }
        },
      ],
      effects: [({ row }) => [TaskRemoved.of({ id: row.id })]],
    },
  },
});

const WorkspacesBehavior = defineResource(Workspaces, {
  policy: definePolicy(Workspaces, {
    get: ({ actor }) => actor.can('workspaces:read'),
    create: () => true,
  }),
});

const LogsBehavior = defineResource(logs, {
  policy: definePolicy(logs, { list: () => true, create: () => true }),
});

/** Each resource's behavior, keyed by its type. */
export const BEHAVIORS: Readonly<
  Record<'tasks' | 'workspaces' | 'logs', ResourceBehavior<TestDomain>>
> = {
  tasks: TasksBehavior,
  workspaces: WorkspacesBehavior,
  logs: LogsBehavior,
};

/** The domain's options over `storage`, with `options` in place of the defaults: a limit of 10 tasks and no hooks. */
export function domainOptions(
  storage: KyselyStorage,
  options: Partial<Omit<DomainOptions<TestDomain>, 'storage'>> = {},
): DomainOptions<TestDomain> {
  return {
    storage,
    resources: BEHAVIORS,
    scopes: contractFixture.scopes,
    quotas: QUOTAS,
    services: { taskLimit: 10 },
    errors: APP_ERRORS,
    ...options,
  };
}

/** Every operation of a resource, an undeclared one throwing, so a test calls each by name. */
type Operations = Required<ResourceOperations>;

/** What a test calls: each resource's operations as one member runs them. */
export interface MemberApi {
  readonly tasks: Operations;
  readonly workspaces: Operations;
  readonly logs: Operations;
}

function declared(
  type: string,
  operations: ResourceOperations | undefined,
): Operations {
  const absent = (name: string) => (): never => {
    throw new Error(`${type} does not declare ${name}`);
  };
  return {
    list: operations?.list ?? absent('list'),
    get: operations?.get ?? absent('get'),
    create: operations?.create ?? absent('create'),
    update: operations?.update ?? absent('update'),
    remove: operations?.remove ?? absent('remove'),
    include: operations?.include ?? absent('include'),
  };
}

/** `domain`'s operations as a test calls them, each by name. */
export function memberApi(
  domain: Readonly<Record<string, ResourceOperations>>,
): MemberApi {
  return {
    tasks: declared('tasks', domain['tasks']),
    workspaces: declared('workspaces', domain['workspaces']),
    logs: declared('logs', domain['logs']),
  };
}

/** The domain of `domainOptions(storage, options)`, as each member runs it. */
export function testDomain(
  storage: KyselyStorage,
  options: Partial<Omit<DomainOptions<TestDomain>, 'storage'>> = {},
): (actor: Member) => MemberApi {
  const as = createDomain(domainOptions(storage, options));
  return (actor) => memberApi(as(actor));
}
