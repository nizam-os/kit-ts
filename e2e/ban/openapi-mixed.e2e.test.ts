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
import { errorResponses } from '@nizam-os/hono-ban/openapi';

import { compileWithAjv } from './support/ajv';
import { startServer } from './support/server';

/**
 * Error documents that combine entries against the served OpenAPI 3.1
 * document (SPEC 7.2.4, 9). One JSON:API route declares its errors with
 * `errorResponses` and really throws every combination of them the way a
 * library that reports several problems does, `fromStatus` of
 * `responseStatus`: two codes of one status, client errors of several
 * statuses sent as 400, a server error among them sent as 500. Each body
 * fetched over HTTP must validate (Ajv 2020-12, strict) against the schema
 * the served document gives its status.
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

const ban = createBan({
  errors: ERRORS,
  format: jsonApi({ mixedEntries: true }),
});

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
app.openapi(
  createRoute({
    method: 'get',
    path: '/reports',
    request: { query: z.object({ fail: z.string() }) },
    responses: {
      200: { description: 'Never sent' },
      ...errorResponses(ban, CODES),
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
      : ban.fromStatus(responseStatus(errors) as ErrorStatusCode, { errors });
  },
);
app.doc31('/doc', {
  openapi: '3.1.0',
  info: { title: 'Reports', version: '1' },
});

interface ServedDocument {
  readonly paths: Readonly<
    Record<
      string,
      Readonly<
        Record<
          string,
          {
            readonly responses: Readonly<
              Record<
                string,
                {
                  readonly content: Readonly<
                    Record<string, { readonly schema: JsonSchema }>
                  >;
                }
              >
            >;
          }
        >
      >
    >
  >;
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

describe('combined error documents validate against the served 3.1 schemas', () => {
  let server: RunningServer;
  let document: ServedDocument;

  function served(status: number): JsonSchema {
    const schema =
      document.paths['/reports']?.['get']?.responses[String(status)]?.content[
        JSON_API_CONTENT_TYPE
      ]?.schema;
    if (schema === undefined) {
      throw new Error(`GET /reports declares no ${String(status)}`);
    }
    return schema;
  }

  beforeAll(async () => {
    server = await startServer(app);
    const res = await server.fetch('/doc');
    expect(res.status).toBe(200);
    document = (await res.json()) as ServedDocument;
  });
  afterAll(async () => {
    await server.close();
  });

  it('serves the responses errorResponses builds, unchanged', () => {
    const built = errorResponses(ban, CODES);
    expect(
      Object.keys(document.paths['/reports']?.['get']?.responses ?? {}),
    ).toEqual(['200', ...Object.keys(built)]);
    for (const [status, response] of Object.entries(built)) {
      expect(served(Number(status))).toEqual(
        response.content[JSON_API_CONTENT_TYPE]?.schema,
      );
    }
  });

  it.each(subsets(CODES).map((codes) => [codes.join(','), codes] as const))(
    'GET /reports?fail=%s matches the schema of its status',
    async (fail, codes) => {
      const res = await server.fetch(`/reports?fail=${fail}`);
      expect(res.headers.get('content-type')).toBe(JSON_API_CONTENT_TYPE);
      const body = (await res.json()) as {
        errors: ReadonlyArray<{ code: string }>;
      };
      expect(body.errors.map((object) => object.code)).toEqual(codes);
      expect(compileWithAjv(served(res.status))(body)).toEqual([]);
    },
  );
});
