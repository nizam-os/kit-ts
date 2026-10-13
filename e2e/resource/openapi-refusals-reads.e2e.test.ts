/**
 * Every refusal of a read by the contacts application's API is one its
 * OpenAPI document lists (resource SPEC 13.1): over Hono and
 * `@nizam-os/hono-jsonapi`, with the runtime on PGlite, the status of each
 * is documented for the operation, its code is among the codes that
 * response lists, and its body passes that response's schema: the
 * authentication's `UNAUTHORIZED` (`codes.all`), negotiation,
 * `parseQuery`, the keyset plan, the policies of the operation and of an
 * include, and rows the actor cannot see. A get answers `parseQuery`'s
 * page and sort codes too, which the document lists on it.
 * @ref https://jsonapi.org/format/1.1/#fetching
 * @ref https://jsonapi.org/format/1.1/#query-parameters
 */
import type { ApiSession } from './support/api-session.ts';
import type { Request } from './support/http.ts';
import type { Refusal } from './support/refusals.ts';

import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { ADA, GRACE } from './runtime/seed.ts';
import { openApiSession } from './support/api-session.ts';
import {
  CONTACT,
  CONTACTS,
  expectRefusal,
  MISSING,
} from './support/refusals.ts';

const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const NOT_ACCEPTABLE = 406;
const VIEWER: Request = { actor: 'viewer' };

function list(
  name: string,
  query: string,
  status: number,
  code: string,
  request?: Request,
): Refusal {
  const url = `${CONTACTS}${query}`;
  return {
    name,
    method: 'get',
    path: CONTACTS,
    url,
    request: request ?? VIEWER,
    status,
    code,
  };
}

function get(
  name: string,
  url: string,
  status: number,
  code: string,
  request?: Request,
): Refusal {
  const path = url.startsWith('/api/calls/') ? '/api/calls/{id}' : CONTACT;
  return {
    name,
    method: 'get',
    path,
    url,
    request: request ?? VIEWER,
    status,
    code,
  };
}

const REFUSALS: ReadonlyArray<Refusal> = [
  list('a list without a member', '', UNAUTHORIZED, 'UNAUTHORIZED', {}),
  list('a list by a member the policy denies', '', FORBIDDEN, 'FORBIDDEN', {
    actor: 'stranger',
  }),
  list(
    'a list in a media type with an unknown extension',
    '',
    NOT_ACCEPTABLE,
    'NOT_ACCEPTABLE',
    {
      actor: 'viewer',
      accept: 'application/vnd.api+json; ext="https://example.com/ext"',
    },
  ),
  list(
    'a sort by an undeclared field',
    '?sort=nickname',
    BAD_REQUEST,
    'UNSUPPORTED_SORT',
  ),
  list(
    'a page above the maximum',
    '?page[size]=1000',
    BAD_REQUEST,
    'MAX_PAGE_SIZE_EXCEEDED',
  ),
  list(
    'an empty page',
    '?page[size]=0',
    BAD_REQUEST,
    'INVALID_QUERY_PARAMETER',
  ),
  list(
    'a filter the field does not declare',
    '?filter[nickname][eq]=x',
    BAD_REQUEST,
    'INVALID_QUERY_PARAMETER',
  ),
  list(
    "a filter value outside the field's type",
    '?filter[priority][gte]=high',
    BAD_REQUEST,
    'INVALID_QUERY_PARAMETER',
  ),
  list(
    'a forged cursor',
    '?page[after]=forged',
    BAD_REQUEST,
    'INVALID_QUERY_PARAMETER',
  ),
  list(
    'a range of cursors',
    '?page[after]=a&page[before]=b',
    BAD_REQUEST,
    'RANGE_PAGINATION_NOT_SUPPORTED',
  ),
  list(
    'an unknown parameter',
    '?color=red',
    BAD_REQUEST,
    'UNKNOWN_QUERY_PARAMETER',
  ),
  list(
    'an include the policy denies',
    '?include=organization',
    FORBIDDEN,
    'FORBIDDEN',
  ),
  get('a missing contact', `/api/contacts/${MISSING}`, NOT_FOUND, 'NOT_FOUND'),
  get(
    "another organization's contact",
    `/api/contacts/${GRACE}`,
    NOT_FOUND,
    'NOT_FOUND',
  ),
  get(
    'a get the policy denies',
    `/api/contacts/${ADA}`,
    NOT_FOUND,
    'NOT_FOUND',
    {
      actor: 'stranger',
    },
  ),
  get(
    'a get with an include the policy denies',
    `/api/contacts/${ADA}?include=organization`,
    FORBIDDEN,
    'FORBIDDEN',
  ),
  get(
    'a get with a page above the maximum',
    `/api/contacts/${ADA}?page[size]=1000`,
    BAD_REQUEST,
    'MAX_PAGE_SIZE_EXCEEDED',
  ),
  get(
    'a get with an undeclared sort',
    `/api/contacts/${ADA}?sort=nickname`,
    BAD_REQUEST,
    'UNSUPPORTED_SORT',
  ),
  get('a missing call', `/api/calls/${MISSING}`, NOT_FOUND, 'NOT_FOUND'),
];

describe('every refusal of a read is one the OpenAPI document lists', () => {
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
});
