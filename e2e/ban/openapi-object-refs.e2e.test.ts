import type {
  ErrorItem,
  ErrorStatusCode,
  JsonSchema,
} from '@nizam-os/hono-ban';

import type { RunningServer } from './support/server';

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBan } from '@nizam-os/hono-ban';
import {
  JSON_API_CONTENT_TYPE,
  jsonApi,
  responseStatus,
} from '@nizam-os/hono-ban/formats/json-api';
import { errorObjectSchemas, errorResponses } from '@nizam-os/hono-ban/openapi';

import { documentValidator } from './support/openapi-document';
import { startServer } from './support/server';

/**
 * Error documents that combine entries, described through error objects
 * the served OpenAPI 3.1 document holds once in `components.schemas` (SPEC
 * 9, 7.2.4). Two JSON:API routes declare the same errors with
 * `errorResponses(ban, codes, { objectRef })`, the objects are registered
 * with `registerComponent`, and each route really throws every
 * combination of the errors. Each body fetched over HTTP must validate
 * (Ajv 2020-12, strict) against its status's schema with the references
 * resolved in the served document.
 */

const ERRORS = {
  QUERY_INVALID: { status: 400, title: 'Query Invalid' },
  QUERY_UNKNOWN: { status: 400, title: 'Query Unknown' },
  ID_REFUSED: { status: 403, title: 'Id Refused' },
  TYPE_CONFLICT: { status: 409, title: 'Type Conflict' },
  STORE_DOWN: { status: 503, title: 'Store Down' },
} as const;
type Code = keyof typeof ERRORS;
const CODES = Object.keys(ERRORS) as ReadonlyArray<Code>;
const ROUTES = ['/reports', '/exports'];

const ban = createBan({
  errors: ERRORS,
  format: jsonApi({ mixedEntries: true }),
});
const componentName = (key: string): string => `Error.${key}`;
const objectRef = (key: string): string =>
  `#/components/schemas/${componentName(key)}`;

function isCode(value: string): value is Code {
  return Object.hasOwn(ERRORS, value);
}

function item(code: Code): ErrorItem {
  const { status, title } = ERRORS[code];
  return {
    status,
    code,
    title,
    detail: `${code} happened`,
    location: 'query',
    path: ['fail'],
  };
}

const app = new OpenAPIHono();
app.onError(ban.onError());
for (const [key, schema] of Object.entries(errorObjectSchemas(ban, CODES))) {
  app.openAPIRegistry.registerComponent('schemas', componentName(key), schema);
}
for (const path of ROUTES) {
  app.openapi(
    createRoute({
      method: 'get',
      path,
      request: { query: z.object({ fail: z.string() }) },
      responses: {
        200: { description: 'Never sent' },
        ...errorResponses(ban, CODES, { objectRef }),
      },
    }),
    (c) => {
      const codes = c.req
        .valid('query')
        .fail.split(',')
        .filter((value) => isCode(value));
      const errors = codes.map((code) => item(code));
      const [only] = codes;
      throw codes.length === 1 && only !== undefined
        ? ban.error(only, { errors })
        : ban.fromStatus(responseStatus(errors) as ErrorStatusCode, {
            errors,
          });
    },
  );
}
app.doc31('/doc', {
  openapi: '3.1.0',
  info: { title: 'Reports', version: '1' },
});

interface ServedDocument extends Readonly<Record<string, unknown>> {
  readonly components: {
    readonly schemas: Readonly<Record<string, JsonSchema>>;
  };
}

/** Every non-empty subset, each in catalog order. */
function subsets<T>(values: ReadonlyArray<T>): Array<Array<T>> {
  const all: Array<Array<T>> = [[]];
  for (const value of values) {
    for (const subset of all.slice()) {
      all.push([...subset, value]);
    }
  }
  return all.filter((subset) => subset.length > 0);
}

describe('combined error documents through referenced error objects', () => {
  let server: RunningServer;
  let document: ServedDocument;
  let validator: ReturnType<typeof documentValidator>;

  beforeAll(async () => {
    server = await startServer(app);
    const res = await server.fetch('/doc');
    expect(res.status).toBe(200);
    document = (await res.json()) as ServedDocument;
    validator = documentValidator(document);
  });
  afterAll(async () => {
    await server.close();
  });

  it('holds each error object once, in components, and every route references them', () => {
    expect(document.components.schemas).toEqual(
      Object.fromEntries(
        Object.entries(errorObjectSchemas(ban, CODES)).map(([key, schema]) => [
          componentName(key),
          schema,
        ]),
      ),
    );
    const text = JSON.stringify(document);
    for (const code of CODES) {
      expect(text.split(`"code":{"const":"${code}"}`)).toHaveLength(2);
    }
  });

  it.each(
    ROUTES.flatMap((path) =>
      subsets(CODES).map((codes) => [path, codes.join(','), codes] as const),
    ),
  )(
    'GET %s?fail=%s matches the schema of its status',
    async (path, fail, codes) => {
      const res = await server.fetch(`${path}?fail=${fail}`);
      expect(res.headers.get('content-type')).toBe(JSON_API_CONTENT_TYPE);
      const body = (await res.json()) as {
        errors: ReadonlyArray<{ code: string }>;
      };
      expect(body.errors.map((object) => object.code)).toEqual(codes);
      const validate = validator([
        'paths',
        path,
        'get',
        'responses',
        String(res.status),
        'content',
        JSON_API_CONTENT_TYPE,
        'schema',
      ]);
      expect(validate(body)).toEqual([]);
      expect(
        validate({ errors: [{ ...body.errors[0], code: 'FOREIGN' }] }),
      ).not.toEqual([]);
    },
  );
});
