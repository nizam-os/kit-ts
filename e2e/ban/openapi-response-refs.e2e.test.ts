import type { ErrorItem, ErrorStatusCode } from '@nizam-os/hono-ban';

import type { RunningServer } from './support/server';

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBan } from '@nizam-os/hono-ban';
import {
  JSON_API_CONTENT_TYPE,
  jsonApi,
  responseStatus,
} from '@nizam-os/hono-ban/formats/json-api';
import {
  errorObjectSchemas,
  errorResponseObjects,
  errorResponses,
} from '@nizam-os/hono-ban/openapi';

import { documentValidator } from './support/openapi-document';
import { startServer } from './support/server';

/**
 * Error responses the served OpenAPI 3.1 document holds once in
 * `components.responses` (SPEC 9): two JSON:API routes declare the same
 * errors with `errorResponses(ban, codes, { objectRef, responseRef })`,
 * the lone responses and the error objects are registered with
 * `registerComponent`, and each route really throws every combination of
 * the errors. A status that carries one code references that code's
 * response, a status that carries several keeps its response inline, and
 * each body fetched over HTTP must validate (Ajv 2020-12, strict) against
 * its status's schema, through the response's reference when it has one.
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
const RESPONSES = '#/components/responses/';

const ban = createBan({
  errors: ERRORS,
  format: jsonApi({ mixedEntries: true }),
});
const componentName = (key: string): string => `Error.${key}`;
const objectRef = (key: string): string =>
  `#/components/schemas/${componentName(key)}`;
const responseRef = (key: string): string =>
  `${RESPONSES}${componentName(key)}`;

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
for (const [key, response] of Object.entries(
  errorResponseObjects(ban, CODES, { objectRef }),
)) {
  app.openAPIRegistry.registerComponent(
    'responses',
    componentName(key),
    response,
  );
}
for (const path of ROUTES) {
  app.openapi(
    createRoute({
      method: 'get',
      path,
      request: { query: z.object({ fail: z.string() }) },
      responses: {
        200: { description: 'Never sent' },
        ...errorResponses(ban, CODES, { objectRef, responseRef }),
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

/** A response of the served document: inline, or a reference to a component. */
interface ServedResponse {
  readonly $ref?: string;
}

interface ServedDocument extends Readonly<Record<string, unknown>> {
  readonly paths: Readonly<
    Record<
      string,
      {
        readonly get: {
          readonly responses: Readonly<Record<string, ServedResponse>>;
        };
      }
    >
  >;
  readonly components: {
    readonly responses: Readonly<Record<string, unknown>>;
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

describe('error responses through referenced lone responses', () => {
  let server: RunningServer;
  let document: ServedDocument;
  let validator: ReturnType<typeof documentValidator>;

  /** The JSON Pointer segments of the schema of `status` on `path`, through the response's reference when it has one. */
  function schemaAt(path: string, status: string): Array<string> {
    const ref = document.paths[path]?.get.responses[status]?.$ref;
    const at =
      ref === undefined
        ? ['paths', path, 'get', 'responses', status]
        : ['components', 'responses', ref.slice(RESPONSES.length)];
    return [...at, 'content', JSON_API_CONTENT_TYPE, 'schema'];
  }

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

  it('holds each lone response once, in components, and the routes reference it', () => {
    expect(document.components.responses).toEqual(
      Object.fromEntries(
        Object.entries(errorResponseObjects(ban, CODES, { objectRef })).map(
          ([key, response]) => [componentName(key), response],
        ),
      ),
    );
    for (const path of ROUTES) {
      expect(document.paths[path]?.get.responses).toMatchObject({
        '403': { $ref: responseRef('ID_REFUSED') },
        '409': { $ref: responseRef('TYPE_CONFLICT') },
        '503': { $ref: responseRef('STORE_DOWN') },
      });
      // 400 carries every 4xx code and 500 every code, so both stay inline.
      expect(document.paths[path]?.get.responses['400']).toHaveProperty(
        'content',
      );
      expect(document.paths[path]?.get.responses['500']).toHaveProperty(
        'content',
      );
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
      const validate = validator(schemaAt(path, String(res.status)));
      expect(validate(body)).toEqual([]);
      expect(
        validate({ errors: [{ ...body.errors[0], code: 'FOREIGN' }] }),
      ).not.toEqual([]);
    },
  );
});
