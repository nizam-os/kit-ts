/**
 * Runtime-neutral checks (resource SPEC 15.4, 16) over the built
 * `@nizam-os/resource-core`: the contacts application's declarations load,
 * resolve, and derive their public names, the codecs and validators parse
 * their fixtures with the application's Zod, the composed schemas parse
 * and report issues, the field metadata describes the members and its
 * patterns compile with the flags `su`, the error catalog assembles and
 * renders through `@nizam-os/ban-core`, an error document is localized with
 * messages of the application's own, the derived JSON:API resource parses
 * a query whose sort the derived keyset plans, with cursors signed and
 * verified by the runtime's Web Crypto, and mistakes throw the documented
 * `TypeError`s.
 * Codes are upper-cased by the runtime's `String.prototype.toUpperCase`, so
 * each runtime derives them here. No Node.js API, so the same module runs
 * on Bun, Deno, and workerd.
 */
import type { FieldMeta } from '@nizam-os/resource-core';

import type { Checks } from './report.ts';

import { createBan, fromRequest } from '@nizam-os/ban-core';
import { jsonApi } from '@nizam-os/ban-core/formats/json-api';
import { ERROR_CATALOG, parseQuery } from '@nizam-os/jsonapi-core';
import { createDefineKeyset } from '@nizam-os/keyset-core';
import {
  createDeclareResource,
  defaultMessages,
  defineMessages,
  defineValidator,
  errorCatalog,
  localizeErrors,
} from '@nizam-os/resource-core';

import { catalog } from '../fixtures/contacts/catalog.ts';
import { Contacts } from '../resources/contacts.ts';
import { declareResource } from '../resources/declare-resource.ts';
import { Meetings } from '../resources/meetings.ts';
import { Notes } from '../resources/notes.ts';
import { Organizations } from '../resources/organizations.ts';
import { validators } from '../resources/validators.ts';
import { check } from './report.ts';

const CURSOR_SECRET = 'a smoke-test cursor secret of at least 32 bytes';

/** The `TypeError` message of calling `fn` with `args` as JavaScript would, types erased. */
function messageOf(
  fn: (...args: never) => unknown,
  args: ReadonlyArray<unknown>,
): string {
  try {
    Reflect.apply(fn, undefined, args);
  } catch (error) {
    if (error instanceof TypeError) {
      return error.message;
    }
    throw error;
  }
  return 'no TypeError';
}

export const neutralChecks: Checks = {
  'declares the contacts application': () => {
    // Typed wide, so each comparison tests the runtime value, not the literal type.
    const table: string = Contacts.table;
    const codec: string = Meetings.declaration.fields.during.codec;
    check(table === 'contacts', `table ${table}`);
    check(Object.isFrozen(Meetings.declaration), 'declaration not frozen');
    check(codec === 'timeRange', `codec ${codec}`);
  },
  'resolves relationship targets lazily': () => {
    check(
      Meetings.declaration.relationships.contact_id.target() === Contacts,
      'contact_id target',
    );
    check(
      Contacts.declaration.relationships.organization_id.target() ===
        Organizations,
      'organization_id target',
    );
  },
  'derives the public names': () => {
    const kind = Notes.names.fields.get('kind');
    const created = Notes.names.columns.get('created_at');
    const code = Notes.names.rules.get('notes_type_check');
    check(kind === 'type', `kind ${String(kind)}`);
    check(created === 'createdAt', `created_at ${String(created)}`);
    check(code === 'NOTES_TYPE_CHECK', `notes_type_check ${String(code)}`);
  },
  'refuses a derived code outside A-Z': () => {
    const message = messageOf(declareResource, [
      'notes',
      { operations: ['get'], fields: { priorität: { access: 'read' } } },
    ]);
    check(
      message ===
        'notes.rules.notes_priorität_check: code "NOTES_PRIORITÄT_CHECK" is not A-Z, 0-9, _; set code',
      message,
    );
  },
  'checks a validator against its fixtures': () => {
    const message = messageOf(defineValidator, [
      {
        schema: validators.lowercase.schema,
        fixtures: { accept: ['lobby'], reject: ['lobby-2'] },
      },
    ]);
    check(
      message ===
        'defineValidator.fixtures.reject[0]: the schema accepts this fixture',
      message,
    );
  },
  'refuses a written CHECK without a validator': () => {
    const message = messageOf(declareResource, [
      'meetings',
      { operations: ['create'], fields: { room: { access: 'immutable' } } },
    ]);
    check(
      message ===
        'meetings.rules.meetings_room_lowercase: a CHECK without a rule needs a validator',
      message,
    );
  },
  'parses a create and reports issues on public names': () => {
    const ok = Contacts.validate.create['~standard'].validate({ name: 'Ada' });
    check(!('issues' in ok && ok.issues !== undefined), 'Ada refused');
    const refused = Contacts.validate.create['~standard'].validate({
      name: 'Ada',
      priority: 9,
    });
    const issue = 'issues' in refused ? refused.issues?.[0] : undefined;
    check(
      issue?.code === 'maximum' &&
        issue.path.join('/') === 'priority' &&
        issue.expected === '5',
      JSON.stringify(issue),
    );
  },
  'runs a CHECK spanning a field and a relationship': () => {
    const result = Meetings.write.update['~standard'].validate({
      attributes: { notes: null },
      relationships: { contact: null },
    });
    const codes =
      'issues' in result
        ? (result.issues ?? []).map((issue) => issue.code).join(',')
        : '';
    check(
      codes === 'MEETING_NEEDS_CONTACT_OR_NOTES,MEETING_NEEDS_CONTACT_OR_NOTES',
      codes,
    );
  },
  'describes the members in field metadata': () => {
    // Typed wide, so each comparison tests the runtime value, not the literal type.
    const name: FieldMeta = Contacts.fields.name;
    const during: FieldMeta = Meetings.fields.during;
    const { website, organization } = Contacts.fields;
    const patterns = website.limits.patterns.map(
      (source) => new RegExp(source, 'su'),
    );
    const matches = (text: string): boolean =>
      patterns.every((pattern) => pattern.test(text));
    check(name.required && name.limits.maxLength === 200, JSON.stringify(name));
    check(
      patterns.length === 1 &&
        matches('https://example.org') &&
        !matches('http://example.org'),
      website.limits.patterns.join(','),
    );
    check(
      organization.wire === 'string' && organization.format === 'int64',
      JSON.stringify(organization),
    );
    check(during.codec === 'timeRange', `codec ${String(during.codec)}`);
    check(Object.isFrozen(Contacts.fields), 'fields not frozen');
  },
  'assembles the error catalog and renders a derived code': () => {
    const codes = errorCatalog([Organizations, Contacts, Meetings, Notes]);
    const ban = createBan({
      format: jsonApi(),
      errors: { ...ERROR_CATALOG, ...codes },
    });
    const rendered = ban.render(ban.error('MEETING_ROOM_DOUBLE_BOOKED'));
    const domain = Object.hasOwn(codes, 'EMAIL_CHECK');
    check(rendered.status === 409, `status ${String(rendered.status)}`);
    check(domain, 'no EMAIL_CHECK');
    check(Object.isFrozen(codes), 'catalog not frozen');
  },
  'localizes a derived code with the messages of its constraint kind':
    async () => {
      const resources = [Organizations, Contacts, Meetings, Notes] as const;
      const english = defaultMessages(resources);
      const messages = defineMessages(
        resources,
        {},
        {
          ...english,
          constraints: {
            ...english.constraints,
            exclusion: {
              title: () => 'Konflikt',
              detail: ({ fields }) => `${fields}: bereits belegt.`,
            },
          },
        },
      );
      const ban = createBan({
        format: jsonApi(),
        errors: { ...ERROR_CATALOG, ...errorCatalog(resources) },
      });
      const handle = ban.handler({
        transform: localizeErrors(messages, { resource: () => 'meetings' }),
      });
      const response = await handle(
        ban.error('MEETING_ROOM_DOUBLE_BOOKED'),
        fromRequest(new Request('https://api.test/meetings')),
        null,
      );
      const text = JSON.stringify(await response.json());
      check(response.status === 409, `status ${String(response.status)}`);
      check(text.includes('"title":"Konflikt"'), text);
      check(text.includes('"detail":"Room, During: bereits belegt."'), text);
    },
  'derives a resource and a keyset whose cursors round-trip': async () => {
    const query = parseQuery(
      Contacts.resource,
      'filter[status][in]=active&sort=-createdAt&page[size]=1',
    );
    const keyset = createDefineKeyset({ cursor: { secret: CURSOR_SECRET } })(
      Contacts.keyset,
    );
    const request = {
      filter: { field: 'status', op: 'in', value: ['active'] },
      sort: query.sort,
      page: { size: query.page?.size },
    } as const;
    const plan = await keyset.plan(request);
    const order = plan.sort
      .map(
        ({ field, direction }) => `${direction === 'desc' ? '-' : ''}${field}`,
      )
      .join();
    check(order === '-createdAt,id', order);
    const rows = [
      { id: 'c2', createdAt: '2026-10-10 12:00:00+00' },
      { id: 'c1', createdAt: '2026-10-09 12:00:00+00' },
    ];
    const page = await keyset.page(plan, rows, (row) => [
      row.createdAt,
      row.id,
    ]);
    check(page.rows.length === 1 && page.next !== null, 'no next cursor');
    const next = await keyset.plan({
      ...request,
      page: { size: 1, after: page.next },
    });
    check(next.seek.length > 0, 'the cursor gave no seek');
  },
  'refuses a list without a relationship target': () => {
    const message = messageOf(errorCatalog, [[Contacts]]);
    check(
      message ===
        'errorCatalog: relationship contacts.organization targets organizations, which is not listed',
      message,
    );
  },
  'refuses the full catalog': () => {
    const message = messageOf(createDeclareResource, [{ catalog }]);
    check(
      message.startsWith('createDeclareResource.catalog: a full catalog'),
      message,
    );
  },
};
