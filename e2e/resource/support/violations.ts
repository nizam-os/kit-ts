/**
 * One statement per derived code of the contacts application's resources
 * (resource SPEC 9.1, 15.4): an insert of a valid row with one value
 * changed so that PostgreSQL refuses it with that code's constraint. The
 * seed holds what a duplicate, a missing reference, and an overlap need.
 * Values are SQL literals written here, never input.
 */
import type { DeclaredResource } from '@nizam-os/resource-core';

import { Contacts } from '../resources/contacts.ts';
import { Meetings } from '../resources/meetings.ts';
import { Notes } from '../resources/notes.ts';
import { Organizations } from '../resources/organizations.ts';

const ADA = "'00000000-0000-4000-8000-000000000001'";
const NOBODY = "'00000000-0000-4000-8000-0000000000ff'";
const NINE_TO_TEN = "'[2026-01-05 09:00+00,2026-01-05 10:00+00)'";

/** The rows every violation refuses against: organization 1, its contact Ada, and her meeting 1 in room a-1. */
export const SEED: ReadonlyArray<string> = [
  "insert into organizations (name, slug, handle) values ('Acme', 'acme', 'acme')",
  `insert into contacts (id, organization_id, name, email) values (${ADA}, 1, 'Ada', 'ada@example.com')`,
  `insert into meetings (organization_id, contact_id, room, during) values (1, ${ADA}, 'a-1', ${NINE_TO_TEN})`,
];

/** A valid row of each table, as SQL literals by column. */
const VALID: ReadonlyMap<
  DeclaredResource,
  Readonly<Record<string, string>>
> = new Map<DeclaredResource, Readonly<Record<string, string>>>([
  [Organizations, { name: "'Other'", slug: "'other'" }],
  [Contacts, { organization_id: '1', name: "'Bea'" }],
  [
    Meetings,
    {
      organization_id: '1',
      room: "'b-1'",
      during: NINE_TO_TEN,
      notes: "'Lobby'",
    },
  ],
  [Notes, { organization_id: '1', type: "'call'", body: "'Called'" }],
]);

/** A derived code and the insert PostgreSQL refuses with its constraint. */
export interface Violation {
  readonly resource: DeclaredResource;
  readonly code: string;
  readonly sql: string;
}

function violation(
  resource: DeclaredResource,
  code: string,
  changes: Readonly<Record<string, string>>,
): Violation {
  const row = { ...VALID.get(resource), ...changes };
  const columns = Object.keys(row).map((column) => `"${column}"`);
  return {
    resource,
    code,
    sql: `insert into ${resource.table} (${columns.join(', ')}) values (${Object.values(row).join(', ')})`,
  };
}

export const VIOLATIONS: ReadonlyArray<Violation> = [
  violation(Organizations, 'ORGANIZATION_HANDLE_TAKEN', { handle: "'acme'" }),
  violation(Organizations, 'ORGANIZATIONS_SEATS_CHECK', { seats: '0' }),
  violation(Organizations, 'ORGANIZATIONS_SLUG_CHECK', { slug: "'An Org'" }),
  violation(Organizations, 'ORGANIZATION_SLUG_TAKEN', { slug: "'acme'" }),
  violation(Organizations, 'ORGANIZATIONS_NAME_NOT_NULL', { name: 'null' }),
  violation(Organizations, 'ORGANIZATIONS_SLUG_NOT_NULL', { slug: 'null' }),
  violation(Organizations, 'ORGANIZATIONS_SEATS_NOT_NULL', { seats: 'null' }),
  violation(Organizations, 'SHORT_TEXT_CHECK', { name: "''" }),
  violation(Organizations, 'COUNTRY_CODE_CHECK', { country: "'de'" }),
  violation(Organizations, 'HANDLE_CHECK', { handle: "'Acme'" }),
  // citext compares case-insensitively, so the unique key refuses another case.
  violation(Contacts, 'CONTACT_EMAIL_TAKEN', { email: "'ADA@example.com'" }),
  violation(Contacts, 'CONTACTS_NAME_CHECK', { name: "''" }),
  violation(Contacts, 'CONTACTS_NICKNAME_CHECK', { nickname: "''" }),
  violation(Contacts, 'CONTACTS_PRIORITY_CHECK', { priority: '9' }),
  violation(Contacts, 'CONTACTS_STATUS_CHECK', { status: "'gone'" }),
  violation(Contacts, 'CONTACTS_WEBSITE_CHECK', {
    website: "'http://example.com'",
  }),
  // The partial unique index holds among active contacts, and Ada is one.
  violation(Contacts, 'CONTACT_NAME_TAKEN', { name: "'Ada'" }),
  violation(Contacts, 'CONTACTS_KIND_NOT_NULL', { kind: 'null' }),
  violation(Contacts, 'CONTACT_NAME_REQUIRED', { name: 'null' }),
  violation(Contacts, 'CONTACTS_STATUS_NOT_NULL', { status: 'null' }),
  violation(Contacts, 'CONTACTS_TAGS_NOT_NULL', { tags: 'null' }),
  violation(Contacts, 'EMAIL_CHECK', { email: "'ada.example.com'" }),
  violation(Contacts, 'PERCENTAGE_CHECK', { discount: '101' }),
  violation(Meetings, 'MEETINGS_CONTACT_ID_FKEY', { contact_id: NOBODY }),
  violation(Meetings, 'MEETING_NEEDS_CONTACT_OR_NOTES', { notes: 'null' }),
  violation(Meetings, 'MEETING_ROOM_DOUBLE_BOOKED', { room: "'a-1'" }),
  violation(Meetings, 'MEETINGS_PKEY', { id: '1' }),
  violation(Meetings, 'MEETING_ROOM_NOT_LOWERCASE', { room: "'B-1'" }),
  violation(Meetings, 'MEETINGS_ROOM_NOT_NULL', { room: 'null' }),
  violation(Meetings, 'MEETINGS_DURING_NOT_NULL', { during: 'null' }),
  violation(Notes, 'NOTES_AUTHOR_FKEY', { author: NOBODY }),
  violation(Notes, 'NOTES_BODY_CHECK', { body: "''" }),
  violation(Notes, 'NOTES_CONTACT_ID_FKEY', { contact_id: NOBODY }),
  violation(Notes, 'NOTE_PRIORITY_OUT_OF_RANGE', { priorität: '9' }),
  violation(Notes, 'NOTES_TYPE_CHECK', { type: "'fax'" }),
  violation(Notes, 'NOTES_TYPE_NOT_NULL', { type: 'null' }),
  violation(Notes, 'NOTES_BODY_NOT_NULL', { body: 'null' }),
];
