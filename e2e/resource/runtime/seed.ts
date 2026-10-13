/**
 * What the contacts application's database holds for the runtime's tests
 * (resource SPEC 12, 18.7), on PGlite and on the server alike: the roles
 * boot's tests connect as, and the seed, which the database's owner writes
 * and reads past row security. Acme (organization 1) has Ada, who has a
 * meeting, and an archived contact; Globex (organization 2) has Grace.
 */
import type { DomainEvent } from '@nizam-os/resource-core/server';

import type { RuntimeDatabase } from './database.ts';

/** The outbox table of `V15__outbox.sql`. */
export const OUTBOX = 'outbox';

export const ADA = '00000000-0000-4000-8000-000000000001';
export const GRACE = '00000000-0000-4000-8000-000000000002';
/** A key with hex letters, which a client may spell in upper case (RFC 9562 section 4). */
export const ARCHIVED = '00000000-0000-4000-8000-00000000000a';

/** The roles a database creates: the application's, and two boot's tests connect as. */
export type Role = 'app' | 'bypass' | 'owner';

type Row = Readonly<Record<string, unknown>>;

/** What runs as the database's owner. */
export interface Owner {
  readonly exec: (script: string) => Promise<void>;
  readonly query: (
    sql: string,
    parameters?: ReadonlyArray<string>,
  ) => Promise<ReadonlyArray<Row>>;
}

/** Empties every table and the outbox, then writes the organizations, their contacts, and Ada's meeting. */
export const SEED = [
  `truncate table organizations, ${OUTBOX} restart identity cascade`,
  "insert into organizations (name, slug, handle) values ('Acme', 'acme', 'acme'), ('Globex', 'globex', 'globex')",
  `insert into contacts (id, organization_id, name, email, status) values
    ('${ADA}', 1, 'Ada', 'ada@example.com', 'active'),
    ('${GRACE}', 2, 'Grace', 'grace@example.com', 'active'),
    ('${ARCHIVED}', 1, 'Old Name', null, 'archived')`,
  `insert into meetings (organization_id, contact_id, room, during)
    values (1, '${ADA}', 'a-1', '[2026-01-05 09:00+00,2026-01-05 10:00+00)')`,
].join(';\n');
const EVENTS = `select name, version, payload::text as payload from ${OUTBOX} order by position`;
const COUNT =
  'select count(*)::int as "count" from contacts where organization_id = $1::int8';

function eventOf(row: Row): DomainEvent {
  const { name, version, payload } = row;
  if (
    typeof name !== 'string' ||
    typeof version !== 'number' ||
    typeof payload !== 'string'
  ) {
    throw new TypeError('the outbox returned a row of another shape');
  }
  const parsed: unknown = JSON.parse(payload);
  return { name, version, payload: parsed };
}

/**
 * The roles by their names, each with `login` after its attributes. Each
 * may read and write every table but the outbox, which it may only insert
 * into, as `@nizam-os/kysely-resource` advises: an event holds any tenant's
 * data, and the identity column needs no sequence grant. `bypass` also has
 * BYPASSRLS, and `owner` owns `calls`.
 * @ref https://www.postgresql.org/docs/18/sql-createtable.html#SQL-CREATETABLE-PARMS-GENERATED-IDENTITY
 */
export function roleStatements(
  names: Readonly<Record<Role, string>>,
  login: string,
): ReadonlyArray<string> {
  const roles: ReadonlyArray<Role> = ['app', 'bypass', 'owner'];
  return [
    `create role ${names.app} ${login}`,
    `create role ${names.bypass} bypassrls ${login}`,
    `create role ${names.owner} ${login}`,
    ...roles.flatMap((role) => [
      `grant select, insert, update, delete on all tables in schema public to ${names[role]}`,
      `revoke select, update, delete on ${OUTBOX} from ${names[role]}`,
    ]),
    `alter table calls owner to ${names.owner}`,
  ];
}

/** What reads and writes the database as its owner. */
export function ownerSide(
  owner: Owner,
): Pick<RuntimeDatabase, 'exec' | 'reset' | 'events' | 'contacts'> {
  return {
    exec: owner.exec,
    reset: async () => owner.exec(SEED),
    events: async () => (await owner.query(EVENTS)).map((row) => eventOf(row)),
    contacts: async (organization) => {
      const [row] = await owner.query(COUNT, [String(organization)]);
      return Number(row?.['count']);
    },
  };
}
