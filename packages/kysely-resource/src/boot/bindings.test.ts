/**
 * The binding problems of boot (resource SPEC 18.3): what `resources`,
 * `scopes`, `unscoped`, and `quotas` hold against each declaration and
 * the catalog, each a message that starts with the resource's type.
 */
import { describe, expect, it } from 'vitest';

import { defineScope } from '@nizam-os/resource-core/server';

import { withoutTable } from '../test-support/boot-catalog';
import { bootOptions } from '../test-support/boot-options';
import { BEHAVIORS } from '../test-support/domain';
import { checkResourceRuntime } from './check-runtime';

describe('boot: bindings (resource SPEC 18.3)', () => {
  it('reports nothing for the composition the domain tests run', async () => {
    expect(checkResourceRuntime(await bootOptions())).toEqual({
      problems: [],
      warnings: [],
    });
  });

  it('reports a behavior held under a key other than its type', async () => {
    const options = await bootOptions();
    const { problems } = checkResourceRuntime({
      ...options,
      resources: { ...BEHAVIORS, people: BEHAVIORS.workspaces },
    });
    expect(problems).toEqual([
      'workspaces: its behavior is under resources.people; key it by its type',
    ]);
  });

  it('reports a resource whose table the catalog lacks', async () => {
    const options = await bootOptions();
    const catalog = withoutTable(options.catalog, 'workspaces');
    expect(checkResourceRuntime({ ...options, catalog }).problems).toEqual([
      'workspaces: the catalog has no table workspaces',
    ]);
  });

  it('reports a scope without a binding, and a binding over another column', async () => {
    const options = await bootOptions();
    const elsewhere = defineScope({
      column: 'parent_id',
      value: () => '1',
      session: 'contract.workspace_id',
    });
    expect(checkResourceRuntime({ ...options, scopes: {} }).problems).toEqual([
      'tasks: scope workspace has no binding in scopes',
    ]);
    expect(
      checkResourceRuntime({ ...options, scopes: { workspace: elsewhere } })
        .problems,
    ).toEqual([
      'tasks: the binding of scope workspace names column parent_id, but the declaration scopes tasks by workspace_id',
    ]);
  });

  it('reports a resource without a scope that unscoped leaves out, and each name it lists in vain', async () => {
    const options = await bootOptions();
    const { problems } = checkResourceRuntime({
      ...options,
      unscoped: ['workspaces', 'tasks', 'nobody'],
    });
    expect(problems).toEqual([
      'logs: the resource has no scope; list it in unscoped to run it without one',
      'tasks: unscoped lists it, but resources has no unscoped resource tasks',
      'nobody: unscoped lists it, but resources has no unscoped resource nobody',
    ]);
  });

  it('reports an includable relationship whose target has no behavior', async () => {
    const options = await bootOptions();
    const { problems } = checkResourceRuntime({
      ...options,
      resources: { tasks: BEHAVIORS.tasks, logs: BEHAVIORS.logs },
      unscoped: ['logs'],
    });
    expect(problems).toEqual([
      'tasks: relationship workspace is includable, but resources has no behavior for its target workspaces',
    ]);
  });

  it('reports a create quota quotas does not hold', async () => {
    const options = await bootOptions();
    expect(checkResourceRuntime({ ...options, quotas: {} }).problems).toEqual([
      'tasks: the create quota tasks is not in quotas',
    ]);
  });
});
