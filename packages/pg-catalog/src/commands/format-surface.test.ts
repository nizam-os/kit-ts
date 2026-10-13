import type { SurfaceChange } from '@nizam-os/resource-core/openapi';

import type { SurfaceCheckReport } from './surface';

import { describe, expect, it } from 'vitest';

import { formatSurface } from './format-surface';

/** formatSurface (SPEC 10.4): the text `surface --check` prints. */

function change(
  path: ReadonlyArray<string>,
  kind: SurfaceChange['change'],
  breaking: boolean,
  before: unknown,
  after: unknown,
): SurfaceChange {
  return { path, change: kind, breaking, before, after };
}

function changed(changes: ReadonlyArray<SurfaceChange>): SurfaceCheckReport {
  return { file: '/app/api-surface.json', status: 'changed', changes };
}

describe('formatSurface (SPEC 10.4)', () => {
  it('says that the snapshot is missing, or that nothing changed', () => {
    expect(
      formatSurface(
        { file: '/app/api-surface.json', status: 'missing', changes: [] },
        'api-surface.json',
      ),
    ).toBe('api-surface.json: missing; write it with pg-catalog surface');
    expect(
      formatSurface(
        { file: '/app/api-surface.json', status: 'unchanged', changes: [] },
        'api-surface.json',
      ),
    ).toBe('api-surface.json: no changes');
  });

  it('lists the breaking changes, then the safe ones, each marked, in the order of the diff', () => {
    const report = changed([
      change(
        ['contacts', 'operations', 'remove'],
        'removed',
        true,
        'remove',
        null,
      ),
      change(
        ['contacts', 'fields', 'email', 'operators', 'in'],
        'added',
        false,
        null,
        'in',
      ),
      change(
        ['contacts', 'fields', 'nickname', 'access'],
        'changed',
        true,
        'readWrite',
        'read',
      ),
    ]);
    expect(formatSurface(report, 'api-surface.json')).toBe(
      [
        'api-surface.json: 3 changes, 2 breaking',
        '',
        'Breaking',
        '  - contacts.operations.remove',
        '  ~ contacts.fields.nickname.access: "readWrite" -> "read"',
        '',
        'Safe',
        '  + contacts.fields.email.operators.in',
        '',
        'Run pg-catalog surface to record them.',
      ].join('\n'),
    );
  });

  it('counts one change, none breaking, and quotes a segment that is not a plain name', () => {
    const report = changed([
      change(
        ['tasks', 'fields', 'status', 'options', 'in progress'],
        'added',
        false,
        null,
        'in progress',
      ),
    ]);
    expect(formatSurface(report, 'surface.json')).toBe(
      [
        'surface.json: 1 change, none breaking',
        '',
        'Safe',
        '  + tasks.fields.status.options."in progress"',
        '',
        'Run pg-catalog surface to record them.',
      ].join('\n'),
    );
  });

  it('shows a changed value as JSON, cut after 60 characters', () => {
    const items = {
      wire: 'string',
      format: null,
      fractionDigits: null,
      limits: { maxLength: 40 },
      options: null,
    };
    const [, line] = formatSurface(
      changed([
        change(
          ['tags', 'fields', 'labels', 'items'],
          'changed',
          true,
          null,
          items,
        ),
      ]),
      'surface.json',
    ).split('\n\n');
    expect(line).toBe(
      `Breaking\n  ~ tags.fields.labels.items: null -> ${JSON.stringify(items).slice(0, 60)}…`,
    );
  });
});
