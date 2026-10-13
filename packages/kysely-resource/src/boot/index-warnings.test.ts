/**
 * The warnings of boot (resource SPEC 18.3), each over indexes as
 * PostgreSQL printed them: a sortable member no btree index without a
 * predicate serves after the scope column, and a unique index that leaves
 * the scope column out over a value the client writes.
 */
import type { TestDomain } from '../test-support/domain';

import { describe, expect, it } from 'vitest';

import { createDeclareResource } from '@nizam-os/resource-core';
import { createDomainDefiners } from '@nizam-os/resource-core/server';
import { contractFixture } from '@nizam-os/resource-core/testing';

import { tasksLike, withTable } from '../test-support/boot-catalog';
import { bootOptions } from '../test-support/boot-options';
import { BEHAVIORS } from '../test-support/domain';
import { checkResourceRuntime } from './check-runtime';

const declareResource = createDeclareResource({
  catalog: contractFixture.catalog,
  codecs: contractFixture.codecs,
  scopes: { workspace: { column: 'workspace_id' } },
});
const { defineResource, definePolicy } = createDomainDefiners<TestDomain>();
const Sorted = declareResource('workspaces', {
  operations: ['list'],
  fields: { name: { access: 'read', sort: true } },
});
const SORTED = defineResource(Sorted, {
  policy: definePolicy(Sorted, { list: () => true }),
});

/** The access modes with which the client writes a member. */
type Access = 'readWrite' | 'immutable' | 'write';

/** A behavior of tasks whose title has `access`; no unique index holds its other member, done. */
function titled(access: Access) {
  const Titled = declareResource('tasks', {
    operations: ['get', 'create', 'update'],
    scope: 'workspace',
    fields: { title: { access }, done: { access: 'readWrite' } },
  });
  return defineResource(Titled, {
    policy: definePolicy(Titled, { get: () => true }),
    operations: {
      create: { values: ({ actor }) => ({ created_by: actor.id }) },
    },
  });
}

const Unscoped = declareResource('tasks', {
  operations: ['get'],
  fields: { title: { access: 'read' } },
});
const Linked = declareResource('tasks', {
  operations: ['get', 'create'],
  scope: 'workspace',
  fields: { title: { access: 'readWrite' } },
  relationships: {
    parent_id: { target: () => Unscoped, access: 'readWrite' },
  },
});
/** Tasks whose parent the runtime looks up as a task of no scope. */
const LINKED = defineResource(Linked, {
  policy: definePolicy(Linked, { get: () => true }),
  operations: {
    create: { values: ({ actor }) => ({ created_by: actor.id }) },
  },
});

const unique = (index: string) =>
  `tasks: unique index ${index} on tasks leaves out workspace_id, so a create or an update answers its 409 for a value another scope holds`;

const UNSORTED =
  'tasks: no btree index on tasks begins with (workspace_id, title), so a page sorted by title sorts every row of the scope';

describe('boot: index warnings (resource SPEC 18.3)', () => {
  it.each([
    ['idx_none', [UNSORTED]],
    ['idx_partial', [UNSORTED]],
    ['idx_descending', []],
    ['idx_brin', [UNSORTED]],
    ['idx_unique', [unique('idx_unique_lower'), unique('idx_unique_title')]],
    [
      'idx_scoped',
      [UNSORTED, unique('idx_scoped_open'), unique('idx_scoped_parent_nulls')],
    ],
  ])('over the indexes of %s', async (copy, warnings) => {
    const options = await bootOptions();
    const report = checkResourceRuntime({
      ...options,
      catalog: tasksLike(options.catalog, copy, 'indexes'),
    });
    expect(report).toEqual({ problems: [], warnings });
  });

  it.each<[Access, ReadonlyArray<string>]>([
    ['readWrite', [unique('idx_unique_lower'), unique('idx_unique_title')]],
    ['immutable', [unique('idx_unique_lower'), unique('idx_unique_title')]],
    ['write', [unique('idx_unique_lower'), unique('idx_unique_title')]],
  ])(
    'counts a member the client writes with access %s',
    async (access, warnings) => {
      const options = await bootOptions();
      const report = checkResourceRuntime({
        ...options,
        catalog: tasksLike(options.catalog, 'idx_unique', 'indexes'),
        resources: { ...BEHAVIORS, tasks: titled(access) },
      });
      expect(report.warnings).toEqual(warnings);
    },
  );

  it('takes a reference that cannot be null as keeping to the scope, whatever the nulls', async () => {
    const options = await bootOptions();
    const catalog = withTable(
      tasksLike(options.catalog, 'idx_scoped', 'indexes'),
      'tasks',
      (table) => ({
        ...table,
        columns: {
          ...table.columns,
          parent_id: { ...table.columns['parent_id']!, nullable: false },
        },
      }),
    );
    expect(checkResourceRuntime({ ...options, catalog }).warnings).toEqual([
      UNSORTED,
      unique('idx_scoped_open'),
    ]);
  });

  it('warns about a reference the runtime looks up outside the scope', async () => {
    const options = await bootOptions();
    const { warnings } = checkResourceRuntime({
      ...options,
      catalog: tasksLike(options.catalog, 'idx_scoped', 'indexes'),
      resources: { ...BEHAVIORS, tasks: LINKED },
    });
    expect(warnings).toEqual([
      unique('idx_scoped_open'),
      unique('idx_scoped_parent'),
      unique('idx_scoped_parent_nulls'),
    ]);
  });

  it('asks an unscoped resource for an index that begins with the column', async () => {
    const options = await bootOptions();
    const { warnings } = checkResourceRuntime({
      ...options,
      resources: { ...BEHAVIORS, workspaces: SORTED },
    });
    expect(warnings).toEqual([
      'workspaces: no btree index on workspaces begins with (name), so a page sorted by name sorts every row',
    ]);
  });
});
