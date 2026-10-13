/**
 * `createResourceRuntime`'s types (resource SPEC 18.3, 18.4): it infers
 * the domain and each resource from the behaviors it is given, and what
 * it resolves to passes where a host takes resource-core's runtime
 * contract typed wide (SPEC 12.10), whose own types resource-core tests.
 */
import type { DeclaredResource } from '@nizam-os/resource-core';
import type {
  ResourceOperations,
  ResourceRuntime,
} from '@nizam-os/resource-core/server';

import type { Member, TestDomain } from '../test-support/domain';
import type { RuntimeOptions } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '@nizam-os/resource-core';
import { createDomainDefiners } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { createResourceRuntime } from './create-runtime';

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
    list: () => true,
    get: () => true,
    create: () => true,
    include: { workspace: () => true },
  }),
});
const WorkspacesBehavior = defineResource(Workspaces, {
  policy: definePolicy(Workspaces, { get: () => true }),
});

type TaskOperations = ResourceOperations<typeof Tasks>;
declare const options: RuntimeOptions<TestDomain>;

const runtime = createResourceRuntime({
  ...options,
  resources: { tasks: TasksBehavior, workspaces: WorkspacesBehavior },
});

declare const booted: Awaited<typeof runtime>;
declare const member: Member;

describe('createResourceRuntime (resource SPEC 18.3, 18.4)', () => {
  it('runs as the actor of the domain the behaviors infer, each resource typed by its behavior', () => {
    expectTypeOf(runtime)
      .resolves.toHaveProperty('as')
      .parameter(0)
      .toEqualTypeOf<Member>();
    expectTypeOf(runtime)
      .resolves.toHaveProperty('as')
      .returns.toHaveProperty('tasks')
      .toEqualTypeOf<TaskOperations>();
    expectTypeOf(runtime)
      .resolves.toHaveProperty('resources')
      .toEqualTypeOf<ReadonlyArray<DeclaredResource>>();
  });

  it("hands transaction's work the domain as gives, and resolves to what work resolves to", () => {
    const created = booted.transaction(member, async (domain) => {
      expectTypeOf(domain.tasks).toEqualTypeOf<TaskOperations>();
      return domain.tasks.create({ attributes: { title: 'Boot' } });
    });
    expectTypeOf(created).resolves.toHaveProperty('title');
  });

  it('resolves to what passes where a host takes the runtime typed wide', () => {
    expectTypeOf(runtime).resolves.toExtend<ResourceRuntime<TestDomain>>();
  });
});
