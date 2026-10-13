/**
 * A Hono application localized end to end with Paraglide (resource SPEC
 * 10.4): `paraglideMiddleware` resolves each request's locale from
 * `Accept-Language`, `localizeErrors` rewrites the JSON:API error document
 * with the Paraglide messages, which read that locale, and the error
 * handler names it in `Content-Language` and varies on `Accept-Language`.
 * The 422 carries resource issues as `@nizam-os/jsonapi-core` items do
 * (SPEC 9.3); the 409 is what `constraintError` makes of PostgreSQL's
 * refusal of a contact whose email another contact has (SPEC 9.5), on
 * PGlite with the contacts application's schema and seed.
 * @ref https://paraglidejs.com/getting-started/standalone-servers
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-8.5
 * @packageDocumentation
 */

import type { Context } from 'hono';

import type { ErrorItem } from '@nizam-os/hono-ban';
import type { ResourceIssue } from '@nizam-os/resource-core';

import type { OracleDatabase } from '../support/oracle-database.ts';

import { Hono } from 'hono';

import { createBan } from '@nizam-os/hono-ban';
import { jsonApi } from '@nizam-os/hono-ban/formats/json-api';
import { ERROR_CATALOG } from '@nizam-os/jsonapi-core';
import { errorCatalog, localizeErrors } from '@nizam-os/resource-core';
import { constraintError } from '@nizam-os/resource-core/server';

import { Contacts } from '../resources/contacts.ts';
import { CONTACTS_SCHEMA, openPglite } from '../support/oracle-database.ts';
import { SEED, VIOLATIONS } from '../support/violations.ts';
import { contactMessages, RESOURCES } from './contact-messages.ts';
import { getLocale } from './paraglide/runtime.js';
import { paraglideMiddleware } from './paraglide/server.js';

const ban = createBan({
  errors: { ...ERROR_CATALOG, ...errorCatalog(RESOURCES) },
  format: jsonApi({ mixedEntries: true, includeId: false }),
});

const handle = ban.onError({
  // The resource type is the first path segment, as in a JSON:API URL design.
  transform: localizeErrors(contactMessages, {
    resource: (c: Context) => c.req.path.split('/')[1],
  }),
});

function itemOf(issue: ResourceIssue): ErrorItem {
  return {
    detail: issue.message,
    path: ['data', 'attributes', ...issue.path],
    reason: issue.code,
    ...(issue.expected === undefined ? {} : { expected: issue.expected }),
  };
}

function attributesOf(document: unknown): unknown {
  const data: unknown =
    typeof document === 'object' && document !== null
      ? Reflect.get(document, 'data')
      : undefined;
  return typeof data === 'object' && data !== null
    ? Reflect.get(data, 'attributes')
    : undefined;
}

/** An insert of a contact whose email Ada, of the seed, has in another case. */
function takenEmail(): string {
  const taken = VIOLATIONS.find(({ code }) => code === 'CONTACT_EMAIL_TAKEN');
  if (taken === undefined) {
    throw new Error('support/violations.ts has no CONTACT_EMAIL_TAKEN');
  }
  return taken.sql;
}

const TAKEN = takenEmail();

let contacts: Promise<OracleDatabase> | undefined;

async function openContacts(): Promise<OracleDatabase> {
  const database = await openPglite(CONTACTS_SCHEMA);
  for (const sql of SEED) {
    await database.query(sql);
  }
  return database;
}

/** Closes the contacts database, when a request opened it. */
export async function closeContacts(): Promise<void> {
  await (await contacts)?.close();
}

export const app = new Hono();

app.use('*', async (c, next) =>
  paraglideMiddleware(c.req.raw, async () => {
    await next();
    return c.res;
  }),
);

app.post('/contacts', async (c) => {
  const attributes = attributesOf(await c.req.json());
  const result = Contacts.validate.create['~standard'].validate(attributes);
  if (result.issues !== undefined) {
    throw ban.error('VALIDATION_FAILED', {
      errors: result.issues.map((issue) => itemOf(issue)),
    });
  }
  return c.body(null, 204);
});

app.post('/contacts/taken', async () => {
  contacts ??= openContacts();
  const database = await contacts;
  try {
    await database.query(TAKEN);
  } catch (error) {
    throw (
      constraintError(error, { resource: Contacts, operation: 'create' }) ??
      error
    );
  }
  throw new Error('PostgreSQL accepted a contact whose email is taken');
});

app.get('/contacts/:id', () => {
  throw ban.error('NOT_FOUND');
});

app.onError(async (error, c) => {
  const response = await handle(error, c);
  response.headers.set('Content-Language', getLocale());
  response.headers.append('Vary', 'Accept-Language');
  return response;
});
