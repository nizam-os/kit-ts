/**
 * The options boot reads (resource SPEC 18.3): each JavaScript mistake is
 * a `TypeError` naming the caller and the option, before any check.
 */
import { describe, expect, it } from 'vitest';

import { contractFixture } from '@nizam-os/resource-core/testing';

import { createResourceRuntime } from '../runtime/create-runtime';
import { bootOptions } from '../test-support/boot-options';
import { BEHAVIORS } from '../test-support/domain';
import { checkResourceRuntime } from './check-runtime';

type Options = Readonly<Record<string, unknown>>;

describe('boot: options (resource SPEC 18.3)', () => {
  it.each<[string, (options: Options) => unknown, string]>([
    ['options', () => 'options', 'options must be an object'],
    [
      'an unknown key',
      (options) => ({ ...options, outbox: {} }),
      'options.outbox is not an option',
    ],
    [
      'storage',
      (options) => ({ ...options, storage: {} }),
      'options.storage must come from createKyselyStorage',
    ],
    [
      'catalog',
      (options) => ({ ...options, catalog: contractFixture.catalog }),
      'options.catalog must be the full catalog pg-catalog extract writes',
    ],
    [
      'resources',
      (options) => ({ ...options, resources: [] }),
      'options.resources must be an object of behaviors keyed by type',
    ],
    [
      'a resource',
      (options) => ({
        ...options,
        resources: { ...BEHAVIORS, tasks: { ...BEHAVIORS.tasks } },
      }),
      'resources.tasks must be a behavior defineResource returned (a second installed copy of @nizam-os/resource-core also fails this)',
    ],
    [
      'scopes',
      (options) => ({ ...options, scopes: null }),
      'options.scopes must be an object of bindings keyed by scope',
    ],
    [
      'a scope',
      (options) => ({
        ...options,
        scopes: { workspace: { column: 'workspace_id' } },
      }),
      'scopes.workspace must be a binding defineScope returned',
    ],
    [
      'unscoped',
      (options) => ({ ...options, unscoped: ['logs', 7] }),
      'options.unscoped must be a list of resource types',
    ],
    [
      'quotas',
      (options) => ({ ...options, quotas: 'tasks' }),
      'options.quotas must be an object of quotas keyed by name',
    ],
    [
      'a quota',
      (options) => ({ ...options, quotas: { tasks: { limit: 10 } } }),
      'quotas.tasks must be a quota defineQuota returned',
    ],
    [
      'errors',
      (options) => ({ ...options, errors: undefined }),
      "options.errors must be an object of the application's codes",
    ],
    [
      'afterCommit',
      (options) => ({ ...options, afterCommit: 'wake' }),
      'options.afterCommit must be a function',
    ],
    [
      'report',
      (options) => ({ ...options, report: true }),
      'options.report must be a function',
    ],
  ])('refuses %s', async (_option, change, message) => {
    const options = change({ ...(await bootOptions()) });
    // @ts-expect-error -- the mistakes are JavaScript's, which the types refuse
    expect(() => checkResourceRuntime(options)).toThrow(
      new TypeError(`checkResourceRuntime: ${message}`),
    );
  });

  it.each(['column', 'session', 'value'])(
    'refuses a binding whose %s is not what defineScope returns',
    async (member) => {
      const options = await bootOptions();
      const workspace = { ...contractFixture.scopes.workspace, [member]: 7 };
      expect(() =>
        checkResourceRuntime({ ...options, scopes: { workspace } }),
      ).toThrow(
        new TypeError(
          'checkResourceRuntime: scopes.workspace must be a binding defineScope returned',
        ),
      );
    },
  );

  it("names createResourceRuntime in its own refusals, and takes unscoped's absence as none", async () => {
    const options = await bootOptions();
    await expect(
      createResourceRuntime({
        ...options,
        storage: BEHAVIORS.tasks.resource,
      } as never),
    ).rejects.toThrow(
      new TypeError(
        'createResourceRuntime: options.storage must come from createKyselyStorage',
      ),
    );
    const { unscoped: _unscoped, ...rest } = options;
    expect(checkResourceRuntime(rest).problems).toEqual([
      'workspaces: the resource has no scope; list it in unscoped to run it without one',
      'logs: the resource has no scope; list it in unscoped to run it without one',
    ]);
  });
});
