import type { Selectable } from 'kysely';

import type { Page } from '@nizam-os/keyset-core';

import type { DefineDefaultedKeyset, DefineKeyset } from './define-keyset';
import type { Contacts, DB } from './test-support/db';

import { describe, expectTypeOf, it } from 'vitest';

import { createDefineKeyset } from './define-keyset';
import { compileOnly } from './test-support/db';

const defineKeyset = createDefineKeyset<DB>();
const SECRET = 'x'.repeat(32);

describe('createDefineKeyset types', () => {
  it('checks the table and the column names against DB', () => {
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: { id: { column: 'id', type: 'uuid' } },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      // @ts-expect-error not a table
      table: 'people',
      key: ['id'],
      fields: { id: { column: 'id', type: 'uuid' } },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      // @ts-expect-error not a column of contacts
      fields: { id: { column: 'uuid', type: 'uuid' } },
      cursor: { secret: SECRET },
    });
  });

  it('requires nullable: true for a column whose type includes null', () => {
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: {
        id: { column: 'id', type: 'uuid' },
        age: { column: 'age', type: 'integer', nullable: true },
        firstName: { column: 'first_name', type: 'text', nullable: true },
      },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: {
        id: { column: 'id', type: 'uuid' },
        // @ts-expect-error age is nullable in DB, so the seek must see its nulls
        age: { column: 'age', type: 'integer' },
      },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: {
        id: { column: 'id', type: 'uuid' },
        // @ts-expect-error birthday is nullable in DB
        birthday: { column: 'birthday', type: 'date', nullable: false },
      },
      cursor: { secret: SECRET },
    });
  });

  it('checks relation tables, join columns, relation fields, and aggregate columns', () => {
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: {
        id: { column: 'id', type: 'uuid' },
        latest: {
          aggregate: { relation: 'work', fn: 'max', column: 'start_date' },
          type: 'date',
        },
      },
      relations: {
        work: {
          table: 'work_history',
          on: { contact_id: 'id' },
          fields: { company: { column: 'company', type: 'text' } },
        },
      },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: { id: { column: 'id', type: 'uuid' } },
      // @ts-expect-error not a table
      relations: { work: { table: 'jobs', on: { contact_id: 'id' } } },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: { id: { column: 'id', type: 'uuid' } },
      // @ts-expect-error not a column of work_history
      relations: { work: { table: 'work_history', on: { owner_id: 'id' } } },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: { id: { column: 'id', type: 'uuid' } },
      relations: {
        // @ts-expect-error not a column of contacts
        work: { table: 'work_history', on: { contact_id: 'uuid' } },
      },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: {
        id: { column: 'id', type: 'uuid' },
        // @ts-expect-error not a column of work_history
        latest: {
          aggregate: { relation: 'work', fn: 'max', column: 'started' },
          type: 'date',
        },
      },
      relations: { work: { table: 'work_history', on: { contact_id: 'id' } } },
      cursor: { secret: SECRET },
    });
  });

  it('checks search columns and the vector', () => {
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: { id: { column: 'id', type: 'uuid' } },
      search: { vector: 'search_vector', config: 'english' },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: { id: { column: 'id', type: 'uuid' } },
      // @ts-expect-error not a column of contacts
      search: { mode: 'like', columns: ['first_name', 'surname'] },
      cursor: { secret: SECRET },
    });
  });

  it('types the request and the page of paginate', () => {
    const keyset = defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: {
        id: { column: 'id', type: 'uuid' },
        createdAt: { column: 'created_at', type: 'timestamptz' },
        tags: { column: 'tags', type: 'array', of: 'text' },
      },
      relations: {
        emails: {
          table: 'contact_emails',
          on: { contact_id: 'id' },
          fields: { email: { column: 'email', type: 'text' } },
        },
      },
      cursor: { secret: SECRET },
    });
    const query = compileOnly().selectFrom('contacts').selectAll();
    const page = keyset.paginate(query, {
      sort: ['-createdAt'],
      filter: {
        and: [
          { field: 'emails.email', op: 'contains', value: 'a' },
          {
            relation: 'emails',
            some: { field: 'email', op: 'eq', value: 'x' },
          },
        ],
      },
    });
    expectTypeOf(page).resolves.toEqualTypeOf<Page<Selectable<Contacts>>>();
    const narrow = keyset.paginate(
      compileOnly().selectFrom('contacts').select('id'),
      {},
    );
    expectTypeOf(narrow).resolves.toEqualTypeOf<Page<{ id: string }>>();
    // @ts-expect-error tags is not sortable
    void keyset.paginate(query, { sort: ['tags'] });
    void keyset.paginate(query, {
      // @ts-expect-error unknown relation
      filter: { field: 'phones.number', op: 'eq', value: 1 },
    });
  });
});

describe('createDefineKeyset with defaults types', () => {
  it('makes the cursor optional when the defaults carry one and still checks names', () => {
    const define = createDefineKeyset<DB>({ cursor: { secret: SECRET } });
    expectTypeOf(define).toEqualTypeOf<DefineDefaultedKeyset<DB>>();
    define({
      table: 'contacts',
      key: ['id'],
      fields: { id: { column: 'id', type: 'uuid' } },
    });
    define({
      table: 'contacts',
      key: ['id'],
      fields: { id: { column: 'id', type: 'uuid' } },
      cursor: { ttl: 60 },
    });
    define({
      table: 'contacts',
      key: ['id'],
      // @ts-expect-error not a column of contacts
      fields: { id: { column: 'uuid', type: 'uuid' } },
    });
  });

  it('keeps the cursor required when the defaults carry none', () => {
    const define = createDefineKeyset<DB>({ page: { max: 50 } });
    expectTypeOf(define).toEqualTypeOf<DefineKeyset<DB>>();
    // @ts-expect-error the definition must name its cursor
    define({
      table: 'contacts',
      key: ['id'],
      fields: { id: { column: 'id', type: 'uuid' } },
    });
  });
});
