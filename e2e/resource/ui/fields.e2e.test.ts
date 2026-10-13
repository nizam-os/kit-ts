/**
 * Field descriptors of the contacts application (resource SPEC 20.2):
 * `fieldsOf` from the built `@nizam-os/resource-ui`, over the
 * declarations of the realistic migrations, with the application's
 * Paraglide messages. The descriptors are built once, when this module
 * loads, as an application builds them at startup; each label is called
 * inside a request's locale, as Paraglide's middleware sets it on the
 * server, and renders in that request's language. Each filter takes the
 * control its column's type gives, with the operators the declaration
 * lists.
 * @ref https://paraglidejs.com/server-side-rendering
 */
import type { FieldDescriptor } from '@nizam-os/resource-ui';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { fieldsOf } from '@nizam-os/resource-ui';

import { contactMessages } from '../localization/contact-messages.ts';
import { Contacts } from '../resources/contacts.ts';
import { Organizations } from '../resources/organizations.ts';
import { inLocale } from '../support/in-locale.ts';

const contacts = fieldsOf(Contacts, contactMessages);
const organizations = fieldsOf(Organizations, contactMessages);

type Descriptors = Readonly<Record<string, FieldDescriptor>>;

/** Each descriptor's name and its label, rendered now. */
function labels(descriptors: Descriptors) {
  return Object.values(descriptors).map(({ name, label }) => [name, label()]);
}

/** The value and label, rendered now, of each option of the contacts' kind and status. */
function kindAndStatusOptions() {
  return [contacts.kind, contacts.status].map((descriptor) =>
    descriptor.options?.map(({ value, label }) => [value, label()]),
  );
}

/** Each descriptor's filter kind and operators, or `null`. */
function filters(descriptors: Descriptors) {
  return Object.fromEntries(
    Object.values(descriptors).map(({ name, filter }) => [
      name,
      filter === null ? null : [filter.kind, filter.operators],
    ]),
  );
}

/** The names of the members a create must carry. */
function required(descriptors: Descriptors) {
  return Object.values(descriptors)
    .filter((descriptor) => descriptor.required)
    .map(({ name }) => name);
}

describe('fieldsOf over the contacts application (resource SPEC 20.2)', () => {
  it('renders each label in the language of the request that calls it, from descriptors built once', async () => {
    expect(await inLocale('de', () => labels(contacts))).toEqual([
      ['kind', 'Art'],
      ['name', 'Name'],
      ['nickname', 'Spitzname'],
      ['email', 'E-Mail'],
      ['website', 'Website'],
      ['status', 'Status'],
      ['priority', 'Priorität'],
      ['discount', 'Rabatt'],
      ['tags', 'Schlagwörter'],
      ['createdAt', 'Erstellt am'],
      ['organization', 'Organisation'],
    ]);
    expect(await inLocale('en', () => labels(contacts))).toEqual([
      ['kind', 'Kind'],
      ['name', 'Name'],
      ['nickname', 'Nickname'],
      ['email', 'Email'],
      ['website', 'Website'],
      ['status', 'Status'],
      ['priority', 'Priority'],
      ['discount', 'Discount'],
      ['tags', 'Tags'],
      ['createdAt', 'Created at'],
      ['organization', 'Organization'],
    ]);
    expect(await inLocale('de', () => labels(organizations))).toEqual([
      ['name', 'Name'],
      ['slug', 'Kürzel'],
      ['handle', 'Handle'],
      ['seats', 'Plätze'],
      ['country', 'Land'],
      ['createdAt', 'Erstellt am'],
    ]);
  });

  it("renders each option of the enum and of the CHECK's list in the request's language", async () => {
    expect(await inLocale('de', kindAndStatusOptions)).toEqual([
      [
        ['person', 'Person'],
        ['company', 'Firma'],
      ],
      [
        ['active', 'Aktiv'],
        ['archived', 'Archiviert'],
      ],
    ]);
    expect(await inLocale('en', kindAndStatusOptions)).toEqual([
      [
        ['person', 'Person'],
        ['company', 'Company'],
      ],
      [
        ['active', 'Active'],
        ['archived', 'Archived'],
      ],
    ]);
  });

  it("gives each filter the control its column's type takes, with the declared operators", () => {
    expect(filters(contacts)).toEqual({
      kind: ['options', ['eq', 'in']],
      name: ['text', ['eq', 'startsWithi']],
      nickname: null,
      email: ['text', ['eq']],
      website: null,
      status: ['options', ['eq', 'in']],
      priority: ['number', ['gte', 'lte']],
      discount: null,
      tags: ['values', ['contains', 'overlaps']],
      createdAt: ['date', ['gte', 'lt']],
      organization: null,
    });
    expect(filters(organizations)).toEqual({
      name: ['text', ['eq', 'containsi']],
      slug: ['text', ['eq']],
      handle: ['text', ['eq']],
      seats: ['number', ['gte', 'lte']],
      country: ['text', ['eq', 'in']],
      createdAt: null,
    });
  });

  it('requires on a create only what PostgreSQL has no value for: a NOT NULL column without a default that the client writes', () => {
    expect(required(contacts)).toEqual(['name']);
    expect(required(organizations)).toEqual(['name', 'slug']);
  });

  it('types the descriptors by the public names', () => {
    expectTypeOf<keyof typeof contacts>().toEqualTypeOf<
      | 'kind'
      | 'name'
      | 'nickname'
      | 'email'
      | 'website'
      | 'status'
      | 'priority'
      | 'discount'
      | 'tags'
      | 'createdAt'
      | 'organization'
    >();
    expectTypeOf(contacts.createdAt.name).toEqualTypeOf<'createdAt'>();
  });
});
