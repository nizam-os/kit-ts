/**
 * The row security problems of boot (resource SPEC 18.3), each case over
 * the policies a copy of `tasks` holds as PostgreSQL printed them: row
 * security enabled, a permissive policy for each command the operations
 * run, and the scope's parameter read by every permissive policy or by a
 * restrictive one, its name compared without regard to case.
 */
import type { ResourceBehavior } from '@nizam-os/resource-core/server';

import type { TestDomain } from '../test-support/domain';

import { describe, expect, it } from 'vitest';

import { createDeclareResource } from '@nizam-os/resource-core';
import { createDomainDefiners } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { tasksLike } from '../test-support/boot-catalog';
import { bootOptions } from '../test-support/boot-options';
import { BEHAVIORS } from '../test-support/domain';
import { checkResourceRuntime } from './check-runtime';

const declareResource = createDeclareResource({
  catalog: contractFixture.catalog,
  codecs: contractFixture.codecs,
  scopes: { workspace: { column: 'workspace_id' } },
});
const { defineResource, definePolicy } = createDomainDefiners<TestDomain>();
const Read = declareResource('tasks', {
  operations: ['get'],
  scope: 'workspace',
  fields: { title: { access: 'read' } },
});
const Removed = declareResource('tasks', {
  operations: ['get', 'remove'],
  scope: 'workspace',
  fields: { title: { access: 'read' } },
});
const READ = defineResource(Read, {
  policy: definePolicy(Read, { get: () => true }),
});
const REMOVED = defineResource(Removed, {
  policy: definePolicy(Removed, { get: () => true, remove: () => true }),
});

const unread = (command: string, clause: string, policy: string) =>
  `tasks: the ${command} policies on tasks do not read contract.workspace_id in ${clause}: ${policy}`;
const everyClause = (policy: string) => [
  unread('SELECT', 'USING', policy),
  unread('INSERT', 'WITH CHECK', policy),
  unread('UPDATE', 'USING', policy),
  unread('UPDATE', 'WITH CHECK', policy),
  unread('DELETE', 'USING', policy),
];
const refusing = (command: string) =>
  `tasks: no permissive policy on tasks applies to ${command}, so PostgreSQL refuses every row`;

describe('boot: row security (resource SPEC 18.3)', () => {
  it.each([
    ['rls_none', ['tasks: row security is not enabled on tasks']],
    [
      'rls_empty',
      ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((command) =>
        refusing(command),
      ),
    ],
    ['rls_open', everyClause('rls_open_all')],
    ['rls_other', everyClause('rls_other_workspace')],
    ['rls_quoted', everyClause('rls_quoted_workspace')],
    ['rls_mixed', everyClause('rls_mixed_admin')],
    [
      'rls_commands',
      [
        unread('INSERT', 'WITH CHECK', 'rls_commands_insert'),
        unread('DELETE', 'USING', 'rls_commands_delete'),
      ],
    ],
    ['rls_restricted', []],
    ['rls_spelled', []],
  ])('over the policies of %s', async (copy, problems) => {
    const options = await bootOptions();
    const catalog = tasksLike(options.catalog, copy, 'rowSecurity');
    expect(checkResourceRuntime({ ...options, catalog }).problems).toEqual(
      problems,
    );
  });

  it('asks only for the commands the operations run', async () => {
    const options = await bootOptions();
    const problems = (copy: string, tasks: ResourceBehavior<TestDomain>) =>
      checkResourceRuntime({
        ...options,
        catalog: tasksLike(options.catalog, copy, 'rowSecurity'),
        resources: { ...BEHAVIORS, tasks },
      }).problems;
    expect(problems('rls_commands', READ)).toEqual([]);
    expect(problems('rls_unlocked', READ)).toEqual([]);
    expect(problems('rls_unlocked', REMOVED)).toEqual([
      unread('UPDATE', 'USING', 'rls_unlocked_update'),
    ]);
    expect(problems('rls_unlocked', BEHAVIORS.tasks)).toEqual([
      refusing('INSERT'),
      unread('UPDATE', 'USING', 'rls_unlocked_update'),
    ]);
  });
});
