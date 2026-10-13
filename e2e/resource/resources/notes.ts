/**
 * Notes, whose public names need the options of resource SPEC 4: `type`
 * is renamed with `as`, since every resource object has a `type`; the
 * `author` foreign key has no `_id` to drop, so its relationship takes
 * `as`; the `contact` field, renamed `contactName`, leaves `contact` to
 * the relationship over `contact_id`; and `notes_priorität_check` derives
 * a code outside A-Z, so the declaration gives one. `priorität` keeps its
 * public name, a JSON:API member name but no `@nizam-os/keyset-core` field
 * name, so nothing filters or sorts by it (SPEC 11.2).
 */
import { Contacts } from './contacts.ts';
import { declareResource } from './declare-resource.ts';
import { Organizations } from './organizations.ts';

export const Notes = declareResource('notes', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'organization',
  fields: {
    type: { access: 'immutable', as: 'kind', filter: ['eq', 'in'] },
    contact: { access: 'readWrite', as: 'contactName' },
    body: { access: 'readWrite' },
    priorität: { access: 'readWrite' },
    created_at: { access: 'read', sort: true },
  },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
    author: { target: () => Contacts, access: 'immutable', as: 'author' },
    contact_id: { target: () => Contacts, access: 'readWrite' },
  },
  sort: { default: [{ field: 'created_at', direction: 'desc' }] },
  rules: {
    notes_priorität_check: { code: 'NOTE_PRIORITY_OUT_OF_RANGE' },
  },
});
