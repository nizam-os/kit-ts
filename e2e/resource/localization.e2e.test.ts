/**
 * Localization through Paraglide (resource SPEC 10, 15.4): the contacts
 * application's messages, compiled by the Paraglide CLI in the package's
 * `build` and mapped with `defineMessages`, served by a Hono application
 * whose JSON:API errors `localizeErrors` rewrites in the locale
 * `paraglideMiddleware` resolved from `Accept-Language`. The package's type
 * check accepts the mapping against the compiled declarations; here `tsc`
 * refuses a message whose variables in one locale do not fit its kind.
 */
import { rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { app, closeContacts } from './localization/app.ts';
import { parseDiagnostics } from './support/diagnostics';
import { compileMessages, copyProject } from './support/paraglide';
import { PACKAGE_DIR } from './support/paths';
import { binPath, runBin } from './support/run-bin';

// Every project copy, removed afterwards.
const scratch: Array<string> = [];

afterAll(async () => {
  await closeContacts();
  await Promise.all(
    scratch.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }),
  );
});

async function post(
  path: string,
  language: string,
  body: unknown,
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: {
      'Accept-Language': language,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

const TOO_LONG = {
  data: {
    type: 'contacts',
    attributes: { name: 'x'.repeat(201), kind: 'robot' },
  },
};

describe('the mapping, type-checked against the compiled messages', () => {
  it("fails when one locale's message names a variable its kind does not receive", async () => {
    const dir = await copyProject('de', (messages) => ({
      ...messages,
      validation_max_length: '{field} darf höchstens {count} Zeichen haben.',
    }));
    scratch.push(dir);
    await compileMessages(dir);
    await writeFile(
      join(dir, 'check.ts'),
      [
        "import type { IssueInputs, Message } from '@nizam-os/resource-core';",
        "import { m } from './paraglide/messages.js';",
        "export const minLength: Message<IssueInputs['minLength']> = m.validation_min_length;",
        "export const maxLength: Message<IssueInputs['maxLength']> = m.validation_max_length;",
        '',
      ].join('\n'),
    );
    await writeFile(
      join(dir, 'tsconfig.json'),
      // The package's own config excludes `.tmp`, where this copy lives.
      JSON.stringify({
        extends: '../../tsconfig.json',
        include: ['./check.ts'],
        exclude: [],
      }),
    );
    const run = await runBin(
      await binPath('typescript', 'tsc'),
      ['--noEmit', '--pretty', 'false', '-p', join(dir, 'tsconfig.json')],
      PACKAGE_DIR,
    );
    const diagnostics = parseDiagnostics(run.stdout);
    expect(diagnostics.map(({ file, line }) => [file, line])).toStrictEqual([
      [join(relative(PACKAGE_DIR, dir), 'check.ts'), 4],
    ]);
    expect(diagnostics[0]?.text).toContain("Property 'count' is missing");
  });
});

describe('responses in the negotiated locale', () => {
  it('answers a 422 in German, every item from its issue kind, member, and options', async () => {
    const response = await post('/contacts', 'de', TOO_LONG);
    expect(response.status).toBe(422);
    expect(response.headers.get('Content-Language')).toBe('de');
    expect(response.headers.get('Vary')).toContain('Accept-Language');
    expect(await response.json()).toStrictEqual({
      errors: [
        {
          status: '422',
          code: 'VALIDATION_FAILED',
          title: 'Validierung fehlgeschlagen',
          detail: 'Art muss einer dieser Werte sein: Person, Firma.',
          source: { pointer: '/data/attributes/kind' },
          meta: { code: 'enum', expected: '["person","company"]' },
        },
        {
          status: '422',
          code: 'VALIDATION_FAILED',
          title: 'Validierung fehlgeschlagen',
          detail: 'Name darf höchstens 200 Zeichen lang sein.',
          source: { pointer: '/data/attributes/name' },
          meta: { code: 'maxLength', expected: '200' },
        },
      ],
    });
  });

  it('answers in the language the client weights highest, with its plural forms', async () => {
    const empty = { data: { type: 'contacts', attributes: { name: '' } } };
    const response = await post('/contacts', 'de;q=0.5, en;q=0.9', empty);
    expect(response.headers.get('Content-Language')).toBe('en');
    expect(await response.json()).toMatchObject({
      errors: [
        {
          title: 'Validation Failed',
          detail: 'Name must be at least 1 character long.',
        },
      ],
    });
  });

  it('falls back to the base locale for a language it does not have, and matches a regional tag', async () => {
    const french = await post('/contacts', 'fr-CA, fr;q=0.8', TOO_LONG);
    const austrian = await post('/contacts', 'de-AT', TOO_LONG);
    expect(french.headers.get('Content-Language')).toBe('en');
    expect(await french.json()).toMatchObject({
      errors: [{}, { detail: 'Name must be at most 200 characters long.' }],
    });
    expect(austrian.headers.get('Content-Language')).toBe('de');
  });

  it("answers a 409 with the code's own texts, labeling its members", async () => {
    const response = await post('/contacts/taken', 'de', {});
    expect(response.status).toBe(409);
    expect(await response.json()).toStrictEqual({
      errors: [
        {
          status: '409',
          code: 'CONTACT_EMAIL_TAKEN',
          title: 'E-Mail vergeben',
          detail: 'E-Mail gehört bereits einem anderen Kontakt.',
          source: { pointer: '/data/attributes/email' },
        },
      ],
    });
  });

  it('answers a 404 in German', async () => {
    const response = await app.request('/contacts/7', {
      headers: { 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toStrictEqual({
      errors: [
        {
          status: '404',
          code: 'NOT_FOUND',
          title: 'Nicht gefunden',
          detail: 'Die Ressource existiert nicht.',
        },
      ],
    });
  });
});
