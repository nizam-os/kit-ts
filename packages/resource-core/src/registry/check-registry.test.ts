import { describe, expect, it } from 'vitest';

import { errorCatalog } from '../errors/error-catalog';
import {
  Contacts,
  contactsWith,
  declare,
  Meetings,
  Organizations,
} from '../test-support/registry';

/** `errorCatalog` with its types erased, as JavaScript calls it. */
const untypedCatalog = errorCatalog as (
  resources: unknown,
  appErrors?: unknown,
) => unknown;

function refusal(...conflicts: Array<string>): TypeError {
  return new TypeError(`errorCatalog: ${conflicts.join('; ')}`);
}

describe('registry checks: the list (SPEC 4.2, 14)', () => {
  it('takes only an array of resources declareResource returned', () => {
    expect(() => untypedCatalog({ Contacts })).toThrow(
      new TypeError(
        'errorCatalog.resources: must be an array of declared resources',
      ),
    );
    expect(() => untypedCatalog([Organizations, { ...Contacts }])).toThrow(
      new TypeError(
        'errorCatalog.resources[1]: must be a resource declareResource returned',
      ),
    );
  });

  it("takes the application's codes as an object of @nizam-os/ban-core error definitions", () => {
    expect(() => untypedCatalog([], 'SEAT_LIMIT')).toThrow(
      new TypeError(
        'errorCatalog.appErrors: must be an object of error definitions, received "SEAT_LIMIT"',
      ),
    );
    const definition =
      'must be an error definition of @nizam-os/ban-core: a 4xx or 5xx status, and title, code, type, and description strings when given';
    for (const entry of [
      { status: 301 },
      { status: '402' },
      { status: 402, title: 7 },
      null,
    ]) {
      expect(() => untypedCatalog([], { SEAT_LIMIT: entry })).toThrow(
        new TypeError(`errorCatalog.appErrors.SEAT_LIMIT: ${definition}`),
      );
    }
  });
});

describe('registry checks: conflicts (SPEC 4.2)', () => {
  it('refuses a resource listed twice, and two resources of one type', () => {
    const Clients = declare('organizations', {
      as: 'contacts',
      operations: ['get'],
      fields: {},
    });
    expect(() => errorCatalog([Organizations, Contacts, Contacts])).toThrow(
      refusal('contacts is listed twice'),
    );
    expect(() => errorCatalog([Organizations, Contacts, Clients])).toThrow(
      refusal(
        'type contacts is the type of two resources, over contacts and organizations',
      ),
    );
  });

  it('refuses a code two constraints derive, naming the resources and constraints behind it', () => {
    const Renamed = contactsWith({
      contacts_name_check: { code: 'SHORT_TEXT_CHECK' },
    });
    expect(() => errorCatalog([Organizations, Renamed])).toThrow(
      refusal(
        'code SHORT_TEXT_CHECK is derived by organizations from domain short_text.short_text_check and by contacts from contacts.contacts_name_check, so all but one need a code',
      ),
    );
  });

  it('lists three or more origins, and three or more resources of one origin, as a series', () => {
    const Renamed = contactsWith({
      contacts_name_check: { code: 'SHORT_TEXT_CHECK' },
    });
    const Booked = declare('meetings', {
      operations: ['get'],
      scope: 'organization',
      fields: { room: { access: 'read' }, attendees: { access: 'read' } },
      relationships: { contact_id: { target: () => Renamed, access: 'read' } },
      rules: { meetings_room_check: { code: 'SHORT_TEXT_CHECK' } },
    });
    const People = declare('contacts', {
      as: 'people',
      operations: ['get'],
      scope: 'organization',
      fields: { email: { access: 'read' } },
    });
    expect(() =>
      errorCatalog([Organizations, Renamed, Booked, People], {
        EMAIL_CHECK: { status: 422 },
      }),
    ).toThrow(
      refusal(
        'code SHORT_TEXT_CHECK is derived by organizations from domain short_text.short_text_check, by contacts from contacts.contacts_name_check, and by meetings from meetings.meetings_room_check, so all but one need a code',
        'code EMAIL_CHECK, derived by contacts, meetings, and people from domain email.email_check, is an application code, so the constraint needs a code',
      ),
    );
  });

  it('accepts a code several resources derive from one constraint', () => {
    expect(() =>
      errorCatalog([Organizations, Contacts, Meetings]),
    ).not.toThrow();
  });

  it('refuses a derived code that @nizam-os/ban-core, @nizam-os/jsonapi-core, resource-core, or the application already has', () => {
    const cases = [
      ['CONFLICT', 'a built-in code of @nizam-os/ban-core'],
      ['INVALID_DOCUMENT', 'a code of @nizam-os/jsonapi-core'],
      ['VALIDATION_FAILED', 'a built-in code of @nizam-os/ban-core'],
      ['QUOTA_EXCEEDED', "resource-core's own code"],
      ['SEAT_LIMIT', 'an application code'],
    ] as const;
    for (const [code, owner] of cases) {
      const Renamed = contactsWith({ contacts_email_unique: { code } });
      expect(() =>
        errorCatalog([Organizations, Renamed], {
          SEAT_LIMIT: { status: 402 },
        }),
      ).toThrow(
        refusal(
          `code ${code}, derived by contacts from contacts.contacts_email_unique, is ${owner}, so the constraint needs a code`,
        ),
      );
    }
  });

  it("refuses an application code that replaces resource-core's QUOTA_EXCEEDED", () => {
    expect(() => errorCatalog([], { QUOTA_EXCEEDED: { status: 429 } })).toThrow(
      refusal("appErrors.QUOTA_EXCEEDED replaces resource-core's own code"),
    );
  });

  it('refuses a relationship whose target is not listed', () => {
    expect(() => errorCatalog([Contacts])).toThrow(
      refusal(
        'relationship contacts.organization targets organizations, which is not listed',
      ),
    );
  });

  it('refuses a target that returns no declared resource, or the resource of another table', () => {
    const Lookalike = contactsWith({}, () => ({ ...Organizations }));
    const Elsewhere = contactsWith({}, () => Contacts);
    expect(() => errorCatalog([Organizations, Lookalike])).toThrow(
      refusal(
        'contacts.relationships.organization_id.target: must return the declared resource of organizations',
      ),
    );
    expect(() => errorCatalog([Organizations, Elsewhere])).toThrow(
      refusal(
        'contacts.relationships.organization_id.target: the target is a resource of contacts; the foreign key references organizations',
      ),
    );
  });

  it('lets an error a target throws, other than a TypeError, pass through', () => {
    const Broken = contactsWith({}, () => {
      throw new RangeError('not loaded');
    });
    expect(() => errorCatalog([Organizations, Broken])).toThrow(
      new RangeError('not loaded'),
    );
  });

  it('lists every conflict in one TypeError', () => {
    expect(() =>
      untypedCatalog([Contacts, Contacts], {
        QUOTA_EXCEEDED: { status: 403 },
      }),
    ).toThrow(
      refusal(
        'contacts is listed twice',
        "appErrors.QUOTA_EXCEEDED replaces resource-core's own code",
        'relationship contacts.organization targets organizations, which is not listed',
      ),
    );
  });
});
