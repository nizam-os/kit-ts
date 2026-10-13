/**
 * formatDiff (SPEC 10.2): changes grouped by the nearest object kind along
 * their path, one line per object, a line per changed member, and the
 * summary line.
 */
import type {
  CatalogChange,
  CatalogTable,
  CheckConstraint,
} from '@nizam-os/catalog-core';

import { describe, expect, it } from 'vitest';

import { diffCatalogs } from '@nizam-os/catalog-core';

import {
  catalogOf,
  column,
  domain,
  table,
} from '../test-support/kysely-catalog';
import { formatDiff } from './format-diff';

const BODY_LENGTH: CheckConstraint = {
  kind: 'check',
  columns: ['body'],
  expression: '(char_length(body) <= 200)',
  rule: { kind: 'length', min: null, max: 200 },
  validated: true,
  enforced: true,
  definition: 'CHECK ((char_length(body) <= 200))',
};

const NOTES: CatalogTable = {
  ...table('notes', { id: column('int4', { nullable: false }) }),
  constraints: { notes_body_length: BODY_LENGTH },
  rowSecurity: {
    enabled: true,
    forced: false,
    policies: {
      notes_owner: {
        command: 'all',
        permissive: true,
        roles: ['public'],
        using: '(owner = CURRENT_USER)',
        withCheck: null,
      },
    },
  },
};

const EMAIL = domain('email', 'text', {
  constraints: {
    email_shape: {
      kind: 'check',
      expression: "(VALUE ~ '@'::text)",
      rule: null,
      validated: true,
      definition: "CHECK ((VALUE ~ '@'::text))",
    },
  },
});

function changes(...list: Array<CatalogChange>): {
  changes: Array<CatalogChange>;
} {
  return { changes: list };
}

describe('formatDiff (SPEC 10.2)', () => {
  it('says so when nothing differs', () => {
    expect(formatDiff({ changes: [] })).toBe('No differences');
  });

  it('groups a live database that drifted by object kind, in a fixed order', () => {
    const committed = catalogOf({
      enums: { mood: ['happy', 'sad'] },
      domains: { email: EMAIL },
      tables: { notes: NOTES },
    });
    const live = {
      ...catalogOf({
        enums: { mood: ['happy', 'sad', 'meh'] },
        domains: { email: { ...EMAIL, constraints: {} } },
        tables: {
          notes: {
            ...NOTES,
            columns: { ...NOTES.columns, pinned: column('bool') },
            constraints: {
              notes_body_length: {
                ...BODY_LENGTH,
                rule: { kind: 'pattern', source: '^\\S', flags: 'su' },
              },
            },
            rowSecurity: { enabled: true, forced: true, policies: {} },
          },
        },
      }),
      extensions: ['pg_trgm'],
    } as const;
    expect(formatDiff(diffCatalogs(committed, live))).toBe(
      [
        '7 objects differ: 1 added, 2 removed, 4 changed',
        '',
        'Extensions',
        '  ~ extensions: expected [], actual ["pg_trgm"]',
        '',
        'Enums',
        '  ~ mood: expected ["happy","sad"], actual ["happy","sad","meh"]',
        '',
        'Tables',
        '  ~ notes',
        '      rowSecurity.forced: expected false, actual true',
        '',
        'Columns',
        '  + notes.pinned',
        '',
        'Constraints',
        '  - email.email_shape',
        '  ~ notes.notes_body_length',
        '      rule.kind: expected "length", actual "pattern"',
        '      rule.min: removed null',
        '      rule.max: removed 200',
        '      rule.source: added "^\\\\S"',
        '      rule.flags: added "su"',
        '',
        'Policies',
        '  - notes.notes_owner',
      ].join('\n'),
    );
  });

  it('takes the nearest object along the path, even when names repeat the kinds', () => {
    expect(
      formatDiff(
        changes({
          kind: 'changed',
          path: ['tables', 'columns', 'columns', 'constraints', 'nullable'],
          expected: false,
          actual: true,
        }),
      ),
    ).toBe(
      [
        '1 object differs: 1 changed',
        '',
        'Columns',
        '  ~ columns.constraints',
        '      nullable: expected false, actual true',
      ].join('\n'),
    );
  });

  it('lists the members of the catalog itself under Catalog', () => {
    expect(
      formatDiff(
        changes(
          {
            kind: 'changed',
            path: ['schemas'],
            expected: ['public'],
            actual: ['public', 'audit'],
          },
          { kind: 'added', path: ['tables', 'audit.events'], actual: {} },
        ),
      ),
    ).toBe(
      [
        '2 objects differ: 1 added, 1 changed',
        '',
        'Catalog',
        '  ~ schemas: expected ["public"], actual ["public","audit"]',
        '',
        'Tables',
        '  + audit.events',
      ].join('\n'),
    );
  });
});
