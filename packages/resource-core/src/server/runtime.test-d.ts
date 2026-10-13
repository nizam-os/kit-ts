/**
 * The runtime contract's types (SPEC 12.10) over typed declarations: a
 * resource has exactly the operations it declares, and `include` when a
 * relationship is includable; its rows are its public rows, and its list
 * takes a request in its own keyset fields. A resource typed wide may
 * have any of them, and what its behaviors type passes where a host
 * takes the wide types.
 */
import type { Page } from '@nizam-os/keyset-core';

import type { DeclaredResource } from '../declare/declared-resource';
import type { Actor } from './domain-types';
import type { PublicRowOf } from './resource-types';
import type { Domain, ResourceOperations, ResourceRuntime } from './runtime';
import type { StorageListRequest } from './storage';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contractFixture } from '../testing/contract/fixture';
import { createDomainDefiners } from './domain';

type Permission = 'tasks:read' | 'tasks:write';
interface Member extends Actor<Permission> {
  readonly workspace: string;
}
const APP_ERRORS = {
  TASK_LOCKED: { status: 409, title: 'Task Locked' },
} as const;
interface TestDomain {
  readonly actor: Member;
  readonly permissions: Permission;
  readonly quotas: never;
  readonly services: undefined;
  readonly errors: typeof APP_ERRORS;
}

const declareResource = createDeclareResource({
  catalog: contractFixture.catalog,
  codecs: contractFixture.codecs,
  scopes: { workspace: { column: 'workspace_id' } },
});
const Workspaces = declareResource('workspaces', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});
const Tasks = declareResource('tasks', {
  operations: ['list', 'get', 'create'],
  scope: 'workspace',
  fields: {
    title: { access: 'readWrite', filter: ['eq'], sort: true },
    done: { access: 'readWrite' },
  },
  relationships: {
    workspace_id: { target: () => Workspaces, access: 'read', include: true },
  },
});
const { defineResource, definePolicy } = createDomainDefiners<TestDomain>();
const TasksBehavior = defineResource(Tasks, {
  operations: { create: { values: ({ actor }) => ({ created_by: actor.id }) } },
  policy: definePolicy(Tasks, {
    list: ({ actor }) => actor.can('tasks:read'),
    get: ({ actor }) => actor.can('tasks:read'),
    create: ({ actor }) => actor.can('tasks:write'),
    include: { workspace: () => true },
  }),
});
const WorkspacesBehavior = defineResource(Workspaces, {
  policy: definePolicy(Workspaces, { get: () => true }),
});

type Resources = {
  readonly tasks: typeof TasksBehavior;
  readonly workspaces: typeof WorkspacesBehavior;
};
type TaskOperations = ResourceOperations<typeof Tasks>;
declare const tasks: TaskOperations;
declare const otherTasks: TaskOperations;
declare const wide: ResourceOperations;
declare const runtime: ResourceRuntime<TestDomain, Resources>;
declare const member: Member;

describe('ResourceOperations (SPEC 12.10)', () => {
  it('has exactly the operations the declaration declares, and include when a relationship is includable', () => {
    expectTypeOf<keyof TaskOperations>().toEqualTypeOf<
      'list' | 'get' | 'create' | 'include'
    >();
    expectTypeOf<
      keyof ResourceOperations<typeof Workspaces>
    >().toEqualTypeOf<'get'>();
    expectTypeOf(tasks.include).parameter(0).toEqualTypeOf<'workspace'>();
  });

  it('resolves to the public rows of the resource', () => {
    expectTypeOf(tasks.get).returns.resolves.toEqualTypeOf<
      PublicRowOf<typeof Tasks>
    >();
    expectTypeOf(tasks.create).returns.resolves.toEqualTypeOf<
      PublicRowOf<typeof Tasks>
    >();
    expectTypeOf(tasks.list).returns.resolves.toEqualTypeOf<
      Page<PublicRowOf<typeof Tasks>>
    >();
  });

  it('lists by the fields of its keyset, in their public names', () => {
    void tasks.list({
      filter: { field: 'title', op: 'eq', value: 'Boot' },
      sort: ['-title'],
    });
    // @ts-expect-error done neither filters nor sorts
    void tasks.list({ sort: ['done'] });
    // @ts-expect-error a field the resource does not have
    void tasks.list({ filter: { field: 'titel', op: 'eq', value: 'Boot' } });
  });

  it('may have any operation when the resource is typed wide', () => {
    expectTypeOf<keyof ResourceOperations>().toEqualTypeOf<
      'list' | 'get' | 'create' | 'update' | 'remove' | 'include'
    >();
    expectTypeOf<undefined>().toExtend<ResourceOperations['get']>();
  });

  it('holds its operations read-only', () => {
    // @ts-expect-error list is read-only
    tasks.list = otherTasks.list;
    // @ts-expect-error an operation of a resource typed wide is read-only too
    wide.get = tasks.get;
  });

  it('lists a resource typed wide by any field, as the storage takes it', () => {
    expectTypeOf<
      Parameters<NonNullable<ResourceOperations['list']>>[0]
    >().toEqualTypeOf<StorageListRequest | undefined>();
  });
});

describe('Domain and ResourceRuntime (SPEC 12.10)', () => {
  it('keys the operations by type, each typed by its behavior', () => {
    expectTypeOf<keyof Domain<Resources>>().toEqualTypeOf<
      'tasks' | 'workspaces'
    >();
    expectTypeOf<Domain<Resources>['tasks']>().toEqualTypeOf<TaskOperations>();
  });

  it('runs as the domain actor, and lists the declared resources wide and read-only', () => {
    expectTypeOf(runtime.as).parameter(0).toEqualTypeOf<Member>();
    expectTypeOf(runtime.as(member).tasks).toEqualTypeOf<TaskOperations>();
    expectTypeOf(runtime.resources).toEqualTypeOf<
      ReadonlyArray<DeclaredResource>
    >();
    // @ts-expect-error resources is read-only
    runtime.resources = [];
  });

  it("hands transaction's work the same domain, and resolves to what work resolves to", () => {
    expectTypeOf(runtime.transaction).parameter(0).toEqualTypeOf<Member>();
    const created = runtime.transaction(member, async (domain) => {
      expectTypeOf(domain.tasks).toEqualTypeOf<TaskOperations>();
      return domain.tasks.create({ attributes: { title: 'Boot' } });
    });
    expectTypeOf(created).resolves.toEqualTypeOf<PublicRowOf<typeof Tasks>>();
    void runtime.transaction(member, async (domain) => {
      // @ts-expect-error workspaces does not declare create
      await domain.workspaces.create({});
    });
  });

  it('passes where a host takes the runtime typed wide, down to each operation', () => {
    expectTypeOf<TaskOperations>().toExtend<ResourceOperations>();
    expectTypeOf<Domain<Resources>>().toExtend<Domain>();
    expectTypeOf<ResourceRuntime<TestDomain, Resources>>().toExtend<
      ResourceRuntime<TestDomain>
    >();
  });
});
