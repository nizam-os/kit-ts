import type { CamelDB, DB } from './db.ts';

/**
 * The keysets under test, defined the way an application would: one
 * configured definer per database interface (the snake_case `DB` and the
 * camelCase `CamelDB`) and one over the Drizzle schema carry the cursor
 * secret, and each definition adds only what differs. Every keyset is
 * defined through both bindings, with the same field names, so the files
 * that run per binding (`bindings.ts`) page the same collections.
 */
import { createDefineKeyset as createDrizzleDefineKeyset } from '@nizam-os/drizzle-keyset';
import { createDefineKeyset } from '@nizam-os/kysely-keyset';

import { schema } from './drizzle-schema.ts';

export const SECRET = 'e2e-secret-with-at-least-32-bytes-in-it';

const defineKeyset = createDefineKeyset<DB>({ cursor: { secret: SECRET } });

export const COLUMN_FIELDS = {
  id: { column: 'id', type: 'uuid' },
  firstName: { column: 'first_name', type: 'text' },
  lastName: {
    column: 'last_name',
    type: 'text',
    collation: 'insensitive',
    nullable: true,
  },
  age: { column: 'age', type: 'integer', nullable: true },
  score: { column: 'score', type: 'decimal' },
  active: { column: 'active', type: 'boolean' },
  status: { column: 'status', type: 'enum', values: ['lead', 'customer'] },
  tags: { column: 'tags', type: 'array', of: 'text' },
  createdAt: { column: 'created_at', type: 'timestamptz' },
  birthday: { column: 'birthday', type: 'date', nullable: true },
  bio: { column: 'bio', type: 'text', sortable: false },
} as const;

const FIELDS = {
  ...COLUMN_FIELDS,
  emailCount: {
    aggregate: { relation: 'emails', fn: 'count' },
    type: 'bigint',
  },
  latestStart: {
    aggregate: { relation: 'workHistory', fn: 'max', column: 'start_date' },
    type: 'date',
  },
} as const;

const RELATIONS = {
  emails: {
    table: 'contact_emails',
    on: { contact_id: 'id' },
    fields: {
      email: { column: 'email', type: 'text' },
      primary: { column: 'is_primary', type: 'boolean' },
    },
  },
  workHistory: {
    table: 'work_history',
    on: { contact_id: 'id' },
    fields: {
      company: { column: 'company', type: 'text' },
      startDate: { column: 'start_date', type: 'date' },
    },
  },
} as const;

/** `like` search, range requests allowed, small default page. */
export const contacts = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: FIELDS,
  relations: RELATIONS,
  search: { mode: 'like', columns: ['first_name', 'last_name'] },
  page: { default: 5, max: 50, range: true },
});

/** Text search over the generated `tsvector` column; no range requests. */
export const searchable = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: FIELDS,
  relations: RELATIONS,
  search: { vector: 'search_vector', config: 'simple' },
  page: { default: 5, max: 50 },
});

/** Text search computed over columns, phrase mode, with the English configuration. */
export const phrased = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: COLUMN_FIELDS,
  search: { columns: ['first_name', 'bio'], mode: 'phrase', config: 'english' },
});

/** A composite key: the sort is total only with both columns. */
export const composite = defineKeyset({
  table: 'contacts',
  key: ['createdAt', 'id'],
  fields: FIELDS,
  relations: RELATIONS,
  sort: { default: ['-createdAt', '-id'] },
  page: { default: 4, max: 50, range: true },
});

/** Cursors that expire after a second; the secret still comes from the definer. */
export const expiring = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: COLUMN_FIELDS,
  cursor: { ttl: 1 },
});

const defineCamel = createDefineKeyset<CamelDB>({ cursor: { secret: SECRET } });

/** The same definition against the camelCase interface of a `CamelCasePlugin` application. */
export const camelContacts = defineCamel({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    firstName: { column: 'firstName', type: 'text' },
    lastName: {
      column: 'lastName',
      type: 'text',
      collation: 'insensitive',
      nullable: true,
    },
    age: { column: 'age', type: 'integer', nullable: true },
    createdAt: { column: 'createdAt', type: 'timestamptz' },
    emailCount: {
      aggregate: { relation: 'emails', fn: 'count' },
      type: 'bigint',
    },
  },
  relations: {
    emails: {
      table: 'contactEmails',
      on: { contactId: 'id' },
      fields: { email: { column: 'email', type: 'text' } },
    },
  },
  search: { mode: 'like', columns: ['firstName', 'lastName'] },
  page: { default: 5, max: 50, range: true },
});

const defineDrizzle = createDrizzleDefineKeyset(schema, {
  cursor: { secret: SECRET },
});

/** `COLUMN_FIELDS` over the Drizzle schema's properties. */
export const DRIZZLE_COLUMN_FIELDS = {
  ...COLUMN_FIELDS,
  firstName: { column: 'firstName', type: 'text' },
  lastName: { ...COLUMN_FIELDS.lastName, column: 'lastName' },
  createdAt: { column: 'createdAt', type: 'timestamptz' },
} as const;

const DRIZZLE_FIELDS = {
  ...DRIZZLE_COLUMN_FIELDS,
  emailCount: FIELDS.emailCount,
  latestStart: {
    aggregate: { relation: 'workHistory', fn: 'max', column: 'startDate' },
    type: 'date',
  },
} as const;

const DRIZZLE_RELATIONS = {
  emails: {
    table: 'contactEmails',
    on: { contactId: 'id' },
    fields: {
      email: { column: 'email', type: 'text' },
      primary: { column: 'isPrimary', type: 'boolean' },
    },
  },
  workHistory: {
    table: 'workHistory',
    on: { contactId: 'id' },
    fields: {
      company: { column: 'company', type: 'text' },
      startDate: { column: 'startDate', type: 'date' },
    },
  },
} as const;

/** The keysets above, through `@nizam-os/drizzle-keyset`. */
export const drizzleKeysets = {
  contacts: defineDrizzle({
    table: 'contacts',
    key: ['id'],
    fields: DRIZZLE_FIELDS,
    relations: DRIZZLE_RELATIONS,
    search: { mode: 'like', columns: ['firstName', 'lastName'] },
    page: { default: 5, max: 50, range: true },
  }),
  searchable: defineDrizzle({
    table: 'contacts',
    key: ['id'],
    fields: DRIZZLE_FIELDS,
    relations: DRIZZLE_RELATIONS,
    search: { vector: 'searchVector', config: 'simple' },
    page: { default: 5, max: 50 },
  }),
  phrased: defineDrizzle({
    table: 'contacts',
    key: ['id'],
    fields: DRIZZLE_COLUMN_FIELDS,
    search: {
      columns: ['firstName', 'bio'],
      mode: 'phrase',
      config: 'english',
    },
  }),
  composite: defineDrizzle({
    table: 'contacts',
    key: ['createdAt', 'id'],
    fields: DRIZZLE_FIELDS,
    relations: DRIZZLE_RELATIONS,
    sort: { default: ['-createdAt', '-id'] },
    page: { default: 4, max: 50, range: true },
  }),
};
