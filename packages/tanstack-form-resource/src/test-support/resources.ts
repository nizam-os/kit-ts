/**
 * The tests' resources (resource SPEC 20.8), declared over the storage
 * contract's catalog (`@nizam-os/resource-core/testing`, SPEC 12.9), as
 * `@nizam-os/hono-resource`'s tests declare theirs: tasks, with a member of
 * each kind their forms edit, and the workspaces and labels they relate
 * to. No scope holds a task's workspace, so its form writes it, and the
 * unique constraint `tasks_workspace_id_title_key` holds two of the form's
 * members together. What this module exports is typed wide, as a
 * JavaScript caller hands it; the type test declares its own typed
 * resources over the same catalog. Not published with the package.
 * @packageDocumentation
 */
import type { DeclaredResource } from '@nizam-os/resource-core';

import { createDeclareResource } from '@nizam-os/resource-core';
import { contractFixture } from '@nizam-os/resource-core/testing';

const declareResource = createDeclareResource({
  catalog: contractFixture.catalog,
  codecs: contractFixture.codecs,
});

const Workspaces = declareResource('workspaces', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

const Labels = declareResource('labels', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

export const Tasks: DeclaredResource = declareResource('tasks', {
  operations: ['get', 'create', 'update'],
  fields: {
    title: { access: 'readWrite' },
    points: { access: 'readWrite' },
    due_on: { access: 'readWrite' },
    tags: { access: 'readWrite' },
    done: { access: 'readWrite' },
  },
  relationships: {
    workspace_id: { target: () => Workspaces, access: 'readWrite' },
    label_id: { target: () => Labels, access: 'readWrite' },
  },
});

/** Every resource of the tests, as an application lists them for its messages. */
export const RESOURCES: ReadonlyArray<DeclaredResource> = [
  Workspaces,
  Labels,
  Tasks,
];
