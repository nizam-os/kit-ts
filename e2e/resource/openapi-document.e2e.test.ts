/**
 * The contacts application's OpenAPI document (resource SPEC 13.1),
 * through the built packages: an OpenAPI 3.1 document that an independent
 * validator of the OpenAPI Initiative's schema accepts, every `$ref`
 * resolved; the same document on every build; the application's codes on
 * the operations that raise them and on every operation for `codes.all`;
 * and in `components` once each resource's schemas, each error object a
 * response references, and each response a status of one code references.
 * `openapi-exchanges` holds a running API to it.
 * @ref https://spec.openapis.org/oas/v3.1.2.html
 * @ref https://github.com/seriousme/openapi-schema-validator
 */
import type { Sent } from './support/http.ts';
import type { Method } from './support/openapi-contract.ts';

import { Validator } from '@seriousme/openapi-schema-validator';
import { describe, expect, it } from 'vitest';

import { resourceDocument } from '@nizam-os/jsonapi-core';
import { openapi } from '@nizam-os/resource-core/openapi';

import { Calls } from './resources/calls.ts';
import { APP_RESOURCES } from './runtime/api.ts';
import { ADA } from './runtime/seed.ts';
import { APP_DOCUMENT, APP_DOCUMENT_OPTIONS } from './support/app-document.ts';
import { contractOf } from './support/openapi-contract.ts';

const METHODS: ReadonlySet<string> = new Set<Method>([
  'get',
  'post',
  'patch',
  'delete',
]);
const UNAUTHORIZED = 401;
const PAYMENT_REQUIRED = 402;
const FORBIDDEN = 403;
const CONFLICT = 409;
const ERROR_KEY = '_error.';
const ERROR_RESPONSE = /#\/components\/responses\/_error\.([A-Z0-9_]+)"/gu;
const ERROR_OBJECT = /#\/components\/schemas\/_error\.([A-Z0-9_]+)"/gu;
const JSON_API = 'application/vnd.api+json';
const CALL = '00000000-0000-4000-8000-00000000c001';
const NOT_FOUND: Sent = {
  status: 404,
  headers: new Headers(),
  mediaType: JSON_API,
  body: { errors: [{ status: '404', code: 'NOT_FOUND', title: 'Not Found' }] },
};

const contract = contractOf(APP_DOCUMENT);

/** The code of each error reference `pattern` finds in `node`, once. */
function codesIn(node: unknown, pattern: RegExp): Set<string | undefined> {
  return new Set(
    [...JSON.stringify(node).matchAll(pattern)].map(([, code]) => code),
  );
}

/** Every operation of the document as `[method, path]`. */
function operations(): Array<readonly [Method, string]> {
  return Object.entries(APP_DOCUMENT.paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((method): method is Method => METHODS.has(method))
      .map((method) => [method, path] as const),
  );
}

describe("the contacts application's OpenAPI document", () => {
  it('passes an independent validator, every $ref resolved', async () => {
    const validator = new Validator();
    const result = await validator.validate(
      JSON.parse(JSON.stringify(APP_DOCUMENT)) as Record<string, unknown>,
    );
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(validator.version).toBe('3.1');
    expect(JSON.stringify(validator.resolveRefs())).not.toContain('"$ref"');
  });

  it('is the same document on every build', () => {
    expect(JSON.stringify(openapi(APP_RESOURCES, APP_DOCUMENT_OPTIONS))).toBe(
      JSON.stringify(APP_DOCUMENT),
    );
  });

  it("lists the application's codes where its rules and its quota raise them", () => {
    expect(contract.codes('post', '/api/contacts', PAYMENT_REQUIRED)).toEqual([
      'PLAN_UPGRADE_REQUIRED',
    ]);
    expect(contract.codes('post', '/api/contacts', FORBIDDEN)).toContain(
      'QUOTA_EXCEEDED',
    );
    expect(contract.codes('patch', '/api/contacts/{id}', CONFLICT)).toContain(
      'CONTACT_ARCHIVED',
    );
    expect(contract.codes('post', '/api/calls', PAYMENT_REQUIRED)).toEqual([]);
    expect(contract.codes('post', '/api/calls', FORBIDDEN)).not.toContain(
      'QUOTA_EXCEEDED',
    );
  });

  it('lists the codes of codes.all on every operation', () => {
    const all = operations();
    expect(all).toHaveLength(38);
    for (const [method, path] of all) {
      expect(
        contract.codes(method, path, UNAUTHORIZED),
        `${method} ${path}`,
      ).toEqual(['UNAUTHORIZED']);
    }
  });

  it("holds each resource's schemas and each referenced error object once", () => {
    const keys = Object.keys(APP_DOCUMENT.components.schemas);
    const errors = keys
      .filter((key) => key.startsWith(ERROR_KEY))
      .map((key) => key.slice(ERROR_KEY.length));
    const { paths, components } = APP_DOCUMENT;
    const referenced = codesIn([paths, components.responses], ERROR_OBJECT);
    expect(new Set(errors)).toEqual(referenced);
    expect(errors).toHaveLength(referenced.size);
    expect(keys.filter((key) => !key.startsWith(ERROR_KEY))).toEqual([
      'organizations.resource',
      'organizations.identifier',
      'organizations.create',
      'organizations.update',
      'organizations.local',
      'organizations.atomic-add',
      'organizations.atomic-update',
      'contacts.resource',
      'contacts.identifier',
      'contacts.create',
      'contacts.update',
      'contacts.local',
      'contacts.atomic-add',
      'contacts.atomic-update',
      'meetings.resource',
      'meetings.identifier',
      'meetings.create',
      'meetings.update',
      'meetings.local',
      'meetings.atomic-add',
      'meetings.atomic-update',
      'notes.resource',
      'notes.identifier',
      'notes.create',
      'notes.update',
      'notes.local',
      'notes.atomic-add',
      'notes.atomic-update',
      'calls.resource',
      'calls.identifier',
      'calls.create',
      'calls.local',
      'calls.atomic-add',
    ]);
  });

  it('holds each response a status of one code references once', () => {
    const keys = Object.keys(APP_DOCUMENT.components.responses);
    const referenced = codesIn(APP_DOCUMENT.paths, ERROR_RESPONSE);
    expect(keys.every((key) => key.startsWith(ERROR_KEY))).toBe(true);
    expect(new Set(keys.map((key) => key.slice(ERROR_KEY.length)))).toEqual(
      referenced,
    );
    expect(referenced).toContain('NOT_FOUND');
  });

  it('refuses a code of the options that the catalog lacks', () => {
    expect(() =>
      openapi(APP_RESOURCES, {
        ...APP_DOCUMENT_OPTIONS,
        codes: { all: ['TEAPOT'] },
      }),
    ).toThrow(
      new TypeError(
        'openapi: codes: TEAPOT is not a code of the catalog; give it in appErrors',
      ),
    );
  });
});

describe('the contract the API is held to', () => {
  it('refuses a status, a media type, a body, or a code the document does not give', () => {
    const contact = '/api/contacts/{id}';
    expect(contract.response('get', contact, NOT_FOUND)).toEqual([]);
    expect(
      contract.response('get', contact, { ...NOT_FOUND, status: 418 }),
    ).toEqual(['get /api/contacts/{id} documents no 418']);
    expect(
      contract.response('get', contact, {
        ...NOT_FOUND,
        mediaType: 'application/json',
      }),
    ).toEqual(['404 documents no application/json']);
    expect(
      contract.response('get', contact, {
        ...NOT_FOUND,
        mediaType: undefined,
        body: undefined,
      }),
    ).toEqual(['404 has no body']);
    expect(
      contract.response('get', contact, {
        ...NOT_FOUND,
        body: {
          errors: [
            { status: '404', code: 'CONTACT_ARCHIVED', title: 'Not Found' },
          ],
        },
      }),
    ).toEqual([
      '/errors/0/code must be equal to constant',
      '404 does not list CONTACT_ARCHIVED',
    ]);
  });

  it("refuses a created resource without its Location or with another type's body", () => {
    const body = resourceDocument(Calls.resource, {
      id: CALL,
      minutes: 3,
      note: 'Hello.',
      contact: ADA,
    });
    const created: Sent = {
      status: 201,
      headers: new Headers({ Location: `/api/calls/${CALL}` }),
      mediaType: JSON_API,
      body,
    };
    expect(contract.response('post', '/api/calls', created)).toEqual([]);
    expect(
      contract.response('post', '/api/calls', {
        ...created,
        headers: new Headers(),
      }),
    ).toEqual(['/ must be string']);
    expect(
      contract.response('post', '/api/contacts', created).length,
    ).toBeGreaterThan(0);
  });
});
