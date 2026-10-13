/**
 * Every refusal of a write by the contacts application's API is one its
 * OpenAPI document lists (resource SPEC 13.1): over Hono and
 * `@nizam-os/hono-jsonapi`, with the runtime on PGlite, the status of each
 * is documented for the operation, its code is among the codes that
 * response lists, and its body passes that response's schema: negotiation,
 * the request document, the declaration's schemas, the policies, the
 * application's rules and quota, and the database's constraints, on
 * contacts; `openapi-refusals-calls` holds calls, and
 * `openapi-refusals-members` the members a write does not accept. A
 * request document the server refuses as such fails the documented request
 * schema, and one refused for anything else passes it
 * (`support/refusals.ts`).
 * @ref https://jsonapi.org/format/1.1/#crud
 */
import type { ApiSession } from './support/api-session.ts';
import type { Refusal } from './support/refusals.ts';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ADA, ARCHIVED } from './runtime/seed.ts';
import { openApiSession } from './support/api-session.ts';
import {
  CONTACT,
  CONTACTS,
  contact,
  expectRefusal,
  MISSING,
  update,
} from './support/refusals.ts';

const BAD_REQUEST = 400;
const PAYMENT_REQUIRED = 402;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const UNSUPPORTED_MEDIA_TYPE = 415;
const UNPROCESSABLE = 422;
const CREATED = 201;

function create(
  name: string,
  body: object,
  status: number,
  code: string,
  actor = 'editor',
): Refusal {
  return {
    name,
    method: 'post',
    path: CONTACTS,
    url: CONTACTS,
    request: { actor, body },
    status,
    code,
  };
}

function patch(
  name: string,
  id: string,
  body: object,
  status: number,
  code: string,
  actor = 'editor',
): Refusal {
  const url = `/api/contacts/${id}`;
  return {
    name,
    method: 'patch',
    path: CONTACT,
    url,
    request: { actor, body },
    status,
    code,
  };
}

function remove(
  name: string,
  id: string,
  status: number,
  code: string,
  actor = 'editor',
): Refusal {
  const url = `/api/contacts/${id}`;
  return {
    name,
    method: 'delete',
    path: CONTACT,
    url,
    request: { actor },
    status,
    code,
  };
}

const REFUSALS: ReadonlyArray<Refusal> = [
  {
    ...create(
      'a create sent as plain JSON',
      contact({ name: 'Bea' }),
      UNSUPPORTED_MEDIA_TYPE,
      'UNSUPPORTED_MEDIA_TYPE',
    ),
    request: {
      actor: 'editor',
      body: contact({ name: 'Bea' }),
      contentType: 'application/json',
    },
  },
  {
    ...create('a create that is not JSON', {}, BAD_REQUEST, 'MALFORMED_JSON'),
    request: { actor: 'editor', raw: '{"data":' },
  },
  create('a create without data', {}, BAD_REQUEST, 'INVALID_DOCUMENT'),
  create(
    'a create of another type',
    { data: { type: 'people', attributes: { name: 'Bea' } } },
    CONFLICT,
    'CONFLICT',
  ),
  create(
    "a create with the client's id",
    contact({ name: 'Bea' }, { id: MISSING }),
    FORBIDDEN,
    'CLIENT_GENERATED_ID_NOT_SUPPORTED',
  ),
  create(
    'a create with a name too long',
    contact({ name: 'x'.repeat(201) }),
    UNPROCESSABLE,
    'VALIDATION_FAILED',
  ),
  create(
    'a create without the required name',
    contact({ email: 'bea@example.com' }),
    UNPROCESSABLE,
    'VALIDATION_FAILED',
  ),
  create(
    'a create with a website outside its CHECK',
    contact({ name: 'Bea', website: 'http://bea.example' }),
    UNPROCESSABLE,
    'VALIDATION_FAILED',
  ),
  create(
    'a create the policy denies',
    contact({ name: 'Bea' }),
    FORBIDDEN,
    'FORBIDDEN',
    'viewer',
  ),
  create(
    "a company on a plan without companies (the application's rule)",
    contact({ name: 'Co', kind: 'company' }),
    PAYMENT_REQUIRED,
    'PLAN_UPGRADE_REQUIRED',
  ),
  create(
    'a create with an email taken (a unique constraint)',
    contact({ name: 'Bea', email: 'ada@example.com' }),
    CONFLICT,
    'CONTACT_EMAIL_TAKEN',
  ),
  patch(
    "a rename of an archived contact (the application's rule)",
    ARCHIVED,
    update(ARCHIVED, { name: 'New Name' }),
    CONFLICT,
    'CONTACT_ARCHIVED',
  ),
  patch(
    'an update whose id differs from the URL',
    ADA,
    update(ARCHIVED, { nickname: 'Countess' }),
    CONFLICT,
    'CONFLICT',
  ),
  patch(
    'an update of a missing contact',
    MISSING,
    update(MISSING, { nickname: 'Countess' }),
    NOT_FOUND,
    'NOT_FOUND',
  ),
  patch(
    'an update the policy denies',
    ADA,
    update(ADA, { nickname: 'Countess' }),
    NOT_FOUND,
    'NOT_FOUND',
    'viewer',
  ),
  patch(
    'an update outside the options',
    ADA,
    update(ADA, { status: 'gone' }),
    UNPROCESSABLE,
    'VALIDATION_FAILED',
  ),
  remove(
    'a remove that breaks a referencing row (ON DELETE SET NULL against a CHECK)',
    ADA,
    CONFLICT,
    'CONFLICT',
  ),
  remove('a remove of a missing contact', MISSING, NOT_FOUND, 'NOT_FOUND'),
  remove('a remove the policy denies', ADA, NOT_FOUND, 'NOT_FOUND', 'viewer'),
];

describe('every refusal of a write is one the OpenAPI document lists', () => {
  let session: ApiSession;

  beforeAll(async () => {
    session = await openApiSession();
  });
  beforeEach(async () => {
    await session.database.reset();
  });
  afterAll(async () => {
    await session.database.close();
  });

  it.each(REFUSALS)('$name', async (refusal) => {
    await expectRefusal(session, refusal);
  });

  it('a contact beyond the quota of the plan', async () => {
    const third = await session.exchange('post', CONTACTS, CONTACTS, {
      actor: 'editor',
      body: contact({ name: 'Bea' }),
    });
    expect(third.status).toBe(CREATED);
    await expectRefusal(
      session,
      create(
        'the fourth',
        contact({ name: 'Cy' }),
        FORBIDDEN,
        'QUOTA_EXCEEDED',
      ),
    );
  });

  it('a rename to the name of another active contact (a partial unique index)', async () => {
    await session.exchange('post', CONTACTS, CONTACTS, {
      actor: 'editor',
      body: contact({ name: 'Bea' }),
    });
    await expectRefusal(
      session,
      patch(
        'the rename',
        ADA,
        update(ADA, { name: 'Bea' }),
        CONFLICT,
        'CONTACT_NAME_TAKEN',
      ),
    );
  });
});
