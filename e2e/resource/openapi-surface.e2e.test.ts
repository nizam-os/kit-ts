/**
 * The surface of the contacts application (resource SPEC 13.2), through
 * the built package: recorded in `snapshots/surface.json` for review, the
 * snapshot an application commits next to its catalog and diffs on every
 * change; and the diff between two versions of the contacts declaration,
 * as an application edits it, each change with its verdict: a write
 * withdrawn, a sort and an operation removed are breaking, an operator
 * added is not.
 */
import { describe, expect, it } from 'vitest';

import { diffSurfaces, surfaceOf } from '@nizam-os/resource-core/openapi';

import { APP_RESOURCES } from './runtime/api.ts';
import { AFTER, BEFORE } from './support/surface-edits.ts';

describe('the surface of the contacts application', () => {
  it('matches the reviewed snapshot', async () => {
    await expect(
      `${JSON.stringify(surfaceOf(APP_RESOURCES), null, 2)}\n`,
    ).toMatchFileSnapshot('snapshots/surface.json');
  });

  it('tells breaking changes from safe ones between two versions', () => {
    const changes = diffSurfaces(surfaceOf(BEFORE), surfaceOf(AFTER));
    expect(
      changes.map(({ path, change, breaking }) => ({
        path: path.join('.'),
        change,
        breaking,
      })),
    ).toEqual([
      { path: 'contacts.operations.remove', change: 'removed', breaking: true },
      {
        path: 'contacts.fields.email.operators.in',
        change: 'added',
        breaking: false,
      },
      {
        path: 'contacts.fields.nickname.access',
        change: 'changed',
        breaking: true,
      },
      {
        path: 'contacts.fields.priority.sortable',
        change: 'changed',
        breaking: true,
      },
    ]);
  });
});
