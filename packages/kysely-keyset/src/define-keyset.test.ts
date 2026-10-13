import type { DB } from './test-support/db';

import { describe, expect, it } from 'vitest';

import { createDefineKeyset as createCoreDefineKeyset } from '@nizam-os/keyset-core';

import { createDefineKeyset } from './define-keyset';
import { canned } from './test-support/db';
import {
  CONTACTS,
  contacts,
  defineTyped,
  typedContacts,
} from './test-support/keysets';

const SECRET = 'test-secret-with-at-least-32-bytes!!';
const ID = '00000000-0000-4000-8000-00000000000';

function row(n: number): Record<string, unknown> {
  return { id: `${ID}${String(n)}`, keyset0: `${ID}${String(n)}` };
}

const IDS = {
  table: 'contacts',
  key: ['id'],
  fields: { id: { column: 'id', type: 'uuid' } },
} as const;

describe('createDefineKeyset', () => {
  it('produces the same definition as the core', () => {
    expect(typedContacts.definition).toEqual(contacts.definition);
  });

  it('plans like the core and adds paginate', async () => {
    const plan = await typedContacts.plan({ sort: ['-age'] });
    expect(plan.context).toBe(
      (await contacts.plan({ sort: ['-age'] })).context,
    );
    const { db, recorded } = canned([[]]);
    const page = await typedContacts.paginate(
      db.selectFrom('contacts').selectAll(),
      {
        filter: { field: 'emails.email', op: 'endsWith', value: '@x.io' },
      },
    );
    expect(page.rows).toEqual([]);
    expect(recorded.queries[0]?.sql).toContain(
      'exists (select 1 as "one" from "contact_emails"',
    );
  });

  it('validates like the core', () => {
    expect(() =>
      defineTyped({
        ...CONTACTS,
        fields: { id: { column: 'id', type: 'uuid' } },
        relations: undefined,
        key: ['id'],
        cursor: { secret: 'short' },
      }),
    ).toThrow(new TypeError('cursor.secret must be at least 32 bytes'));
  });
});

describe('createDefineKeyset with defaults (SPEC 10.1, 3.6)', () => {
  const DEFAULTS = {
    cursor: { secret: SECRET },
    page: { default: 2, max: 40 },
    search: { config: 'english' },
  } as const;
  const define = createDefineKeyset<DB>(DEFAULTS);
  const { cursor: _cursor, page: _page, ...withoutCursor } = CONTACTS;

  it('merges the defaults exactly like the core', () => {
    expect(define(withoutCursor).definition).toEqual(
      createCoreDefineKeyset(DEFAULTS)(withoutCursor).definition,
    );
  });

  it('paginates with the default page size and cursor secret', async () => {
    const keyset = define(IDS);
    const { db, recorded } = canned([[row(1), row(2), row(3)], [row(3)]]);
    const first = await keyset.paginate(
      db.selectFrom('contacts').selectAll(),
      {},
    );
    expect(recorded.queries[0]?.parameters).toEqual([3]);
    expect(first.rows).toHaveLength(2);
    const second = await keyset.paginate(
      db.selectFrom('contacts').selectAll(),
      { page: { after: first.next ?? '' } },
    );
    expect(recorded.queries[1]?.sql).toContain('"contacts"."id" > $1');
    expect(recorded.queries[1]?.parameters).toEqual([`${ID}2`, 3]);
    expect(second.rows).toEqual([{ id: `${ID}3` }]);
  });

  it('renders full-text search with the default configuration', async () => {
    const keyset = define({ ...IDS, search: { columns: ['first_name'] } });
    const { db, recorded } = canned([[]]);
    await keyset.paginate(db.selectFrom('contacts').selectAll(), {
      search: 'ada',
    });
    expect(recorded.queries[0]?.sql).toContain(
      `to_tsvector('english', concat_ws(' ', "contacts"."first_name"))`,
    );
  });

  it('needs the secret from the definition when the defaults have none', () => {
    const withoutSecret = createDefineKeyset<DB>({ page: { max: 10 } });
    expect(() => withoutSecret(IDS as never)).toThrow(
      new TypeError(
        'cursor.secret must be set by the definition or the defaults',
      ),
    );
    expect(
      withoutSecret({ ...IDS, cursor: { secret: SECRET } }).definition.page,
    ).toEqual({ default: 10, max: 10, range: false });
  });

  it('checks the defaults at startup', () => {
    expect(() =>
      createDefineKeyset<DB>({ cursor: { secret: 'short' } }),
    ).toThrow(new TypeError('cursor.secret must be at least 32 bytes'));
  });
});
